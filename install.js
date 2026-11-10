#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

/**
 * Resolves the platform-appropriate state/backup directory outside Antigravity's install folder
 * so OS installers/updaters (NSIS, DMG, deb/rpm) never collide with extra backup files.
 */
function resolvePatchStateDir() {
    const home = os.homedir();
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        return path.join(localAppData, 'antigravity-rtl-patch');
    }
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'antigravity-rtl-patch');
    }
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    return path.join(xdgData, 'antigravity-rtl-patch');
}

/**
 * Returns candidate paths for Antigravity's app.asar across Windows, macOS, and Linux.
 */
function getCandidateAsarPaths() {
    const home = os.homedir();
    const candidates = [];

    // 1. CLI flag --asar-path <path> or env override
    const flagIdx = process.argv.indexOf('--asar-path');
    if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
        candidates.push(path.resolve(process.argv[flagIdx + 1]));
    }
    if (process.env.ANTIGRAVITY_ASAR_PATH) {
        candidates.push(path.resolve(process.env.ANTIGRAVITY_ASAR_PATH));
    }

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        candidates.push(path.join(localAppData, 'Programs', 'antigravity', 'resources', 'app.asar'));
        if (process.env.PROGRAMFILES) {
            candidates.push(path.join(process.env.PROGRAMFILES, 'Antigravity', 'resources', 'app.asar'));
        }
        if (process.env['PROGRAMFILES(X86)']) {
            candidates.push(path.join(process.env['PROGRAMFILES(X86)'], 'Antigravity', 'resources', 'app.asar'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Antigravity.app/Contents/Resources/app.asar');
        candidates.push(path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'));
    } else {
        // Linux standard install locations
        candidates.push('/opt/Antigravity/resources/app.asar');
        candidates.push('/opt/antigravity/resources/app.asar');
        candidates.push('/usr/lib/antigravity/resources/app.asar');
        candidates.push('/usr/share/antigravity/resources/app.asar');
        candidates.push(path.join(home, '.local', 'share', 'antigravity', 'resources', 'app.asar'));
    }

    return candidates;
}

function resolveAsarPath() {
    const candidates = getCandidateAsarPaths();
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}

const STATE_DIR = resolvePatchStateDir();
const BACKUP_DIR = path.join(STATE_DIR, 'backups');
const ASAR_PATH = resolveAsarPath();
const RESOURCES_DIR = path.dirname(ASAR_PATH);
const LEGACY_BACKUP_PATH = path.join(RESOURCES_DIR, 'app.asar.backup');

const PATCH_START_MARKER = '/* === AG_RTL_PATCH_START === */';
const PATCH_END_MARKER = '/* === AG_RTL_PATCH_END === */';
const ORIG_META_REGEX = /\/\* AG_RTL_ORIG:(\d+):(\d+):(\d+) \*\//;
const LEGACY_MARKER = 'ag-rtl-controls';

const BLOCK_SIZE = 4 * 1024 * 1024; // 4MB ASAR integrity block size

function alignInt(i, alignment) {
    return i + ((alignment - (i % alignment)) % alignment);
}

function computeIntegrity(buffer) {
    const fileHash = crypto.createHash('SHA256').update(buffer).digest('hex');
    const blocks = [];
    for (let offset = 0; offset < buffer.length; offset += BLOCK_SIZE) {
        const slice = buffer.subarray(offset, Math.min(offset + BLOCK_SIZE, buffer.length));
        blocks.push(crypto.createHash('SHA256').update(slice).digest('hex'));
    }
    if (blocks.length === 0) {
        blocks.push(crypto.createHash('SHA256').update(Buffer.alloc(0)).digest('hex'));
    }
    return {
        algorithm: 'SHA256',
        hash: fileHash,
        blockSize: BLOCK_SIZE,
        blocks,
    };
}

/**
 * Parses an ASAR archive buffer in memory without touching @electron/asar's buggy filesystemCache
 * or extracting unpacked files to disk.
 */
function parseAsarBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 16) {
        throw new Error('Invalid or truncated ASAR buffer (size < 16 bytes).');
    }
    const sizePicklePayload = buf.readUInt32LE(0);
    if (sizePicklePayload !== 4) {
        throw new Error(`Invalid ASAR size pickle header: expected 4, got ${sizePicklePayload}`);
    }
    const headerSize = buf.readUInt32LE(4);
    const jsonByteLength = buf.readInt32LE(12);
    const payloadOffset = 8 + headerSize;

    if (payloadOffset > buf.length || 16 + jsonByteLength > payloadOffset) {
        throw new Error('Corrupted ASAR header bounds.');
    }

    const headerString = buf.subarray(16, 16 + jsonByteLength).toString('utf8');
    const header = JSON.parse(headerString);
    const payload = buf.subarray(payloadOffset);

    return { header, headerString, headerSize, payloadOffset, payload };
}

