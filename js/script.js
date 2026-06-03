// منوی همبرگر (برای تمام صفحات)
document.addEventListener("DOMContentLoaded", function () {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", function () {
      mainNav.classList.toggle("show");
    });
  }

  // مدیریت زیرمنوها در موبایل (کلیک روی دسته برای باز/بستن)
  function initMobileDropdowns() {
    if (window.innerWidth <= 768) {
      const dropdowns = document.querySelectorAll(".dropdown");
      dropdowns.forEach((drop) => {
        const toggle = drop.querySelector(".dropdown-toggle");
        const menu = drop.querySelector(".dropdown-menu");
        if (toggle && menu) {
          // حذف رویداد قبلی برای جلوگیری از دوبار绑定
          toggle.removeEventListener("click", toggle._clickHandler);
          const handler = (e) => {
            e.preventDefault();
            // بستن بقیه زیرمنوها
            dropdowns.forEach((d) => {
              if (d !== drop) {
                const otherMenu = d.querySelector(".dropdown-menu");
                if (otherMenu) otherMenu.classList.remove("show-mobile");
              }
            });
            menu.classList.toggle("show-mobile");
          };
          toggle._clickHandler = handler;
          toggle.addEventListener("click", handler);
        }
      });
    } else {
      // در حالت دسکتاپ، اطمینان از بسته بودن منوهای موبایل
      document.querySelectorAll(".dropdown-menu").forEach((menu) => {
        menu.classList.remove("show-mobile");
      });
    }
  }

  // اجرای اولیه و هنگام تغییر اندازه صفحه
  initMobileDropdowns();
  window.addEventListener("resize", initMobileDropdowns);
});
