// منوی همبرگر
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    mainNav.classList.toggle("show");
  });
}

// مدیریت زیرمنوها در موبایل (کلیک روی دسته برای باز/بستن)
const dropdowns = document.querySelectorAll(".dropdown");
if (window.innerWidth <= 768) {
  dropdowns.forEach((drop) => {
    const toggle = drop.querySelector(".dropdown-toggle");
    const menu = drop.querySelector(".dropdown-menu");
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      // بستن بقیه زیرمنوها
      dropdowns.forEach((d) => {
        if (d !== drop) {
          d.querySelector(".dropdown-menu")?.classList.remove("show-mobile");
        }
      });
      menu.classList.toggle("show-mobile");
    });
  });
}

// برای وقتی که اندازه صفحه عوض می‌شود (از موبایل به دسکتاپ)
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    dropdowns.forEach((drop) => {
      drop.querySelector(".dropdown-menu")?.classList.remove("show-mobile");
    });
    if (mainNav) mainNav.classList.remove("show");
  }
});
