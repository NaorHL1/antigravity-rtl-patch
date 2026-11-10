# Antigravity 2.0 RTL Patcher

> **A zero-dependency, surgical Right-to-Left (RTL) injection patch for the Antigravity Desktop App & Google Antigravity VS Code Extension (Windows, macOS & Linux).**

![RTL Controls](screenshot.png)

[English](#english) | [עברית](#hebrew) | [العربية](#arabic) | [فارسی](#persian)

---

## <a id="english"></a> 🇺🇸 English

### The Problem
Neither Antigravity Desktop nor the official VS Code extension (**Google Antigravity**) has built-in RTL support. If you work in Hebrew, Arabic, or Persian, all text aligns to the left — making mixed-language responses nearly unreadable and breaking your workflow.

### The Solution
This patcher surgically injects smart RTL controls directly into both **Antigravity Desktop** and the **Google Antigravity extension in VS Code** with zero external dependencies.

### ✨ Features

- **Dual Support** — Automatically detects and patches both **Antigravity Desktop** and the **Google Antigravity VS Code Extension** (`google.google-antigravity`).
- **Auto RTL** — Scans each paragraph and list item individually. Hebrew/Arabic/Persian text aligns right; English text in the same response stays left-aligned.
- **Inline BiDi & Code Protection** — Code blocks remain strictly LTR, Hebrew comments inside code render cleanly (`unicode-bidi: plaintext`), and inline `<code>`, `<kbd>`, and paths inside RTL sentences are isolated (`unicode-bidi: isolate`) so punctuation and flags never flip.
- **Force RTL** — A manual toggle to force the entire chat to RTL when needed.
- **Auto-Patch Across Updates** — Automatically registers a lightweight background hook & logon task outside the app folder so the RTL patch re-applies itself after updates without colliding with the installer.
- **Cross-Platform** — Supports **Windows**, **macOS**, and **Linux** out of the box.
- **Zero-Shift Surgical Patching & Safe Restore** — Validates V8 syntax before writing and supports instant bit-for-bit restoration.

### 📋 Requirements

- **Windows**, **macOS**, or **Linux**
- [Antigravity](https://antigravity.dev/) Desktop App and/or [VS Code](https://code.visualstudio.com/) with **Google Antigravity** extension installed
- [Node.js](https://nodejs.org/) (v16+)

### 🚀 Installation

#### Option A: 1-Click via `npx` (No Clone Required)
```bash
# Patches both Desktop and VS Code extension automatically
npx github:NaorHL1/antigravity-rtl-patch
```

#### Option B: Using Git
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
node install.js
```

#### CLI Target & Mode Options
```bash
npx github:NaorHL1/antigravity-rtl-patch --status          # Check version, patch & auto-patch status
npx github:NaorHL1/antigravity-rtl-patch --vscode          # Patch ONLY the VS Code extension
npx github:NaorHL1/antigravity-rtl-patch --desktop         # Patch ONLY the Desktop application
npx github:NaorHL1/antigravity-rtl-patch --restore         # Restore original unpatched files & remove auto-patcher
npx github:NaorHL1/antigravity-rtl-patch --no-auto-patch   # Apply patch once without background auto-patcher
npx github:NaorHL1/antigravity-rtl-patch --vscode-path <p> # Specify custom path to VS Code extension
npx github:NaorHL1/antigravity-rtl-patch --asar-path <p>   # Specify custom path to resources/app.asar
```

After patching:
- **Desktop**: Restart Antigravity (or press `Ctrl+R`).
- **VS Code**: Run `Developer: Reload Window` from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

---

## <a id="hebrew"></a> 🇮🇱 עברית

### הבעיה
גם ל-Antigravity Desktop וגם לתוסף הרשמי של VS Code (**Google Antigravity**) אין תמיכה מובנית ב-RTL. מי שעובד בעברית מקבל טקסט שמיושר לשמאל — מה שהופך קריאה של תגובות שמשלבות עברית, אנגלית וקוד לחוויה מתסכלת.

### הפתרון
פאץ' כירורגי וחכם שמזהה ומזריק תמיכת RTL מלאה ישירות ל-**Antigravity Desktop** וגם לתוסף **Google Antigravity ב-VS Code**, ללא תלויות חיצוניות.

### ✨ יכולות
- **תמיכה כפולה (Desktop + VS Code)** — מזהה ומתקין אוטומטית גם באפליקציית הדסקטופ וגם בתוסף VS Code (`google.google-antigravity`).
- **Auto RTL** — מזהה אוטומטית פסקאות ורשימות בעברית והופך רק אותן ל-RTL. פסקאות באנגלית באותה הודעה נשארות מיושרות לשמאל.
- **הגנה על קוד וסימני פיסוק (Inline BiDi)** — בלוקים של קוד נשארים LTR, ותגיות קוד בתוך משפט עברי (`<code>`) מבודדות עם `unicode-bidi: isolate` כך שסימני פיסוק, סוגריים ודגלים לא קופצים לצד הלא נכון.
- **מנגנון Auto-Patch בעדכוני תוכנה** — שומר סוכן קל מחוץ לתיקיית התוכנה שמזהה מתי Antigravity סיימה להתעדכן ומזריק את הפאץ' מחדש אוטומטית.
- **תמיכה ב-Windows, macOS ו-Linux** — מזהה אוטומטית את נתיבי ההתקנה בכל מערכת הפעלה.
- **שחזור מלא ומושלם (Restore)** — שומר גיבוי נקי ומאפשר לחזור למצב המקורי בכל רגע.

### 🚀 התקנה בלחיצה אחת (NPX)
פתחו טרמינל והריצו פקודה אחת בלבד (מתקין אוטומטית גם בדסקטופ וגם ב-VS Code):
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

לבדיקת סטטוס מפורטת:
```bash
npx github:NaorHL1/antigravity-rtl-patch --status
```

להתקנה ב-VS Code בלבד או בדסקטופ בלבד:
```bash
npx github:NaorHL1/antigravity-rtl-patch --vscode
npx github:NaorHL1/antigravity-rtl-patch --desktop
```

להסרת הפאץ' ושחזור מלא של הקבצים המקוריים:
```bash
npx github:NaorHL1/antigravity-rtl-patch --restore
```

לאחר ההתקנה:
- **בדסקטופ**: הפעילו מחדש את Antigravity (או הקישו `Ctrl+R`).
- **ב-VS Code**: פתחו את Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) ובחרו `Developer: Reload Window`.

---

## <a id="arabic"></a> 🇸🇦 العربية

### المشكلة
تطبيق Antigravity Desktop وإضافة VS Code الرسمية (**Google Antigravity**) لا يدعمان الكتابة من اليمين إلى اليسار (RTL). النصوص العربية تظهر بمحاذاة يسارية مما يجعل القراءة صعبة.

### الحل
هذا السكريبت يضيف أزرار تحكم ذكية ودعم كامل لـ RTL لتطبيق Desktop وإضافة VS Code مع حماية كاملة للأكواد وعلامات الترقيم، ودعم Windows و macOS و Linux وإعادة التفعيل التلقائي بعد التحديثات.

### 🚀 التثبيت بخطوة واحدة (NPX)
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

خيارات إضافية:
```bash
npx github:NaorHL1/antigravity-rtl-patch --status     # فحص الحالة
npx github:NaorHL1/antigravity-rtl-patch --vscode     # تثبيت لـ VS Code فقط
npx github:NaorHL1/antigravity-rtl-patch --restore    # استعادة الملفات الأصلية
```

بعد التثبيت: أعد تشغيل Antigravity أو اختر `Developer: Reload Window` في VS Code.

---

## <a id="persian"></a> 🇮🇷 فارسی

### مشکل
برنامه دسکتاپ Antigravity و افزونه رسمی VS Code (**Google Antigravity**) از راست‌چین (RTL) پشتیبانی نمی‌کنند.

### راه‌حل
این ابزار هوشمند دکمه‌های کنترل و پشتیبانی کامل RTL را به برنامه دسکتاپ و افزونه VS Code اضافه می‌کند، از کدها و علائم نگارشی محافظت می‌کند و با هر به‌روزرسانی سازگار است.

### 🚀 نصب با یک دستور (NPX)
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

بررسی وضعیت یا بازگردانی:
```bash
npx github:NaorHL1/antigravity-rtl-patch --status
npx github:NaorHL1/antigravity-rtl-patch --restore
```

پس از نصب، در VS Code دستور `Developer: Reload Window` را اجرا کنید یا برنامه دسکتاپ را بازنشانی کنید.

---

## 📄 License
MIT — see [LICENSE](LICENSE).

## ⚠️ Disclaimer
*This is an unofficial community tool. Not affiliated with or endorsed by Google or Antigravity. If the Antigravity team has any concerns, please [open an issue](https://github.com/NaorHL1/antigravity-rtl-patch/issues) and we will address them promptly.*
