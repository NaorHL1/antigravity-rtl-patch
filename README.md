# Antigravity 2.0 RTL Patcher

> **A native Right-to-Left (RTL) injection patch for the Antigravity 2.0 Desktop Application.**

[English](#english) | [עברית](#hebrew) | [العربية](#arabic) | [فارسی](#persian)

---

## <a id="english"></a> 🇺🇸 English
## ✨ Features

- **Subtle UI Integration**: The controls are injected cleanly into the top title bar so they don't hide any chat text.
- **✨ Auto RTL (Smart Detection)**: Automatically scans incoming messages. If a paragraph contains mostly Hebrew/Arabic/Persian, it perfectly aligns *only that specific paragraph* to the right, leaving English paragraphs aligned to the left!
- **Code-Aware & Comment Fixing**: Code blocks are strictly protected (LTR). Even better, Hebrew comments inside the code (e.g., `// שלום`) are isolated and rendered perfectly without breaking the code syntax!
- **Safe & Reversible**: Automatically creates a backup (`app.asar.backup`).

## 📋 Requirements

- Windows OS (Support for Mac/Linux coming soon!)
- Antigravity 2.0 Desktop App
- [Node.js](https://nodejs.org/) installed

## 🚀 How to Install
1. **Clone/Download** this repository.
2. Open a terminal in the folder and run: `npm install @electron/asar`
3. Run the patch: `node install.js`
4. **Restart Antigravity** (make sure to close it completely). You will now see the `⇄ Force RTL` and `✨ Auto RTL` buttons in the top right corner.

### 🌟 Planned Features / Roadmap
- **Cross-Platform Support**: Mac and Linux automatic path detection.
- **Keyboard Shortcuts**: Toggle RTL using a hotkey (e.g., `Ctrl+Shift+R`).
- **Persistent State**: Remember your RTL preference across restarts automatically.

---

## <a id="hebrew"></a> 🇮🇱 עברית
סקריפט זה מוסיף כפתורי שליטה לשורת הכותרת של התוכנה המחשבית Antigravity 2.0. 
גולת הכותרת היא מנגנון ה-**✨ Auto RTL** - הוא מזהה אוטומטית פסקאות שנכתבו בעברית והופך *רק אותן* לימין לשמאל, בזמן שפסקאות באנגלית באותה ההודעה נשארות משמאל לימין! בנוסף, הוא מתקן אוטומטית הערות בעברית בתוך בלוקים של קוד כך שהן קריאות לחלוטין.

### 🚀 איך להתקין
1. הורד את הקבצים במאגר זה למחשב שלך.
2. פתח חלון פקודות (Terminal או CMD) בתיקייה שבה שמרת את הקבצים והרץ:
   `npm install @electron/asar`
3. הרץ את סקריפט ההתקנה:
   `node install.js`
4. **הפעל מחדש את התוכנה** (סגור אותה לחלוטין ופתח מחדש). כעת יופיעו לך הכפתורים בפינה העליונה.

---

## <a id="arabic"></a> 🇸🇦 العربية
يقوم هذا السكريبت بإضافة أزرار تحكم في شريط عنوان تطبيق Antigravity 2.0.
يتميز بخاصية **✨ Auto RTL** التي تكتشف تلقائيًا الفقرات المكتوبة بالعربية وتقوم بمحاذاتها إلى اليمين، بينما تظل الفقرات الإنجليزية من اليسار إلى اليمين! كما يقوم بإصلاح التعليقات العربية داخل الأكواد البرمجية لتصبح مقروءة تمامًا.

### 🚀 طريقة التثبيت
1. قم بتنزيل ملفات هذا المستودع إلى جهازك.
2. افتح سطر الأوامر (Terminal) في المجلد وقم بتشغيل:
   `npm install @electron/asar`
3. قم بتشغيل سكريبت التثبيت:
   `node install.js`
4. **أعد تشغيل التطبيق** (أغلقه تماماً ثم افتحه). ستظهر لك الأزرار في الزاوية العلوية.

---

## <a id="persian"></a> 🇮🇷 فارسی
این اسکریپت دکمه‌های کنترلی را به نوار عنوان برنامه دسکتاپ Antigravity 2.0 اضافه می‌کند.
ویژگی برجسته آن **✨ Auto RTL** است که به طور خودکار پاراگراف‌های فارسی را تشخیص داده و آن‌ها را راست‌چین می‌کند، در حالی که پاراگراف‌های انگلیسی چپ‌چین باقی می‌مانند! همچنین نظرات فارسی داخل کدها را اصلاح می‌کند تا کاملاً خوانا باشند.

### 🚀 نحوه نصب
1. فایل‌های این مخزن را دانلود کنید.
2. خط فرمان (Terminal) را در پوشه باز کرده و اجرا کنید:
   `npm install @electron/asar`
3. اسکریپت نصب را اجرا کنید:
   `node install.js`
4. **برنامه را مجدداً راه‌اندازی کنید** (کاملاً ببندید و دوباره باز کنید). اکنون دکمه‌ها را در گوشه بالا مشاهده خواهید کرد.
