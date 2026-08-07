# Antigravity 2.0 RTL Patcher

> **A native Right-to-Left (RTL) injection patch for the Antigravity 2.0 Desktop Application.**

This script injects a subtle, transparent toggle button directly into the title bar of the Antigravity 2.0 desktop application. Clicking the button aligns the chat text (Hebrew, Arabic, Persian) to the right while strictly preserving Left-to-Right (LTR) alignment for code blocks, terminal outputs, and UI elements.

## 🤔 Why is this needed?

While the Antigravity IDE natively supports the [Antigravity Chat RTL Support extension](https://github.com/yechielby/antigravity-chat-rtl-extension), the standalone **Antigravity 2.0** desktop app does not support browser extensions or VS Code plugins. 

If you use Antigravity 2.0 in Hebrew, Arabic, or Persian, you will notice that the text aligns to the left, making it very hard to read mixed-language sentences. This script solves the problem by safely modifying the core Electron application archive (`app.asar`), giving you the exact same RTL capabilities in the desktop app!

## ✨ Features

- **Subtle UI Integration**: The `⇄ RTL` button is injected cleanly into the top title bar (next to the window controls) so it doesn't hide or overlay any chat text. It is transparent and only highlights when hovered or activated.
- **Code-Aware**: Only paragraph text and markdown are flipped to RTL. Code blocks (`<pre>`, `<code>`) are strictly protected and remain LTR.
- **Safe & Reversible**: Automatically creates a backup (`app.asar.backup`). If you run the script again, it restores the clean backup before re-patching to prevent corruption.

## 📋 Requirements

- Windows OS (Tested on Windows 10/11)
- Antigravity 2.0 Desktop App installed in the default location (`AppData\Local\Programs\antigravity`)
- [Node.js](https://nodejs.org/) installed

## 🚀 How to Install & Run

1. **Clone or download** this repository to your computer.
2. **Open a terminal** (PowerShell or CMD) in the downloaded folder.
3. **Install the required dependency** (the Electron ASAR tool):
   ```bash
   npm install @electron/asar
   ```
4. **Run the patch script**:
   ```bash
   node install.js
   ```
5. **Restart Antigravity**: Fully close the Antigravity app (make sure to quit from the system tray / notification area if it runs in the background) and open it again. 
6. You will now see a subtle `⇄ RTL` button in the top right corner of the window.

## 🔄 Updates

When Antigravity 2.0 updates to a new version, the patch will be overwritten and the button will disappear. You simply need to run `node install.js` again to re-apply it!

## 🔧 How it works (Behind the scenes)

The Antigravity 2.0 application is built with Electron. The UI files are packaged inside an archive called `app.asar`. This script:
1. Backs up the `app.asar` file to `app.asar.backup`.
2. Extracts the files using the `@electron/asar` tool.
3. Modifies `dist/utils.js` (the file responsible for creating the application windows) to inject custom JavaScript that adds the RTL button and CSS styles every time a window finishes loading.
4. Repacks the archive and cleans up the temporary extraction folder.

## 📄 License
MIT License