function encodeAsarHeaderPrefix(headerObj) {
    const jsonStr = JSON.stringify(headerObj);
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const alignedJsonLen = alignInt(jsonBuf.length, 4);
    const headerPayloadSize = 4 + alignedJsonLen;
    const headerSize = 4 + headerPayloadSize;

    const prefix = Buffer.alloc(8 + headerSize, 0);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(headerSize, 4);
    prefix.writeUInt32LE(headerPayloadSize, 8);
    prefix.writeInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(prefix, 16);

    return prefix;
}

function readPackedFile(parsedAsar, relPathParts) {
    let node = parsedAsar.header;
    for (const part of relPathParts) {
        if (!node || !node.files || !node.files[part]) {
            throw new Error(`File not found in ASAR header: ${relPathParts.join('/')}`);
        }
        node = node.files[part];
    }
    if (node.unpacked) {
        throw new Error(`File is marked unpacked: ${relPathParts.join('/')}`);
    }
    const offset = Number(BigInt(node.offset));
    const size = node.size;
    if (offset < 0 || offset + size > parsedAsar.payload.length) {
        throw new Error(`Corrupted file bounds in ASAR for ${relPathParts.join('/')} (offset=${offset}, size=${size}, payload=${parsedAsar.payload.length})`);
    }
    return {
        node,
        offset,
        size,
        buffer: parsedAsar.payload.subarray(offset, offset + size),
    };
}

/**
 * Strips any existing RTL patch (new marker-based or legacy) from utils.js code.
 */
function stripExistingPatch(utilsCode) {
    let code = utilsCode;

    // 1. Strip marker-based patch block if present
    while (code.includes(PATCH_START_MARKER) && code.includes(PATCH_END_MARKER)) {
        const startIdx = code.indexOf(PATCH_START_MARKER);
        const endIdx = code.indexOf(PATCH_END_MARKER) + PATCH_END_MARKER.length;
        let cutEnd = endIdx;
        while (cutEnd < code.length && (code[cutEnd] === '\r' || code[cutEnd] === '\n' || code[cutEnd] === ' ')) {
            cutEnd++;
        }
        code = code.slice(0, startIdx) + code.slice(cutEnd);
    }

    // 2. Strip legacy un-marked patch block if present
    if (code.includes(LEGACY_MARKER)) {
        const loadUrlIdx = code.lastIndexOf('void win.loadURL(url);');
        const legacyStart = code.indexOf("win.webContents.on('did-finish-load', () => {");
        if (legacyStart !== -1 && loadUrlIdx !== -1 && legacyStart < loadUrlIdx) {
            const sub = code.slice(legacyStart, loadUrlIdx);
            if (sub.includes(LEGACY_MARKER)) {
                code = code.slice(0, legacyStart) + code.slice(loadUrlIdx);
            }
        }
    }

    return code;
}

/**
 * Extracts the clean, unpatched base state of the ASAR archive even if it was already patched.
 * Because we append patched dist/utils.js at the end of the payload while keeping the original
 * dist/utils.js untouched at its original offset, the archive is 100% self-recoverable!
 */
