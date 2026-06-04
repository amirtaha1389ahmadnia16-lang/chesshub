// ========== بارگذاری هدر و فوتر از فایل‌های خارجی ==========
async function loadComponent(selector, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const element = document.querySelector(selector);
    if (element) element.innerHTML = html;
    else console.warn(`المان ${selector} پیدا نشد`);
  } catch (error) {
    console.error(`خطا در بارگذاری ${url}:`, error);
  }
}

// ========== منوی همبرگر و مدیریت دراپ‌داون موبایل ==========
function initMobileMenu() {
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
}

// ========== اجرا بعد از بارگذاری کامل DOM ==========
document.addEventListener("DOMContentLoaded", async () => {
  // بارگذاری هدر و فوتر
  await loadComponent("#header-placeholder", "header.html");
  await loadComponent("#footer-placeholder", "footer.html");

  // راه‌اندازی منوی موبایل (بعد از لود هدر)
  initMobileMenu();
});
