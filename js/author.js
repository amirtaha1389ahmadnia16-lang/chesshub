/* ============================================
   👤 ChessHub | سیستم سراسری نام نویسنده
   --------------------------------------------
   این فایل در هر صفحه‌ای که به نام نویسنده نیاز
   دارد بارگذاری می‌شود و دو خروجی سراسری می‌سازد:

   1) window.ChessHubAuthor        → آبجکت مدیریت نام
      - .name   : نام فعلی (رشته یا خالی)
      - .has()  : آیا نام انتخاب شده است؟
      - .set(v) : ذخیره‌ی نام (فقط یک بار از کاربر
                  پرسیده می‌شود)

   2) window.ChessHubAuthorName    → متغیر متنی ساده
      برای صفحاتی که فقط خودِ نام را می‌خواهند.

   نام در localStorage با کلید chesshub_author_name
   ذخیره می‌شود و پس از تغییر، رویداد
   «chesshub:author-changed» روی document منتشر می‌شود.
   ============================================ */
window.ChessHubAuthor = (function () {
  "use strict";

  const STORAGE_KEY = "chesshub_author_name";
  const MAX_LEN = 40;

  function read() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  let _name = read();

  // متغیر سراسری دوم — سایر صفحات مستقیماً همین را می‌خوانند
  window.ChessHubAuthorName = _name;

  const api = {
    KEY: STORAGE_KEY,
    MAX_LEN: MAX_LEN,

    get name() {
      return _name;
    },

    has() {
      return !!(_name && _name.trim().length >= 2);
    },

    set(value) {
      const clean = String(value == null ? "" : value)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, MAX_LEN);
      if (clean.length < 2) return false;
      _name = clean;
      try {
        localStorage.setItem(STORAGE_KEY, _name);
      } catch (e) {
        /* حالت خصوصی مرورگر — نام فقط در همین صفحه معتبر می‌ماند */
      }
      window.ChessHubAuthorName = _name;
      document.dispatchEvent(
        new CustomEvent("chesshub:author-changed", {
          detail: { name: _name },
        })
      );
      return true;
    },
  };

  return api;
})();