function getCleanBaseAsarState(buf) {
    const parsed = parseAsarBuffer(buf);
    const utilsTarget = readPackedFile(parsed, ['dist', 'utils.js']);
    const currentUtilsStr = utilsTarget.buffer.toString('utf8');
    const metaMatch = currentUtilsStr.match(ORIG_META_REGEX);

    if (metaMatch) {
        const origOffset = Number(metaMatch[1]);
        const origSize = Number(metaMatch[2]);
        const origPayloadLen = Number(metaMatch[3]);
        if (origOffset + origSize <= origPayloadLen && origPayloadLen <= parsed.payload.length) {
            const origUtilsBuf = parsed.payload.subarray(origOffset, origOffset + origSize);
            const origPayload = parsed.payload.subarray(0, origPayloadLen);
            return {
                header: parsed.header,
                utilsNode: utilsTarget.node,
                origOffset,
                origSize,
                origPayloadLen,
                origUtilsBuf,
                origUtilsStr: origUtilsBuf.toString('utf8'),
                origPayload,
                wasPatched: true,
            };
        }
    }

    // Either unpatched or legacy-patched in-place
    const cleanStr = stripExistingPatch(currentUtilsStr);
    const cleanBuf = Buffer.from(cleanStr, 'utf8');
    return {
        header: parsed.header,
        utilsNode: utilsTarget.node,
        origOffset: utilsTarget.offset,
        origSize: cleanBuf.length,
        origPayloadLen: parsed.payload.length,
        origUtilsBuf: cleanBuf,
        origUtilsStr: cleanStr,
        origPayload: parsed.payload,
        wasPatched: currentUtilsStr !== cleanStr,
    };
}

/**
 * Zero-Shift End-of-Payload Append Patcher:
 * Keeps all 765 original files (including the original dist/utils.js!) at their exact original
 * byte offsets in the payload, and appends the patched dist/utils.js at the end of the payload.
 * That way:
 *  1. All 347 unpacked:true files remain untouched.
 *  2. Even if Antigravity.exe is running while patching, every single file offset cached in the
 *     running process's memory remains valid at the exact same byte position on disk.
 *  3. Restoring (--restore) slices the appended bytes off and restores the bit-for-bit identical original app.asar.
 */
function buildPatchedAsarBuffer(buf, makeInjectionCodeFn) {
    const base = getCleanBaseAsarState(buf);
    const targetAnchor = 'void win.loadURL(url);';

    if (!base.origUtilsStr.includes(targetAnchor)) {
        throw new Error('Could not find injection anchor ("void win.loadURL(url);") in dist/utils.js.');
    }

    const injectionBlock = makeInjectionCodeFn(base.origOffset, base.origSize, base.origPayloadLen);
    const patchedUtilsCode = base.origUtilsStr.replace(
        targetAnchor,
        `${injectionBlock}\n    ${targetAnchor}`
    );
    const patchedUtilsBuf = Buffer.from(patchedUtilsCode, 'utf8');

    // Point dist/utils.js in the header to the appended region at the end of the original payload
    const appendedOffset = base.origPayloadLen;
    base.utilsNode.offset = String(appendedOffset);
    base.utilsNode.size = patchedUtilsBuf.length;
    base.utilsNode.integrity = computeIntegrity(patchedUtilsBuf);

    const newPrefix = encodeAsarHeaderPrefix(base.header);
    return Buffer.concat([newPrefix, base.origPayload, patchedUtilsBuf]);
}

function buildRestoredAsarBuffer(buf) {
    const base = getCleanBaseAsarState(buf);
    base.utilsNode.offset = String(base.origOffset);
    base.utilsNode.size = base.origSize;
    base.utilsNode.integrity = computeIntegrity(base.origUtilsBuf);

    const newPrefix = encodeAsarHeaderPrefix(base.header);
    return Buffer.concat([newPrefix, base.origPayload]);
}

