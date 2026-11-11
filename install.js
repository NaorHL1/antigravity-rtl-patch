#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync, spawnSync } = require('child_process');

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
 * Returns candidate paths for Antigravity Desktop's app.asar across Windows, macOS, and Linux.
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
 * Parses an ASAR archive buffer in memory without touching @electron/asar's filesystemCache
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
        throw new Error(`Corrupted file bounds in ASAR for ${relPathParts.join('/')}`);
    }
    return {
        node,
        offset,
        size,
        buffer: parsedAsar.payload.subarray(offset, offset + size),
    };
}

/**
 * Strips any existing RTL patch (new marker-based or legacy) from dist/utils.js code.
 */
function stripExistingPatch(utilsCode) {
    let code = utilsCode;

    while (code.includes(PATCH_START_MARKER) && code.includes(PATCH_END_MARKER)) {
        const startIdx = code.indexOf(PATCH_START_MARKER);
        const endIdx = code.indexOf(PATCH_END_MARKER) + PATCH_END_MARKER.length;
        let cutEnd = endIdx;
        while (cutEnd < code.length && (code[cutEnd] === '\r' || code[cutEnd] === '\n' || code[cutEnd] === ' ')) {
            cutEnd++;
        }
        code = code.slice(0, startIdx) + code.slice(cutEnd);
    }

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
        try {
            if (!global.__agRtlWillQuitHooked && electron_1 && electron_1.app) {
                global.__agRtlWillQuitHooked = true;
                electron_1.app.once('will-quit', () => {
                    try {
                        const osMod = require('os');
                        const cpMod = require('child_process');
                        const homeDir = osMod.homedir();
                        const stateDir = process.platform === 'win32'
                            ? path_1.default.join(process.env.LOCALAPPDATA || path_1.default.join(homeDir, 'AppData', 'Local'), 'antigravity-rtl-patch')
                            : process.platform === 'darwin'
                                ? path_1.default.join(homeDir, 'Library', 'Application Support', 'antigravity-rtl-patch')
                                : path_1.default.join(process.env.XDG_DATA_HOME || path_1.default.join(homeDir, '.local', 'share'), 'antigravity-rtl-patch');
                        const autoPatcherScript = path_1.default.join(stateDir, 'auto-patcher.js');
                        const nodeBinCfg = path_1.default.join(stateDir, 'node-path.txt');
                        const nodeBin = fs.existsSync(nodeBinCfg) ? fs.readFileSync(nodeBinCfg, 'utf8').trim() : 'node';
                        if (fs.existsSync(autoPatcherScript)) {
                            const child = cpMod.spawn(nodeBin, [autoPatcherScript, '--wait-for-update', '--quiet'], {
                                cwd: osMod.tmpdir(),
                                detached: true,
                                stdio: 'ignore',
                                windowsHide: true,
                            });
                            child.unref();
                        }
                    } catch (_) {}
                });
            }
        } catch (_) {}

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
                        const RTL_CHAR_RE = /[א-תء-يپچژג]/g;
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

const AUTO_PATCHER_SCRIPT = path.join(STATE_DIR, 'auto-patcher.js');
const AUTO_PATCHER_VBS = path.join(STATE_DIR, 'auto-patcher.vbs');
const NODE_PATH_FILE = path.join(STATE_DIR, 'node-path.txt');
const WIN_TASK_NAME = 'AntigravityRTLAutoPatch';

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForBackgroundUpdater(quiet = false) {
    if (process.platform !== 'win32') return;
    const maxWaitSec = 180;
    const isRunning = (image) => {
        // No shell + windowsHide: avoids flashing cmd.exe windows on every poll.
        const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
            encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (r.error || r.status !== 0) return false;
        return (r.stdout || '').includes(image);
    };
    for (let waited = 0; waited < maxWaitSec; waited += 2) {
        if (!isRunning('Antigravity-x64.exe') && !isRunning('Uninstall Antigravity.exe')) return;
        if (waited === 0 && !quiet) {
            console.log('⏳ Antigravity is currently finishing an update in the background. Waiting for it to complete safely...');
        }
        sleepMs(2000);
    }
}

function registerAutoPatchAgent(quiet = false) {
    try {
        fs.mkdirSync(STATE_DIR, { recursive: true });
        const selfContent = fs.readFileSync(__filename, 'utf8');
        fs.writeFileSync(AUTO_PATCHER_SCRIPT, selfContent, { mode: 0o755 });
        fs.writeFileSync(NODE_PATH_FILE, process.execPath, 'utf8');

        if (process.platform === 'win32') {
            const vbsContent = [
                'Set WshShell = CreateObject("WScript.Shell")',
                `WshShell.CurrentDirectory = "${os.tmpdir().replace(/"/g, '""')}"`,
                `WshShell.Run """${process.execPath.replace(/"/g, '""')}"" ""${AUTO_PATCHER_SCRIPT.replace(/"/g, '""')}"" --auto-check --quiet", 0, False`,
            ].join('\r\n');
            fs.writeFileSync(AUTO_PATCHER_VBS, vbsContent, 'utf8');

            try {
                execSync(
                    `schtasks /Create /TN "${WIN_TASK_NAME}" /TR "wscript.exe //B //NoLogo \\"${AUTO_PATCHER_VBS}\\"" /SC ONLOGON /F`,
                    { stdio: 'ignore' }
                );
            } catch (_) {}
        } else if (process.platform === 'darwin') {
            const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
            fs.mkdirSync(launchAgentsDir, { recursive: true });
            const plistPath = path.join(launchAgentsDir, 'com.naorhl1.antigravity-rtl-patch.plist');
            const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.naorhl1.antigravity-rtl-patch</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${AUTO_PATCHER_SCRIPT}</string>
        <string>--auto-check</string>
        <string>--quiet</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${os.tmpdir()}</string>
</dict>
</plist>`;
            fs.writeFileSync(plistPath, plist, 'utf8');
        } else {
            const autostartDir = path.join(os.homedir(), '.config', 'autostart');
            fs.mkdirSync(autostartDir, { recursive: true });
            const desktopPath = path.join(autostartDir, 'antigravity-rtl-patch.desktop');
            const desktopEntry = `[Desktop Entry]
Type=Application
Name=Antigravity RTL Auto-Patcher
Exec="${process.execPath}" "${AUTO_PATCHER_SCRIPT}" --auto-check --quiet
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
`;
            fs.writeFileSync(desktopPath, desktopEntry, 'utf8');
        }

        if (!quiet) {
            console.log('🛡️  Auto-Patch on Update enabled (survives future Antigravity & extension updates automatically).');
        }
    } catch (err) {
        if (!quiet) {
            console.warn('⚠️  Could not register background auto-patcher:', err.message);
        }
    }
}

function unregisterAutoPatchAgent(quiet = false) {
    try {
        if (process.platform === 'win32') {
            try {
                execSync(`schtasks /Delete /TN "${WIN_TASK_NAME}" /F`, { stdio: 'ignore' });
            } catch (_) {}
        } else if (process.platform === 'darwin') {
            const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.naorhl1.antigravity-rtl-patch.plist');
            if (fs.existsSync(plistPath)) fs.rmSync(plistPath, { force: true });
        } else {
            const desktopPath = path.join(os.homedir(), '.config', 'autostart', 'antigravity-rtl-patch.desktop');
            if (fs.existsSync(desktopPath)) fs.rmSync(desktopPath, { force: true });
        }
        if (fs.existsSync(AUTO_PATCHER_SCRIPT)) fs.rmSync(AUTO_PATCHER_SCRIPT, { force: true });
        if (fs.existsSync(AUTO_PATCHER_VBS)) fs.rmSync(AUTO_PATCHER_VBS, { force: true });
        if (fs.existsSync(NODE_PATH_FILE)) fs.rmSync(NODE_PATH_FILE, { force: true });
        if (!quiet) {
            console.log('🧹 Removed Auto-Patch background agent.');
        }
    } catch (_) {}
}

function isAutoPatchRegistered() {
    return fs.existsSync(AUTO_PATCHER_SCRIPT);
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
    new vm.Script(utilsStr, { filename: 'dist/utils.js' });

    return { version: pkgJson.version, utilsStr, headerSize: parsed.headerSize };
}

function writeAsarSafely(targetPath, newBuffer) {
    validateAsarBufferIntegrity(newBuffer);

    const tmpPath = `${targetPath}.rtl-tmp-${process.pid}`;
    try {
        fs.writeFileSync(tmpPath, newBuffer);
        const diskCheck = fs.readFileSync(tmpPath);
        if (!diskCheck.equals(newBuffer)) {
            throw new Error('Disk verification mismatch on temporary ASAR file.');
        }

        try {
            fs.renameSync(tmpPath, targetPath);
        } catch (_) {
            fs.copyFileSync(tmpPath, targetPath);
            fs.rmSync(tmpPath, { force: true });
        }
    } finally {
        if (fs.existsSync(tmpPath)) {
            try { fs.rmSync(tmpPath, { force: true }); } catch (_) {}
        }
    }
}

/* ==================== VS CODE EXTENSION SUPPORT ==================== */

const VSCODE_PATCH_START = '/* === AG_RTL_VSCODE_PATCH_START === */';
const VSCODE_PATCH_END = '/* === AG_RTL_VSCODE_PATCH_END === */';
const HOOK_CALL_REGEX = /if\s*\(typeof global\.__agRtlTransformIframeUrl\s*===\s*['"]function['"]\)\s*\{\s*([a-zA-Z0-9_$]+)\s*=\s*global\.__agRtlTransformIframeUrl\(\1\);\s*\}/g;

const VSCODE_INLINE_RTL_PAYLOAD = `
<style id="ag-rtl-styles">
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
  body.ag-auto-rtl-active .ag-is-rtl { direction: rtl !important; text-align: right !important; }
  body.ag-auto-rtl-active ul:has(> li.ag-is-rtl),
  body.ag-auto-rtl-active ol:has(> li.ag-is-rtl),
  body.ag-auto-rtl-active .ag-is-rtl-list { direction: rtl !important; text-align: right !important; }
  body.ag-auto-rtl-active pre, body.ag-auto-rtl-active [class*="code-block"],
  body.ag-auto-rtl-active .monaco-editor { direction: ltr !important; text-align: left !important; unicode-bidi: isolate !important; }

  /* Inline BiDi Isolation */
  body.ag-rtl-active :not(pre) > code,
  body.ag-auto-rtl-active :not(pre) > code,
  body.ag-rtl-active kbd, body.ag-auto-rtl-active kbd,
  body.ag-rtl-active samp, body.ag-auto-rtl-active samp {
    direction: ltr !important; unicode-bidi: isolate !important; display: inline-block; text-align: left !important;
  }
  body.ag-rtl-active pre code, body.ag-auto-rtl-active pre code { direction: ltr !important; text-align: left !important; }

  /* Code Comments Fix */
  body.ag-rtl-active pre code span[class*="comment"], body.ag-rtl-active pre code span[class*="string"],
  body.ag-auto-rtl-active pre code span[class*="comment"], body.ag-auto-rtl-active pre code span[class*="string"] {
    unicode-bidi: plaintext;
  }

  /* Controls Container */
  #ag-rtl-controls {
    position: fixed; top: 6px; right: 8px; z-index: 999999; display: flex; gap: 4px; user-select: none;
  }
  .ag-rtl-btn {
    padding: 2px 7px; background: rgba(30, 30, 30, 0.7); color: #aaa; border: 1px solid rgba(128, 128, 128, 0.4);
    border-radius: 4px; cursor: pointer; font-size: 11px; font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.2s; backdrop-filter: blur(4px); opacity: 0.75;
  }
  .ag-rtl-btn:hover { opacity: 1; color: #fff; background: rgba(128, 128, 128, 0.3); }
  .ag-rtl-btn.active { opacity: 1; color: #28a745; border-color: #28a745; background: rgba(40, 167, 69, 0.16); }
</style>
<script id="ag-rtl-script">
(function() {
  if (document.getElementById('ag-rtl-controls')) return;
  function init() {
    if (!document.body || document.getElementById('ag-rtl-controls')) return;
    const c = document.createElement('div');
    c.id = 'ag-rtl-controls';
    const fb = document.createElement('button');
    fb.className = 'ag-rtl-btn';
    fb.textContent = '⇄ RTL';
    fb.title = 'Force RTL (L/R toggle)';
    const ab = document.createElement('button');
    ab.className = 'ag-rtl-btn';
    ab.textContent = '✨ Auto';
    ab.title = 'Auto RTL (Hebrew/Arabic detection)';
    c.appendChild(fb); c.appendChild(ab);
    document.body.appendChild(c);

    const RTL_RE = /[א-תء-يپچژג]/g;
    const WS_RE = /\\s/g;
    let pending = false;
    const apply = () => {
      pending = false;
      if (!document.body || !document.body.classList.contains('ag-auto-rtl-active')) return;
      const els = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th');
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (el.closest('pre, code, .monaco-editor, #ag-rtl-controls')) continue;
        const txt = el.textContent || '';
        const total = txt.replace(WS_RE, '').length;
        if (total === 0) continue;
        const matches = txt.match(RTL_RE);
        const isRtl = Boolean(matches && (matches.length / total > 0.15));
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
    const schedule = () => {
      if (pending || !document.body.classList.contains('ag-auto-rtl-active')) return;
      pending = true;
      requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const KEY = 'ag-rtl-mode';
    const setMode = (m) => {
      try { localStorage.setItem(KEY, m); } catch (_) {}
      document.body.classList.toggle('ag-rtl-active', m === 'force');
      document.body.classList.toggle('ag-auto-rtl-active', m === 'auto');
      fb.classList.toggle('active', m === 'force');
      ab.classList.toggle('active', m === 'auto');
      if (m === 'auto') apply();
      else document.querySelectorAll('.ag-is-rtl').forEach(e => e.classList.remove('ag-is-rtl'));
    };
    fb.addEventListener('click', () => setMode(document.body.classList.contains('ag-rtl-active') ? 'off' : 'force'));
    ab.addEventListener('click', () => setMode(document.body.classList.contains('ag-auto-rtl-active') ? 'off' : 'auto'));

    let initMode = 'auto';
    try {
      const s = localStorage.getItem(KEY);
      if (s === 'auto' || s === 'force' || s === 'off') initMode = s;
    } catch (_) {}
    setMode(initMode);
    setTimeout(schedule, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>
`;

function getVscodeExtensionsDirs() {
    const home = os.homedir();
    return [
        path.join(home, '.vscode', 'extensions'),
        path.join(home, '.vscode-insiders', 'extensions'),
        path.join(home, '.cursor', 'extensions'),
    ];
}

function findInstalledVscodeExtensions(customPath = null) {
    const results = [];
    const seenDirs = new Set();

    if (customPath) {
        const resolved = path.resolve(customPath);
        if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                const extJs = path.join(resolved, 'extension.js');
                const pkgJson = path.join(resolved, 'package.json');
                if (fs.existsSync(extJs)) {
                    let version = 'unknown';
                    try {
                        if (fs.existsSync(pkgJson)) {
                            version = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version || 'unknown';
                        }
                    } catch (_) {}
                    seenDirs.add(resolved.toLowerCase());
                    results.push({ dir: resolved, extensionJs: extJs, version });
                }
            } else if (stat.isFile() && resolved.endsWith('.js')) {
                const parentDir = path.dirname(resolved);
                seenDirs.add(parentDir.toLowerCase());
                results.push({ dir: parentDir, extensionJs: resolved, version: 'custom' });
            }
        }
    }

    for (const baseDir of getVscodeExtensionsDirs()) {
        if (!fs.existsSync(baseDir)) continue;
        try {
            const entries = fs.readdirSync(baseDir);
            for (const entry of entries) {
                if (entry.toLowerCase().startsWith('google.google-antigravity')) {
                    const fullPath = path.join(baseDir, entry);
                    if (seenDirs.has(fullPath.toLowerCase())) continue;
                    seenDirs.add(fullPath.toLowerCase());

                    const extJs = path.join(fullPath, 'extension.js');
                    const pkgJson = path.join(fullPath, 'package.json');
                    if (fs.existsSync(extJs)) {
                        let version = 'unknown';
                        try {
                            if (fs.existsSync(pkgJson)) {
                                version = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version || 'unknown';
                            }
                        } catch (_) {}
                        results.push({ dir: fullPath, extensionJs: extJs, version });
                    }
                }
            }
        } catch (_) {}
    }

    return results;
}

function buildVscodeInjectionModule() {
    return `${VSCODE_PATCH_START}
(function() {
    if (global.__agRtlVscodeProxyStarted) return;
    global.__agRtlVscodeProxyStarted = true;

    const http = require('http');
    const net = require('net');

    const RTL_PAYLOAD = ${JSON.stringify(VSCODE_INLINE_RTL_PAYLOAD)};
    let proxyPort = 0;
    let lastTargetPort = 0;

    function getTargetPortFromReq(req) {
        try {
            const u = new URL(req.url, 'http://127.0.0.1');
            const p = u.searchParams.get('__ag_rtl_port');
            if (p) {
                const portNum = parseInt(p, 10);
                if (!isNaN(portNum) && portNum > 0) {
                    lastTargetPort = portNum;
                    return portNum;
                }
            }
        } catch (_) {}

        const ref = req.headers && req.headers['referer'];
        if (ref) {
            try {
                const refUrl = new URL(ref);
                const p = refUrl.searchParams.get('__ag_rtl_port');
                if (p) {
                    const portNum = parseInt(p, 10);
                    if (!isNaN(portNum) && portNum > 0) return portNum;
                }
            } catch (_) {}
        }
        return lastTargetPort;
    }

    const server = http.createServer((req, res) => {
        const tp = getTargetPortFromReq(req);
        if (!tp) {
            res.writeHead(502);
            return res.end('Antigravity RTL: Target port unknown');
        }

        let targetPath = req.url;
        try {
            const u = new URL(req.url, 'http://127.0.0.1');
            u.searchParams.delete('__ag_rtl_port');
            targetPath = u.pathname + u.search;
        } catch (_) {}

        const isHtml = targetPath === '/' || targetPath.startsWith('/?');
        const headers = { ...req.headers, host: '127.0.0.1:' + tp };
        if (isHtml) delete headers['accept-encoding'];

        const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: tp,
            path: targetPath,
            method: req.method,
            headers,
        }, (targetRes) => {
            const cType = targetRes.headers['content-type'] || '';
            if (isHtml && cType.includes('text/html')) {
                let body = '';
                targetRes.setEncoding('utf8');
                targetRes.on('data', c => { body += c; });
                targetRes.on('end', () => {
                    const modified = body.replace('</head>', RTL_PAYLOAD + '\\n</head>');
                    const resHeaders = { ...targetRes.headers };
                    delete resHeaders['content-length'];
                    delete resHeaders['content-encoding'];
                    resHeaders['content-type'] = 'text/html; charset=utf-8';
                    res.writeHead(targetRes.statusCode, resHeaders);
                    res.end(modified);
                });
            } else {
                res.writeHead(targetRes.statusCode, targetRes.headers);
                targetRes.pipe(res);
            }
        });

        proxyReq.on('error', (err) => {
            if (!res.headersSent) {
                res.writeHead(502);
                res.end('Antigravity RTL Proxy error: ' + err.message);
            }
        });

        req.pipe(proxyReq);
    });

    server.on('upgrade', (req, clientSocket, head) => {
        const tp = getTargetPortFromReq(req);
        if (!tp) return clientSocket.destroy();

        let cleanPath = req.url;
        try {
            const u = new URL(req.url, 'http://127.0.0.1');
            u.searchParams.delete('__ag_rtl_port');
            cleanPath = u.pathname + u.search;
        } catch (_) {}

        const targetSocket = net.connect(tp, '127.0.0.1', () => {
            targetSocket.write(req.method + ' ' + cleanPath + ' HTTP/' + req.httpVersion + '\\r\\n');
            for (const [k, v] of Object.entries(req.headers)) {
                if (k.toLowerCase() === 'host') targetSocket.write('host: 127.0.0.1:' + tp + '\\r\\n');
                else if (Array.isArray(v)) {
                    for (const item of v) targetSocket.write(k + ': ' + item + '\\r\\n');
                } else {
                    targetSocket.write(k + ': ' + v + '\\r\\n');
                }
            }
            targetSocket.write('\\r\\n');
            if (head && head.length > 0) targetSocket.write(head);
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
        });

        targetSocket.on('error', () => { try { clientSocket.destroy(); } catch (_) {} });
        clientSocket.on('error', () => { try { targetSocket.destroy(); } catch (_) {} });
    });

    server.listen(0, '127.0.0.1', () => {
        proxyPort = server.address().port;
    });
    server.unref();

    global.__agRtlTransformIframeUrl = function(origUrl) {
        if (!origUrl || typeof origUrl !== 'string' || !proxyPort) return origUrl;
        try {
            const parsed = new URL(origUrl);
            if ((parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') && parsed.port) {
                const targetPort = parseInt(parsed.port, 10);
                if (targetPort && targetPort !== proxyPort) {
                    lastTargetPort = targetPort;
                    parsed.port = String(proxyPort);
                    parsed.searchParams.set('__ag_rtl_port', String(targetPort));
                    return parsed.toString();
                }
            }
        } catch (_) {}
        return origUrl;
    };
})();
${VSCODE_PATCH_END}`;
}

function stripVscodePatch(code) {
    let clean = code;
    while (clean.includes(VSCODE_PATCH_START) && clean.includes(VSCODE_PATCH_END)) {
        const s = clean.indexOf(VSCODE_PATCH_START);
        let e = clean.indexOf(VSCODE_PATCH_END) + VSCODE_PATCH_END.length;
        while (e < clean.length && (clean[e] === '\r' || clean[e] === '\n')) {
            e++;
        }
        clean = clean.slice(0, s) + clean.slice(e);
    }
    clean = clean.replace(HOOK_CALL_REGEX, '');
    return clean;
}

function patchVscodeExtensionCode(code) {
    const clean = stripVscodePatch(code);
    const targetAnchor = /renderWebviewHtml\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{/;
    const match = clean.match(targetAnchor);
    if (!match) {
        throw new Error('Could not find renderWebviewHtml anchor in extension.js');
    }

    const [fullAnchor, a, b, c, d] = match;
    const hookedAnchor = `${fullAnchor}if(typeof global.__agRtlTransformIframeUrl==='function'){${c}=global.__agRtlTransformIframeUrl(${c});}`;
    const withHook = clean.replace(fullAnchor, hookedAnchor);
    const injectionModule = buildVscodeInjectionModule();
    return `${injectionModule}\n${withHook}`;
}

function writeVscodeExtensionSafely(targetPath, newCode) {
    new vm.Script(newCode, { filename: targetPath });

    const tmpPath = `${targetPath}.rtl-tmp-${process.pid}`;
    try {
        fs.writeFileSync(tmpPath, newCode, 'utf8');
        try {
            fs.renameSync(tmpPath, targetPath);
        } catch (_) {
            fs.copyFileSync(tmpPath, targetPath);
            fs.rmSync(tmpPath, { force: true });
        }
    } finally {
        if (fs.existsSync(tmpPath)) {
            try { fs.rmSync(tmpPath, { force: true }); } catch (_) {}
        }
    }
}

function patchVscodeExtension(extInfo, quiet = false) {
    const currentCode = fs.readFileSync(extInfo.extensionJs, 'utf8');
    const isCurrentlyPatched = currentCode.includes(VSCODE_PATCH_START);

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const versionedBackupPath = path.join(BACKUP_DIR, `extension.js.${extInfo.version}.backup`);

    if (!isCurrentlyPatched && !fs.existsSync(versionedBackupPath)) {
        fs.writeFileSync(versionedBackupPath, currentCode, 'utf8');
        if (!quiet) {
            console.log(`📦 Saved clean backup for VS Code extension v${extInfo.version} at: ${versionedBackupPath}`);
        }
    }

    if (!quiet) {
        console.log(`🛠️  Patching Google Antigravity VS Code extension v${extInfo.version}...`);
    }

    const patchedCode = patchVscodeExtensionCode(currentCode);
    writeVscodeExtensionSafely(extInfo.extensionJs, patchedCode);

    const checkCode = fs.readFileSync(extInfo.extensionJs, 'utf8');
    if (!checkCode.includes(VSCODE_PATCH_START)) {
        throw new Error('Verification failed: VS Code patch marker missing after write.');
    }

    if (!quiet) {
        console.log(`✅ Google Antigravity VS Code extension v${extInfo.version} successfully patched!`);
    }
}

function restoreVscodeExtension(extInfo, quiet = false) {
    const currentCode = fs.readFileSync(extInfo.extensionJs, 'utf8');
    const isCurrentlyPatched = currentCode.includes(VSCODE_PATCH_START);

    if (!isCurrentlyPatched) {
        if (!quiet) {
            console.log(`ℹ️  VS Code extension v${extInfo.version} is not patched.`);
        }
        return;
    }

    const restoredCode = stripVscodePatch(currentCode);
    writeVscodeExtensionSafely(extInfo.extensionJs, restoredCode);

    if (!quiet) {
        console.log(`✅ Restored clean unpatched VS Code extension v${extInfo.version} successfully.`);
    }
}

/* ==================== CLI & ORCHESTRATION ==================== */

function printHelp() {
    console.log(`
Antigravity 2.0 RTL Patcher (v2.1.0)
Zero-shift surgical Right-to-Left (RTL) support for Antigravity Desktop & VS Code Extension.

Usage:
  npx github:NaorHL1/antigravity-rtl-patch [options]
  npx antigravity-rtl-patch [options]
  node install.js [options]

Targets:
  (default)              Patch both Antigravity Desktop and VS Code extension (if found)
  --desktop              Patch only the Antigravity Desktop application
  --vscode               Patch only the Google Antigravity VS Code extension

Options:
  --restore              Restore original unpatched state & remove auto-patcher
  --status               Check version, RTL patch & Auto-Patch status for all targets
  --no-auto-patch        Apply RTL patch once without registering the update auto-patcher
  --asar-path <path>     Specify custom path to Antigravity resources/app.asar
  --vscode-path <path>   Specify custom path to VS Code extension folder or extension.js
  --help, -h             Show this help message
`);
}

async function patch() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }

    const isQuiet = process.argv.includes('--quiet');
    const isWaitForUpdate = process.argv.includes('--wait-for-update');
    const isAutoCheck = process.argv.includes('--auto-check');
    const isStatus = process.argv.includes('--status');
    const isRestore = process.argv.includes('--restore');
    const noAutoPatch = process.argv.includes('--no-auto-patch');

    const vscodeOnly = process.argv.includes('--vscode') || process.argv.includes('--vscode-only');
    const desktopOnly = process.argv.includes('--desktop') || process.argv.includes('--desktop-only');

    const shouldHandleDesktop = !vscodeOnly;
    const shouldHandleVscode = !desktopOnly;

    // Custom paths
    const customAsarFlag = process.argv.indexOf('--asar-path');
    const customAsarPath = customAsarFlag !== -1 && process.argv[customAsarFlag + 1] ? path.resolve(process.argv[customAsarFlag + 1]) : null;
    const targetAsarPath = customAsarPath || ASAR_PATH;

    const customVscodeFlag = process.argv.indexOf('--vscode-path');
    const customVscodePath = customVscodeFlag !== -1 && process.argv[customVscodeFlag + 1] ? path.resolve(process.argv[customVscodeFlag + 1]) : null;

    const vscodeExtensions = shouldHandleVscode ? findInstalledVscodeExtensions(customVscodePath) : [];

    if (isWaitForUpdate || isAutoCheck) {
        try { process.chdir(os.tmpdir()); } catch (_) {}
        // Antigravity was uninstalled: nothing to patch, so exit instead of polling.
        if (!fs.existsSync(targetAsarPath) && vscodeExtensions.length === 0) {
            unregisterAutoPatchAgent(true);
            return;
        }
    }

    if (isWaitForUpdate) {
        sleepMs(10000);
        waitForBackgroundUpdater(true);
        sleepMs(5000);
    } else if (!isStatus && shouldHandleDesktop && fs.existsSync(targetAsarPath)) {
        waitForBackgroundUpdater(isQuiet);
    }

    // Status Mode
    if (isStatus) {
        console.log('\n============================================================');
        console.log(' Antigravity RTL Patcher Status (v2.1.0)');
        console.log('============================================================');

        if (fs.existsSync(targetAsarPath)) {
            const buf = fs.readFileSync(targetAsarPath);
            const { version, utilsStr } = validateAsarBufferIntegrity(buf);
            const isPatched = utilsStr.includes(PATCH_START_MARKER) || utilsStr.includes(LEGACY_MARKER);
            const backupFile = path.join(BACKUP_DIR, `app.asar.${version}.backup`);
            console.log('🖥️  Desktop App (Antigravity):');
            console.log(`   📌 Version             : v${version}`);
            console.log(`   📂 ASAR Path           : ${targetAsarPath}`);
            console.log(`   ✨ RTL Patch Status    : ${isPatched ? 'INSTALLED ✅' : 'NOT INSTALLED ❌'}`);
            console.log(`   🛡️  Auto-Patch on Update: ${isAutoPatchRegistered() ? 'ENABLED ✅' : 'DISABLED ❌'}`);
            console.log(`   📦 Backup Available    : ${fs.existsSync(backupFile) ? 'YES (' + backupFile + ')' : 'Self-embedded inside ASAR'}`);
        } else {
            console.log('🖥️  Desktop App (Antigravity): NOT FOUND ❌');
        }

        console.log('');
        if (vscodeExtensions.length > 0) {
            console.log('💻 VS Code Extension (Google Antigravity):');
            for (const ext of vscodeExtensions) {
                const code = fs.readFileSync(ext.extensionJs, 'utf8');
                const isPatched = code.includes(VSCODE_PATCH_START);
                const backupFile = path.join(BACKUP_DIR, `extension.js.${ext.version}.backup`);
                console.log(`   📌 Version             : v${ext.version}`);
                console.log(`   📂 Extension Path      : ${ext.dir}`);
                console.log(`   ✨ RTL Patch Status    : ${isPatched ? 'INSTALLED ✅' : 'NOT INSTALLED ❌'}`);
                console.log(`   📦 Backup Available    : ${fs.existsSync(backupFile) ? 'YES' : 'NO'}`);
            }
        } else {
            console.log('💻 VS Code Extension (Google Antigravity): NOT FOUND ❌');
        }
        console.log('============================================================\n');
        return;
    }

    // Clean up old temp dirs
    for (const oldTemp of ['temp_extract_rtl_patch', 'temp_check_rtl', 'temp_check_asar']) {
        const p = path.join(__dirname, oldTemp);
        if (fs.existsSync(p)) {
            try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
        }
    }

    // 1. Desktop Patch / Restore
    if (shouldHandleDesktop && fs.existsSync(targetAsarPath)) {
        if (!isQuiet) {
            console.log(isRestore ? '🔄 Restoring Antigravity Desktop app.asar...' : '🚀 Checking Antigravity Desktop App...');
        }

        if (targetAsarPath === ASAR_PATH && fs.existsSync(LEGACY_BACKUP_PATH)) {
            try { fs.rmSync(LEGACY_BACKUP_PATH, { force: true }); } catch (_) {}
        }

        const currentBuf = fs.readFileSync(targetAsarPath);
        const { version, utilsStr } = validateAsarBufferIntegrity(currentBuf);
        const versionedBackupPath = path.join(BACKUP_DIR, `app.asar.${version}.backup`);
        const isCurrentlyPatched = utilsStr.includes(PATCH_START_MARKER) || utilsStr.includes(LEGACY_MARKER);

        if (!isCurrentlyPatched && !fs.existsSync(versionedBackupPath)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            fs.writeFileSync(versionedBackupPath, currentBuf);
            if (!isQuiet) {
                console.log(`📦 Saved clean backup for Desktop v${version} at: ${versionedBackupPath}`);
            }
        }

        if (isRestore) {
            unregisterAutoPatchAgent(isQuiet);
            const restoredBuf = buildRestoredAsarBuffer(currentBuf);
            writeAsarSafely(targetAsarPath, restoredBuf);
            if (!isQuiet) {
                console.log(`✅ Restored clean unpatched Desktop app.asar for v${version} successfully.`);
            }
        } else if (!isCurrentlyPatched || (!isAutoCheck && !isWaitForUpdate)) {
            if (!isQuiet) {
                console.log(`🛠️  Surgically patching Desktop dist/utils.js for Antigravity v${version}...`);
            }
            const patchedAsarBuf = buildPatchedAsarBuffer(currentBuf, buildInjectionCode);
            writeAsarSafely(targetAsarPath, patchedAsarBuf);
            if (!isQuiet) {
                console.log(`✅ Desktop RTL Patch successfully applied for Antigravity v${version}!`);
            }
        }
    } else if (desktopOnly) {
        console.error('❌ Could not find Antigravity Desktop app.asar at: ' + targetAsarPath);
        process.exit(1);
    }

    // 2. VS Code Extension Patch / Restore
    if (shouldHandleVscode && vscodeExtensions.length > 0) {
        for (const ext of vscodeExtensions) {
            if (isRestore) {
                restoreVscodeExtension(ext, isQuiet);
            } else {
                patchVscodeExtension(ext, isQuiet);
            }
        }
    } else if (vscodeOnly) {
        console.error('❌ Could not find Google Antigravity VS Code extension in:');
        for (const dir of getVscodeExtensionsDirs()) {
            console.error('  - ' + dir);
        }
        console.error('Tip: Specify custom path via: node install.js --vscode-path "/path/to/google.google-antigravity-*"');
        process.exit(1);
    }

    // Register Background Auto-Patch
    if (!noAutoPatch && !isRestore && !isAutoCheck && !isWaitForUpdate) {
        registerAutoPatchAgent(isQuiet);
    }

    if (!isQuiet && !isRestore) {
        console.log('\n🎉 RTL Patching Complete!');
        if (shouldHandleDesktop && fs.existsSync(targetAsarPath)) {
            console.log('👉 Desktop App : Restart Antigravity (or press Ctrl+R) to view RTL controls.');
        }
        if (shouldHandleVscode && vscodeExtensions.length > 0) {
            console.log('👉 VS Code     : Run "Developer: Reload Window" in VS Code to activate RTL.');
        }
    }
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
    findInstalledVscodeExtensions,
    patchVscodeExtension,
    restoreVscodeExtension,
    patchVscodeExtensionCode,
    stripVscodePatch,
};
