const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

// The default path for Antigravity on Windows
const RESOURCES_DIR = path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity', 'resources');
const ASAR_PATH = path.join(RESOURCES_DIR, 'app.asar');
const BACKUP_PATH = path.join(RESOURCES_DIR, 'app.asar.backup');
const EXTRACT_DIR = path.join(__dirname, 'temp_extract_rtl_patch');

async function patch() {
    console.log('🚀 Starting Antigravity 2.0 RTL Patch...');
    
    if (!fs.existsSync(ASAR_PATH)) {
        console.error('❌ Could not find app.asar at ' + ASAR_PATH);
        console.error('Please make sure Antigravity is installed.');
        process.exit(1);
    }

    // 1. Smart backup: detect if Antigravity was updated since last patch
    if (fs.existsSync(BACKUP_PATH)) {
        const currentSize = fs.statSync(ASAR_PATH).size;
        const backupSize = fs.statSync(BACKUP_PATH).size;
        const currentMtime = fs.statSync(ASAR_PATH).mtimeMs;
        const backupMtime = fs.statSync(BACKUP_PATH).mtimeMs;
        
        if (currentSize !== backupSize && currentMtime > backupMtime) {
            // app.asar changed and is newer than backup = Antigravity updated
            console.log('🔄 Antigravity update detected! Creating new backup...');
            fs.copyFileSync(ASAR_PATH, BACKUP_PATH);
        } else {
            console.log('📦 Restoring fresh app.asar from backup...');
            fs.copyFileSync(BACKUP_PATH, ASAR_PATH);
        }
    } else {
        console.log('📦 Creating backup of app.asar...');
        fs.copyFileSync(ASAR_PATH, BACKUP_PATH);
    }

    // 2. Extract
    console.log('📂 Extracting application files...');
    if (fs.existsSync(EXTRACT_DIR)) {
        fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    }
    asar.extractAll(ASAR_PATH, EXTRACT_DIR);

    // 3. Patch utils.js
    console.log('🛠️  Injecting RTL Toggle Button...');
    const utilsPath = path.join(EXTRACT_DIR, 'dist', 'utils.js');
    let utilsCode = fs.readFileSync(utilsPath, 'utf-8');

    const injectionCode = `
    win.webContents.on('did-finish-load', () => {
        win.webContents.executeJavaScript(\`
            (function() {
                if (document.getElementById('ag-rtl-controls')) return;
                
                // 1. Inject CSS
                const style = document.createElement('style');
                style.innerHTML = \\\`
                    /* Force RTL Styles */
                    body.ag-rtl-active p, body.ag-rtl-active ul, body.ag-rtl-active ol, body.ag-rtl-active li, 
                    body.ag-rtl-active h1, body.ag-rtl-active h2, body.ag-rtl-active h3, body.ag-rtl-active .markdown,
                    body.ag-rtl-active [class*="message"] { direction: rtl !important; text-align: right !important; }
                    body.ag-rtl-active pre, body.ag-rtl-active code, body.ag-rtl-active [class*="code"] { direction: ltr !important; text-align: left !important; }
                    body.ag-rtl-active textarea, body.ag-rtl-active input, body.ag-rtl-active [contenteditable="true"], 
                    body.ag-rtl-active [class*="input"], body.ag-rtl-active [class*="editor"], body.ag-rtl-active [class*="composer"], 
                    body.ag-rtl-active .monaco-editor { direction: ltr !important; text-align: left !important; }
                    
                    /* Auto RTL Styles */
                    body.ag-auto-rtl-active .ag-is-rtl { direction: rtl !important; text-align: right !important; }
                    
                    /* Code Comments Fix (always active if either mode is on) */
                    body.ag-rtl-active pre code span[class*="comment"], body.ag-rtl-active pre code span[class*="string"],
                    body.ag-auto-rtl-active pre code span[class*="comment"], body.ag-auto-rtl-active pre code span[class*="string"] {
                        unicode-bidi: plaintext;
                    }
                    
                    /* Controls Container */
                    #ag-rtl-controls {
                        position: fixed;
                        top: 5px;
                        right: 200px;
                        z-index: 999999;
                        display: flex;
                        gap: 8px;
                        -webkit-app-region: no-drag;
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
                        font-family: sans-serif;
                        transition: all 0.2s;
                        opacity: 0.5;
                    }
                    .ag-rtl-btn:hover {
                        opacity: 1;
                        background: rgba(128,128,128,0.2);
                    }
                    .ag-rtl-btn.active {
                        opacity: 1;
                        color: #28a745;
                        border-color: #28a745;
                        background: rgba(40,167,69,0.1);
                    }
                \\\`;
                document.head.appendChild(style);

                // 2. Create Controls
                const controls = document.createElement('div');
                controls.id = 'ag-rtl-controls';
                
                const forceBtn = document.createElement('button');
                forceBtn.className = 'ag-rtl-btn';
                forceBtn.innerHTML = '⇄ Force RTL';
                
                const autoBtn = document.createElement('button');
                autoBtn.className = 'ag-rtl-btn';
                autoBtn.innerHTML = '✨ Auto RTL';
                
                controls.appendChild(forceBtn);
                controls.appendChild(autoBtn);
                document.body.appendChild(controls);

                // 3. Auto RTL Logic
                const applyAutoRtl = () => {
                    const elements = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, .markdown');
                    elements.forEach(el => {
                        const text = el.textContent || '';
                        const rtlChars = text.match(/[א-תء-يپچژگ]/g);
                        const totalChars = text.replace(/\\s/g, '').length;
                        
                        if (totalChars > 0 && rtlChars && (rtlChars.length / totalChars > 0.15)) {
                            el.classList.add('ag-is-rtl');
                        } else {
                            el.classList.remove('ag-is-rtl');
                        }
                    });
                };

                const observer = new MutationObserver((mutations) => {
                    if (!document.body.classList.contains('ag-auto-rtl-active')) return;
                    applyAutoRtl();
                });
                
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });

                // 4. Button Events
                forceBtn.addEventListener('click', () => {
                    const isActive = document.body.classList.toggle('ag-rtl-active');
                    forceBtn.classList.toggle('active', isActive);
                    
                    if (isActive) {
                        document.body.classList.remove('ag-auto-rtl-active');
                        autoBtn.classList.remove('active');
                    }
                });
                
                autoBtn.addEventListener('click', () => {
                    const isActive = document.body.classList.toggle('ag-auto-rtl-active');
                    autoBtn.classList.toggle('active', isActive);
                    
                    if (isActive) {
                        document.body.classList.remove('ag-rtl-active');
                        forceBtn.classList.remove('active');
                        applyAutoRtl();
                    } else {
                        document.querySelectorAll('.ag-is-rtl').forEach(el => el.classList.remove('ag-is-rtl'));
                    }
                });
            })();
        \`).catch(err => console.error("RTL injection failed", err));
    });
    `;

    if (utilsCode.includes('void win.loadURL(url);')) {
        utilsCode = utilsCode.replace('void win.loadURL(url);', `${injectionCode}\n    void win.loadURL(url);`);
        fs.writeFileSync(utilsPath, utilsCode);
        console.log('✅ Patch successfully applied!');
    } else {
        console.error('❌ Failed to find target string in utils.js! The app structure might have changed.');
        process.exit(1);
    }

    // 4. Repack
    console.log('📦 Repacking application files (this might take a few seconds)...');
    await asar.createPackage(EXTRACT_DIR, ASAR_PATH);
    
    // 5. Cleanup
    console.log('🧹 Cleaning up temporary files...');
    fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    
    console.log('🎉 DONE! Please restart Antigravity to see the changes.');
}

patch().catch(console.error);