function buildInjectionCode(origOffset, origSize, origPayloadLen) {
    return `${PATCH_START_MARKER} /* AG_RTL_ORIG:${origOffset}:${origSize}:${origPayloadLen} */
    {
        const agRtlWebContents = (typeof getHubWebContents === 'function' ? getHubWebContents(win) : null) || win.webContents;
        if (agRtlWebContents && typeof agRtlWebContents.on === 'function') {
            agRtlWebContents.on('did-finish-load', () => {
                if (win.isDestroyed?.() || agRtlWebContents.isDestroyed?.()) return;
                agRtlWebContents.executeJavaScript(\`
                    (function() {
                        if (document.getElementById('ag-rtl-controls')) return;

                        // 1. Inject CSS
                        const style = document.createElement('style');
                        style.id = 'ag-rtl-styles';
                        style.textContent = \\\`
                            /* Force RTL Styles */
                            body.ag-rtl-active p, body.ag-rtl-active ul, body.ag-rtl-active ol, body.ag-rtl-active li,
                            body.ag-rtl-active h1, body.ag-rtl-active h2, body.ag-rtl-active h3, body.ag-rtl-active h4,
                            body.ag-rtl-active blockquote, body.ag-rtl-active .markdown,
                            body.ag-rtl-active [class*="message"] { direction: rtl !important; text-align: right !important; }
                            body.ag-rtl-active pre, body.ag-rtl-active code, body.ag-rtl-active [class*="code"],
                            body.ag-rtl-active textarea, body.ag-rtl-active input, body.ag-rtl-active [contenteditable="true"],
                            body.ag-rtl-active [class*="input"], body.ag-rtl-active [class*="editor"], body.ag-rtl-active [class*="composer"],
                            body.ag-rtl-active .monaco-editor { direction: ltr !important; text-align: left !important; }

                            /* Auto RTL Styles */
                            body.ag-auto-rtl-active .ag-is-rtl {
                                direction: rtl !important;
                                text-align: right !important;
                            }
                            body.ag-auto-rtl-active ul:has(> li.ag-is-rtl),
                            body.ag-auto-rtl-active ol:has(> li.ag-is-rtl),
                            body.ag-auto-rtl-active .ag-is-rtl-list {
                                direction: rtl !important;
                                text-align: right !important;
                            }
                            body.ag-auto-rtl-active pre, body.ag-auto-rtl-active [class*="code-block"],
                            body.ag-auto-rtl-active .monaco-editor {
                                direction: ltr !important;
                                text-align: left !important;
                                unicode-bidi: isolate !important;
                            }

                            /* Inline BiDi Isolation (prevents inline code, flags, paths & punctuation from flipping in RTL sentences) */
                            body.ag-rtl-active :not(pre) > code,
                            body.ag-auto-rtl-active :not(pre) > code,
                            body.ag-rtl-active kbd,
                            body.ag-auto-rtl-active kbd,
                            body.ag-rtl-active samp,
                            body.ag-auto-rtl-active samp {
                                direction: ltr !important;
                                unicode-bidi: isolate !important;
                                display: inline-block;
                                text-align: left !important;
                            }
                            body.ag-rtl-active pre code,
                            body.ag-auto-rtl-active pre code {
                                direction: ltr !important;
                                text-align: left !important;
                            }

                            /* Code Comments Fix */
                            body.ag-rtl-active pre code span[class*="comment"], body.ag-rtl-active pre code span[class*="string"],
                            body.ag-auto-rtl-active pre code span[class*="comment"], body.ag-auto-rtl-active pre code span[class*="string"] {
                                unicode-bidi: plaintext;
                            }

                            /* Controls Container */
                            #ag-rtl-controls {
                                position: fixed;
                                top: 5px;
                                right: 150px;
                                z-index: 999999;
                                display: flex;
                                gap: 6px;
                                -webkit-app-region: no-drag;
                                user-select: none;
                            }

                            /* Button Styles */
                            .ag-rtl-btn {
                                padding: 3px 8px;
                                background: transparent;
                                color: #888;
                                border: 1px solid #555;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                                font-family: system-ui, -apple-system, sans-serif;
                                transition: all 0.2s;
                                opacity: 0.65;
                            }
                            .ag-rtl-btn:hover {
                                opacity: 1;
                                background: rgba(128,128,128,0.2);
                            }
                            .ag-rtl-btn.active {
                                opacity: 1;
                                color: #28a745;
                                border-color: #28a745;
                                background: rgba(40,167,69,0.12);
                            }
                        \\\`;
                        document.head.appendChild(style);

                        // 2. Create Controls
                        const controls = document.createElement('div');
                        controls.id = 'ag-rtl-controls';
                        if (navigator.platform && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
                            controls.style.right = '24px';
                        }

                        const forceBtn = document.createElement('button');
                        forceBtn.className = 'ag-rtl-btn';
                        forceBtn.textContent = '⇄ Force RTL';

                        const autoBtn = document.createElement('button');
                        autoBtn.className = 'ag-rtl-btn';
                        autoBtn.textContent = '✨ Auto RTL';

                        controls.appendChild(forceBtn);
                        controls.appendChild(autoBtn);
                        document.body.appendChild(controls);

                        // 3. Throttled Auto RTL Logic (prevents UI lag during fast streaming)
                        const RTL_CHAR_RE = /[א-תء-يپچژگ]/g;
                        const WS_RE = /\\\\s/g;
                        let rafPending = false;

                        const applyAutoRtlNow = () => {
                            rafPending = false;
                            if (!document.body || !document.body.classList.contains('ag-auto-rtl-active')) return;
                            const elements = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th');
                            for (let i = 0; i < elements.length; i++) {
                                const el = elements[i];
                                if (el.closest('pre, code, .monaco-editor, #ag-rtl-controls')) continue;
                                const text = el.textContent || '';
                                const totalChars = text.replace(WS_RE, '').length;
                                if (totalChars === 0) continue;
                                const rtlMatches = text.match(RTL_CHAR_RE);
                                const isRtl = Boolean(rtlMatches && (rtlMatches.length / totalChars > 0.15));
                                if (isRtl) {
                                    if (!el.classList.contains('ag-is-rtl')) el.classList.add('ag-is-rtl');
                                    if (el.tagName === 'LI' && el.parentElement && (el.parentElement.tagName === 'UL' || el.parentElement.tagName === 'OL')) {
                                        el.parentElement.classList.add('ag-is-rtl-list');
                                    }
                                } else {
                                    if (el.classList.contains('ag-is-rtl')) el.classList.remove('ag-is-rtl');
                                }
                            }
                        };

                        const scheduleAutoRtl = () => {
                            if (rafPending || !document.body.classList.contains('ag-auto-rtl-active')) return;
                            rafPending = true;
                            requestAnimationFrame(applyAutoRtlNow);
                        };

                        const observer = new MutationObserver(scheduleAutoRtl);
                        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

                        const STORAGE_KEY = 'ag-rtl-mode';
                        const setMode = (mode) => {
                            try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
                            document.body.classList.toggle('ag-rtl-active', mode === 'force');
                            document.body.classList.toggle('ag-auto-rtl-active', mode === 'auto');
                            forceBtn.classList.toggle('active', mode === 'force');
                            autoBtn.classList.toggle('active', mode === 'auto');
                            if (mode === 'auto') {
                                applyAutoRtlNow();
                            } else {
                                document.querySelectorAll('.ag-is-rtl').forEach(el => el.classList.remove('ag-is-rtl'));
                            }
                        };

                        // 4. Button Events
                        forceBtn.addEventListener('click', () => {
                            const nextMode = document.body.classList.contains('ag-rtl-active') ? 'off' : 'force';
                            setMode(nextMode);
                        });

                        autoBtn.addEventListener('click', () => {
                            const nextMode = document.body.classList.contains('ag-auto-rtl-active') ? 'off' : 'auto';
                            setMode(nextMode);
                        });

                        // 5. Initialize mode (default to 'auto')
                        let initialMode = 'auto';
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY);
                            if (saved === 'auto' || saved === 'force' || saved === 'off') {
                                initialMode = saved;
                            }
                        } catch (_) {}
                        setMode(initialMode);
                        setTimeout(scheduleAutoRtl, 500);
                    })();
                \`).catch(err => console.error('RTL injection failed:', err));
            });
        }
    }
    ${PATCH_END_MARKER}`;
}

