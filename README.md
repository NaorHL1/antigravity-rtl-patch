# Antigravity 2.0 RTL Patcher

> **A native Right-to-Left (RTL) injection patch for the Antigravity 2.0 Desktop Application.**

[English](#english) | [עברית](#hebrew) | [العربية](#arabic) | [فارسی](#persian)

---

## <a id="english"></a> 🇺🇸 English
This script injects a subtle, transparent toggle button directly into the title bar of the Antigravity 2.0 desktop application. Clicking the button aligns the chat text (Hebrew, Arabic, Persian) to the right while strictly preserving Left-to-Right (LTR) alignment for code blocks, terminal outputs, input boxes, and UI elements.

### 📋 Requirements
- Windows OS (Support for Mac/Linux coming soon!)
- Antigravity 2.0 Desktop App
- [Node.js](https://nodejs.org/) installed

### 🚀 How to Install
1. **Clone/Download** this repository.
2. Open a terminal in the folder and run: `npm install @electron/asar`
3. Run the patch: `node install.js`
4. **Restart Antigravity** (make sure to close it completely). You will now see a `⇄ RTL` button in the top right corner.

### 🌟 Planned Features / Roadmap
- **Cross-Platform Support**: Mac and Linux automatic path detection.
- **Keyboard Shortcuts**: Toggle RTL using a hotkey (e.g., `Ctrl+Shift+R`).
- **Persistent State**: Remember your RTL preference across restarts automatically.
- **Auto-Detection**: Automatically detect Arabic/Hebrew/Persian text and adjust direction dynamically.

---

## <a id="hebrew"></a> 🇮🇱 עברית
סקריפט זה מוסיף כפתור שקוף ועדין לשורת הכותרת של התוכנה המחשבית Antigravity 2.0. לחיצה על הכפתור מיישרת את הטקסט בצ'אט לימין (RTL), תוך שמירה קפדנית על יישור לשמאל (LTR) עבור בלוקים של קוד, מסופי פקודה (Terminal), תיבת ההקלדה ושאר רכיבי הממשק.

### 🚀 איך להתקין
1. הורד את הקבצים במאגר זה למחשב שלך.
2. פתח חלון פקודות (Terminal או CMD) בתיקייה שבה שמרת את הקבצים והרץ:
   `npm install @electron/asar`
3. הרץ את סקריפט ההתקנה:
   `node install.js`
4. **הפעל מחדש את התוכנה** (סגור אותה לחלוטין ופתח מחדש). כעת יופיע לך כפתור `⇄ RTL` בפינה העליונה.

---

## <a id="arabic"></a> 🇸🇦 العربية
يقوم هذا السكريبت بإضافة زر تبديل شفاف وصغير في شريط عنوان تطبيق Antigravity 2.0 لسطح المكتب. عند النقر على الزر، يتم محاذاة نص الدردشة (العربية، العبرية، الفارسية) إلى اليمين (RTL) مع الحفاظ التام على محاذاة الكود البرمجي وعناصر واجهة المستخدم من اليسار إلى اليمين (LTR).

### 🚀 طريقة التثبيت
1. قم بتنزيل ملفات هذا المستودع إلى جهازك.
2. افتح سطر الأوامر (Terminal) في المجلد وقم بتشغيل:
   `npm install @electron/asar`
3. قم بتشغيل سكريبت التثبيت:
   `node install.js`
4. **أعد تشغيل التطبيق** (أغلقه تماماً ثم افتحه). سيظهر لك زر `⇄ RTL` في الزاوية العلوية.

---

## <a id="persian"></a> 🇮🇷 فارسی
این اسکریپت یک دکمه تغییر حالت شفاف و ظریف را به نوار عنوان برنامه دسکتاپ Antigravity 2.0 اضافه می‌کند. با کلیک روی این دکمه، متن چت (فارسی، عربی، عبری) به صورت راست‌چین (RTL) تنظیم می‌شود، در حالی که کدها و عناصر رابط کاربری به صورت چپ‌چین (LTR) حفظ می‌شوند.

### 🚀 نحوه نصب
1. فایل‌های این مخزن را دانلود کنید.
2. خط فرمان (Terminal) را در پوشه باز کرده و اجرا کنید:
   `npm install @electron/asar`
3. اسکریپت نصب را اجرا کنید:
   `node install.js`
4. **برنامه را مجدداً راه‌اندازی کنید** (کاملاً ببندید و دوباره باز کنید). اکنون دکمه `⇄ RTL` را در گوشه بالا مشاهده خواهید کرد.
