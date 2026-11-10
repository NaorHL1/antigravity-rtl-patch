# Antigravity 2.0 RTL Patcher

> **A zero-dependency, surgical Right-to-Left (RTL) injection patch for the Antigravity 2.0 Desktop Application (Windows, macOS & Linux).**

![RTL Controls](screenshot.png)

[English](#english) | [עברית](#hebrew) | [العربية](#arabic) | [فارسی](#persian)

---

## <a id="english"></a> 🇺🇸 English

### The Problem
Antigravity 2.0 Desktop has no built-in RTL support. If you work in Hebrew, Arabic, or Persian, all text aligns to the left — making mixed-language responses nearly unreadable and breaking your workflow.

### The Solution
This patcher surgically injects smart RTL controls directly into the application's title bar with zero external dependencies.

### ✨ Features

- **Auto RTL** — Scans each paragraph and list item individually. Hebrew/Arabic/Persian text aligns right; English text in the same response stays left-aligned.
- **Inline BiDi & Code Protection** — Code blocks remain strictly LTR, Hebrew comments inside code render cleanly (`unicode-bidi: plaintext`), and inline `<code>`, `<kbd>`, and paths inside RTL sentences are isolated (`unicode-bidi: isolate`) so punctuation and flags never flip.
- **Force RTL** — A manual toggle to force the entire chat to RTL when needed.
- **Auto-Patch Across Updates** — Automatically registers a lightweight background hook & logon task outside the app folder so the RTL patch re-applies itself after Antigravity updates without colliding with the installer.
- **Cross-Platform** — Supports **Windows**, **macOS**, and **Linux** out of the box.
- **Zero-Shift Surgical Patching & Safe Restore** — Modifies only `dist/utils.js` in memory (keeping all other 760+ packed files and `app.asar.unpacked` at their exact original byte offsets), validates V8 syntax before writing, and supports instant bit-for-bit restoration.

### 📋 Requirements

- **Windows**, **macOS**, or **Linux**
- [Antigravity 2.0](https://antigravity.dev/) Desktop App installed
- [Node.js](https://nodejs.org/) (v16+)

### 🚀 Installation

#### Option A: 1-Click via `npx` (No Clone Required)
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

#### Option B: Using Git
```bash
git clone https://github.com/NaorHL1/antigravity-rtl-patch.git
cd antigravity-rtl-patch
node install.js
```

#### CLI Options
```bash
npx github:NaorHL1/antigravity-rtl-patch --status          # Check version, patch & auto-patch status
npx github:NaorHL1/antigravity-rtl-patch --restore         # Restore original unpatched app.asar & remove auto-patcher
npx github:NaorHL1/antigravity-rtl-patch --no-auto-patch   # Apply patch once without background auto-patcher
npx github:NaorHL1/antigravity-rtl-patch --asar-path <p>   # Specify custom path to resources/app.asar
```

---

## <a id="hebrew"></a> 🇮🇱 עברית

### הבעיה
ל-Antigravity 2.0 Desktop אין תמיכה מובנית ב-RTL. מי שעובד בעברית מקבל טקסט שמיושר לשמאל — מה שהופך קריאה של תגובות שמשלבות עברית, אנגלית וקוד לחוויה מתסכלת.

### הפתרון
פאץ' כירורגי שמזריק כפתורי שליטה חכמים ישירות לשורת הכותרת של התוכנה, ללא תלויות חיצוניות.

### ✨ יכולות
- **Auto RTL** — מזהה אוטומטית פסקאות ורשימות בעברית והופך רק אותן ל-RTL. פסקאות באנגלית באותה הודעה נשארות מיושרות לשמאל.
- **הגנה על קוד וסימני פיסוק (Inline BiDi)** — בלוקים של קוד נשארים LTR, ותגיות קוד בתוך משפט עברי (`<code>`) מבודדות עם `unicode-bidi: isolate` כך שסימני פיסוק, סוגריים ודגלים לא קופצים לצד הלא נכון.
- **מנגנון Auto-Patch בעדכוני תוכנה** — שומר סוכן קל מחוץ לתיקיית התוכנה שמזהה מתי Antigravity סיימה להתעדכן ומזריק את הפאץ' מחדש אוטומטית.
- **תמיכה ב-Windows, macOS ו-Linux** — מזהה אוטומטית את נתיב ההתקנה בכל מערכת הפעלה.

### 🚀 התקנה בלחיצה אחת (NPX)
פתחו טרמינל והריצו פקודה אחת בלבד (ללא צורך ב-Git Clone או `npm install`):
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

לבדיקת סטטוס או להסרת הפאץ' ושחזור מלא:
```bash
npx github:NaorHL1/antigravity-rtl-patch --status
npx github:NaorHL1/antigravity-rtl-patch --restore
```

לאחר ההתקנה הראשונית, הפעילו מחדש את Antigravity.

---

## <a id="arabic"></a> 🇸🇦 العربية

### المشكلة
تطبيق Antigravity 2.0 لا يدعم الكتابة من اليمين إلى اليسار (RTL). النصوص العربية تظهر بمحاذاة يسارية مما يجعل القراءة صعبة.

### الحل
هذا السكريبت يضيف أزرار تحكم ذكية في شريط عنوان التطبيق مع حماية كاملة للأكواد وعلامات الترقيم، ويدعم Windows و macOS و Linux مع إعادة التفعيل التلقائي بعد التحديثات.

### 🚀 التثبيت بخطوة واحدة (NPX)
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

أعد تشغيل التطبيق بعد التثبيت.

---

## <a id="persian"></a> 🇮🇷 فارسی

### مشکل
برنامه Antigravity 2.0 از راست‌چین (RTL) پشتیبانی نمی‌کند. متن‌های فارسی از چپ نمایش داده می‌شوند.

### راه‌حل
این اسکریپت دکمه‌های کنترل هوشمند را به نوار عنوان برنامه اضافه می‌کند، از کدها و علائم نگارشی محافظت می‌کند و از Windows، macOS و Linux پشتیبانی می‌کند.

### 🚀 نصب با یک دستور (NPX)
```bash
npx github:NaorHL1/antigravity-rtl-patch
```

پس از نصب، برنامه را دوباره باز کنید.

---

## 📄 License
MIT — see [LICENSE](LICENSE).

## ⚠️ Disclaimer
*This is an unofficial community tool. Not affiliated with or endorsed by Antigravity. If the Antigravity team has any concerns, please [open an issue](https://github.com/NaorHL1/antigravity-rtl-patch/issues) and we will address them promptly.*
