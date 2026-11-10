# Antigravity 2.0 RTL Patcher

> **A native Right-to-Left (RTL) injection patch for the Antigravity 2.0 Desktop Application.**

![RTL Controls](screenshot.png)

[English](#english) | [עברית](#hebrew) | [العربية](#arabic) | [فارسی](#persian)

---

## <a id="english"></a> 🇺🇸 English

### The Problem
Antigravity 2.0 Desktop has no built-in RTL support. If you work in Hebrew, Arabic, or Persian, all text aligns to the left — making mixed-language responses nearly unreadable and breaking your workflow.

### The Solution
This patcher injects smart RTL controls directly into the application's title bar.

### ✨ Features

- **Auto RTL** — Scans each paragraph individually. Hebrew/Arabic/Persian text aligns right; English text in the same response stays left-aligned.
- **Code-Aware** — Code blocks remain strictly LTR. Hebrew comments inside code (e.g., `// בדיקה`) render correctly without breaking syntax.
- **Force RTL** — A manual toggle to force the entire chat to RTL when needed.
- **Persistent State** — Remembers your preferred RTL mode (`Auto RTL`, `Force RTL`, or `Off`) across restarts (`Auto RTL` enabled by default).
- **Zero-Shift Surgical Patching & Safe Restore** — Patches `dist/utils.js` directly in memory without unpacking or altering other file offsets, validates V8 syntax before writing, and stores versioned backups outside `resources/` so auto-updates stay clean. Run `node install.js --restore` anytime to restore the exact original archive.

### 📋 Requirements

- Windows OS
- [Antigravity 2.0](https://antigravity.dev/) Desktop App installed
- [Node.js](https://nodejs.org/) (v16+)

### 🚀 Installation

#### Option A: Using Git
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
npm install
node install.js
```

#### Option B: Manual Download
1. Click the green **"<> Code"** button above → **"Download ZIP"**.
2. Extract the ZIP and open a terminal in the extracted folder.
3. Run:
   ```bash
   npm install
   node install.js
   ```

#### After Installation
Close Antigravity completely (including the system tray) and reopen it.  
You will see two new buttons in the top-right corner: `⇄ Force RTL` and `✨ Auto RTL`.

### 🔄 After Antigravity Updates
When Antigravity updates, the patch is overwritten. Simply run `node install.js` again.

### 🌟 Roadmap
- Cross-platform support (Mac / Linux)
- Keyboard shortcut toggle (`Ctrl+Shift+R`)
- Persistent state across restarts

---

## <a id="hebrew"></a> 🇮🇱 עברית

### הבעיה
ל-Antigravity 2.0 Desktop אין תמיכה מובנית ב-RTL. מי שעובד בעברית מקבל טקסט שמיושר לשמאל — מה שהופך קריאה של תגובות שמשלבות עברית, אנגלית וקוד לחוויה מתסכלת.

### הפתרון
פאץ' שמזריק כפתורי שליטה חכמים ישירות לשורת הכותרת של התוכנה.

### ✨ יכולות
- **Auto RTL** — מזהה אוטומטית פסקאות בעברית והופך רק אותן ל-RTL. פסקאות באנגלית באותה הודעה נשארות מיושרות לשמאל.
- **הגנה על קוד** — בלוקים של קוד נשארים LTR. הערות בעברית בתוך הקוד מוצגות כראוי בלי לשבור תחביר.
- **Force RTL** — מצב ידני שמאלץ RTL על כל הצ'אט.

### 🚀 התקנה

#### אפשרות א׳: דרך Git
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
npm install
node install.js
```

#### אפשרות ב׳: הורדה ידנית
1. לחצו על הכפתור הירוק **"<> Code"** למעלה → **"Download ZIP"**.
2. חלצו את הקובץ ופתחו טרמינל בתיקייה.
3. הריצו:
   ```bash
   npm install
   node install.js
   ```

לאחר ההתקנה, סגרו את Antigravity לחלוטין (כולל מגש המערכת) ופתחו מחדש.

---

## <a id="arabic"></a> 🇸🇦 العربية

### المشكلة
تطبيق Antigravity 2.0 لا يدعم الكتابة من اليمين إلى اليسار (RTL). النصوص العربية تظهر بمحاذاة يسارية مما يجعل القراءة صعبة.

### الحل
هذا السكريبت يضيف أزرار تحكم ذكية في شريط عنوان التطبيق.

### 🚀 التثبيت
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
npm install
node install.js
```
أو قم بتنزيل ZIP من الزر الأخضر **"<> Code"** أعلاه، واستخرجه، ثم شغّل الأوامر أعلاه في المجلد.

أعد تشغيل التطبيق بعد التثبيت.

---

## <a id="persian"></a> 🇮🇷 فارسی

### مشکل
برنامه Antigravity 2.0 از راست‌چین (RTL) پشتیبانی نمی‌کند. متن‌های فارسی از چپ نمایش داده می‌شوند.

### راه‌حل
این اسکریپت دکمه‌های کنترل هوشمند را به نوار عنوان برنامه اضافه می‌کند.

### 🚀 نصب
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
npm install
node install.js
```
یا فایل ZIP را از دکمه سبز **"<> Code"** بالا دانلود کنید، استخراج کرده و دستورات بالا را اجرا کنید.

پس از نصب، برنامه را کاملاً ببندید و دوباره باز کنید.

---

## 📄 License
MIT — see [LICENSE](LICENSE).

## ⚠️ Disclaimer
*This is an unofficial community tool. Not affiliated with or endorsed by Antigravity. If the Antigravity team has any concerns, please [open an issue](https://github.com/NaorHL1/antigravity-rtl-patch/issues) and we will address them promptly.*