/**
 * Checks if the NSIS installer/updater is currently running in the background.
 * Waiting for it prevents locking resources/ while Uninstall Antigravity.exe is replacing the app.
 */
function waitForBackgroundUpdater() {
    if (process.platform !== 'win32') return;
    const maxWaitSec = 90;
    for (let waited = 0; waited < maxWaitSec; waited += 2) {
        try {
            const out = execSync('tasklist /FI "IMAGENAME eq Antigravity-x64.exe" /FO CSV /NH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const outUninstall = execSync('tasklist /FI "IMAGENAME eq Uninstall Antigravity.exe" /FO CSV /NH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const updaterRunning = out.includes('Antigravity-x64.exe') || outUninstall.includes('Uninstall');
            if (!updaterRunning) return;
            if (waited === 0) {
                console.log('⏳ Antigravity is currently finishing an update in the background. Waiting for it to complete safely...');
            }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
        } catch (_) {
            return;
        }
    }
}

function validateAsarBufferIntegrity(asarBuf) {
    const parsed = parseAsarBuffer(asarBuf);
    const pkgFile = readPackedFile(parsed, ['package.json']);
    const pkgJson = JSON.parse(pkgFile.buffer.toString('utf8'));
    if (!pkgJson || pkgJson.name !== 'antigravity' || !pkgJson.version) {
        throw new Error('Validation failed: package.json inside ASAR is invalid.');
    }

    const utilsFile = readPackedFile(parsed, ['dist', 'utils.js']);
    const utilsStr = utilsFile.buffer.toString('utf8');
    // Compile in V8 VM to guarantee zero syntax errors before writing to disk
    new vm.Script(utilsStr, { filename: 'dist/utils.js' });

    return { version: pkgJson.version, utilsStr, headerSize: parsed.headerSize };
}

function writeAsarSafely(targetPath, newBuffer) {
    // Validate buffer in memory before touching disk
    validateAsarBufferIntegrity(newBuffer);

    const tmpPath = `${targetPath}.rtl-tmp-${process.pid}`;
    try {
        fs.writeFileSync(tmpPath, newBuffer);
        // Verify the written file on disk reads back identically
        const diskCheck = fs.readFileSync(tmpPath);
        if (!diskCheck.equals(newBuffer)) {
            throw new Error('Disk verification mismatch on temporary ASAR file.');
        }

        try {
            // Try atomic rename first
            fs.renameSync(tmpPath, targetPath);
        } catch (_) {
            // If Antigravity has a shared handle open on Windows, renameSync may fail with EPERM/EACCES
            // while direct copy/write succeeds atomically at the OS cache level
            fs.copyFileSync(tmpPath, targetPath);
            fs.rmSync(tmpPath, { force: true });
        }
    } finally {
        if (fs.existsSync(tmpPath)) {
            try { fs.rmSync(tmpPath, { force: true }); } catch (_) {}
        }
    }
}

function printHelp() {
    console.log(`
Antigravity 2.0 RTL Patcher (v2.0.0)
Zero-shift surgical Right-to-Left (RTL) support for Antigravity Desktop.

Usage:
  npx github:NaorHL1/antigravity-rtl-patch [options]
  npx antigravity-rtl-patch [options]
  node install.js [options]

Options:
  --restore              Restore original unpatched app.asar
  --status               Check current Antigravity version and RTL patch status
  --asar-path <path>     Specify custom path to resources/app.asar
  --help, -h             Show this help message
`);
}

async function patch(targetAsarPath = ASAR_PATH) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }

    const isStatus = process.argv.includes('--status');
    const isRestore = process.argv.includes('--restore');
    if (!isStatus) {
        console.log(isRestore ? '🔄 Restoring original Antigravity app.asar...' : '🚀 Starting Antigravity 2.0 RTL Patch (Zero-Shift Surgical Mode)...');
        waitForBackgroundUpdater();
    }

    if (!fs.existsSync(targetAsarPath)) {
        console.error('❌ Could not find app.asar at: ' + targetAsarPath);
        console.error('Searched candidate paths for ' + process.platform + ':');
        for (const c of getCandidateAsarPaths()) {
            console.error('  - ' + c);
        }
        console.error('Tip: Pass a custom path via: node install.js --asar-path "/path/to/resources/app.asar"');
        process.exit(1);
    }

    // Clean up any leftover temp directories from older versions of the patcher
    for (const oldTemp of ['temp_extract_rtl_patch', 'temp_check_rtl', 'temp_check_asar']) {
        const p = path.join(__dirname, oldTemp);
        if (fs.existsSync(p)) {
            try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
        }
    }

    // Remove legacy app.asar.backup inside resources/ so NSIS updater never trips on extra files
    if (targetAsarPath === ASAR_PATH && fs.existsSync(LEGACY_BACKUP_PATH)) {
        try {
            fs.rmSync(LEGACY_BACKUP_PATH, { force: true });
            console.log('🧹 Removed legacy backup from resources/ folder to keep auto-updates clean.');
        } catch (_) {}
    }

    const currentBuf = fs.readFileSync(targetAsarPath);
    const { version, utilsStr } = validateAsarBufferIntegrity(currentBuf);
    console.log(`📌 Detected Antigravity version: v${version}`);

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const versionedBackupPath = path.join(BACKUP_DIR, `app.asar.${version}.backup`);

    const isCurrentlyPatched = utilsStr.includes(PATCH_START_MARKER) || utilsStr.includes(LEGACY_MARKER);

    if (isStatus) {
        console.log(`📌 Antigravity Version : v${version}`);
        console.log(`📂 ASAR Path           : ${targetAsarPath}`);
        console.log(`✨ RTL Patch Status    : ${isCurrentlyPatched ? 'INSTALLED ✅' : 'NOT INSTALLED ❌'}`);
        console.log(`📦 Backup Available    : ${fs.existsSync(versionedBackupPath) ? 'YES (' + versionedBackupPath + ')' : 'Self-embedded inside ASAR'}`);
        return;
    }

    if (!isCurrentlyPatched && !fs.existsSync(versionedBackupPath)) {
        fs.writeFileSync(versionedBackupPath, currentBuf);
        console.log(`📦 Saved clean backup for v${version} at: ${versionedBackupPath}`);
    }

    if (isRestore) {
        const restoredBuf = buildRestoredAsarBuffer(currentBuf);
        writeAsarSafely(targetAsarPath, restoredBuf);
        console.log(`✅ Restored clean unpatched app.asar for v${version} successfully.`);
        return;
    }

    console.log('🛠️  Surgically patching dist/utils.js (Zero-Shift End-of-Payload Append)...');
    const patchedAsarBuf = buildPatchedAsarBuffer(currentBuf, buildInjectionCode);

    writeAsarSafely(targetAsarPath, patchedAsarBuf);

    // Final read-back verification from disk
    const finalDiskBuf = fs.readFileSync(targetAsarPath);
    const finalCheck = validateAsarBufferIntegrity(finalDiskBuf);
    if (!finalCheck.utilsStr.includes(PATCH_START_MARKER)) {
        throw new Error('Post-write verification failed: patch marker not found on disk.');
    }

    console.log(`✅ RTL Patch successfully applied and verified for Antigravity v${version}!`);
    console.log('🎉 Please restart Antigravity (or press Ctrl+R / Reload Window) to see the RTL controls.');
}

if (require.main === module) {
    patch().catch((err) => {
        console.error('❌ ERROR APPLYING RTL PATCH:', err.message);
        process.exit(1);
    });
}

module.exports = {
    patch,
    parseAsarBuffer,
    buildPatchedAsarBuffer,
    buildRestoredAsarBuffer,
    validateAsarBufferIntegrity,
};
