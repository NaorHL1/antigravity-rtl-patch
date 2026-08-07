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

    // 1. Restore from backup or create backup
    if (fs.existsSync(BACKUP_PATH)) {
        console.log('📦 Restoring fresh app.asar from backup...');
        fs.copyFileSync(BACKUP_PATH, ASAR_PATH);
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
                if (document.getElementById('ag-rtl-toggle-btn')) return;
                const style = document.createElement('style');
                style.innerHTML = \\\`
                    body.ag-rtl-active p, body.ag-rtl-active ul, body.ag-rtl-active ol, body.ag-rtl-active li, 
                    body.ag-rtl-active h1, body.ag-rtl-active h2, body.ag-rtl-active h3, body.ag-rtl-active .markdown,
                    body.ag-rtl-active [class*="message"] { direction: rtl !important; text-align: right !important; }
                    body.ag-rtl-active pre, body.ag-rtl-active code, body.ag-rtl-active [class*="code"] { direction: ltr !important; text-align: left !important; }
                    #ag-rtl-toggle-btn { 
                        position: fixed; 
                        top: 5px; 
                        right: 200px; 
                        z-index: 999999; 
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
                        -webkit-app-region: no-drag;
                    }
                    #ag-rtl-toggle-btn:hover { 
                        opacity: 1; 
                        background: rgba(128,128,128,0.2); 
                    }
                    body.ag-rtl-active #ag-rtl-toggle-btn {
                        color: #28a745;
                        border-color: #28a745;
                    }
                \\\`;
                document.head.appendChild(style);
                const btn = document.createElement('button');
                btn.id = 'ag-rtl-toggle-btn';
                btn.innerHTML = '⇄ RTL';
                btn.addEventListener('click', () => {
                    const isActive = document.body.classList.toggle('ag-rtl-active');
                    btn.innerHTML = isActive ? '⇄ LTR' : '⇄ RTL';
                });
                document.body.appendChild(btn);
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
