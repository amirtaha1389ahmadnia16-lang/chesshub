// ============================================
// 📦 بارگذاری هدر و فوتر
// ============================================

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

// ============================================
// 📱 منوی موبایل
// ============================================

function initMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      mainNav.classList.toggle("show");
      const icon = this.querySelector("i");
      if (icon) {
        icon.style.transform = mainNav.classList.contains("show")
          ? "rotate(90deg)"
          : "rotate(0deg)";
      }
    });
  }

  function initMobileDropdowns() {
    if (window.innerWidth <= 768) {
      const dropdowns = document.querySelectorAll(".dropdown");
      dropdowns.forEach((drop) => {
        const toggle = drop.querySelector(".dropdown-toggle");
        const menu = drop.querySelector(".dropdown-menu");
        if (toggle && menu) {
          toggle.removeEventListener("click", toggle._clickHandler);
          const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdowns.forEach((d) => {
              if (d !== drop) {
                const otherMenu = d.querySelector(".dropdown-menu");
                if (otherMenu) {
                  otherMenu.classList.remove("show-mobile");
                  d.classList.remove("open");
                }
              }
            });
            menu.classList.toggle("show-mobile");
            drop.classList.toggle("open");
          };
          toggle._clickHandler = handler;
          toggle.addEventListener("click", handler);
        }
      });
    } else {
      document.querySelectorAll(".dropdown-menu").forEach((menu) => {
        menu.classList.remove("show-mobile");
      });
      document.querySelectorAll(".dropdown").forEach((drop) => {
        drop.classList.remove("open");
      });
    }
  }

  document.addEventListener("click", function (e) {
    const nav = document.getElementById("mainNav");
    const toggle = document.getElementById("menuToggle");
    if (nav && toggle) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove("show");
        const icon = toggle.querySelector("i");
        if (icon) icon.style.transform = "rotate(0deg)";
        document.querySelectorAll(".dropdown-menu").forEach((menu) => {
          menu.classList.remove("show-mobile");
        });
        document.querySelectorAll(".dropdown").forEach((drop) => {
          drop.classList.remove("open");
        });
      }
    }
  });

  initMobileDropdowns();
  window.addEventListener("resize", initMobileDropdowns);
}

// ============================================
// ⚙️ سیستم تنظیمات سراسری
// ============================================

(function () {
  "use strict";

  const defaultSettings = {
    pieceSet: "classic",
    theme: "4",
    sound: true,
  };

  // ✅ ۳۸ مجموعه مهره کامل (هماهنگ با settings.html)
  const pieceSets = [
    // سه بعدی
    "3d_chesskid",
    "3d_plastic",
    "3d_staunton",
    "3d_wood",
    // کلاسیک
    "alpha",
    "bases",
    "classic",
    "club",
    "condal",
    "tournament",
    "vintage",
    // مدرن
    "glass",
    "light",
    "marble",
    "metal",
    "modern",
    "neo",
    "neon",
    // کارتونی
    "8_bit",
    "bubblegum",
    "graffiti",
    "lolz",
    "tigers",
    // طبیعت
    "icy_sea",
    "nature",
    "neo_wood",
    "ocean",
    "sky",
    "wood",
    // ویژه
    "blindfold",
    "book",
    "cases",
    "dash",
    "game_room",
    "gothic",
    "maya",
    "newspaper",
    "space",
  ];

  // ============================================
  // 💾 توابع اصلی تنظیمات
  // ============================================

  function loadSettings() {
    try {
      const saved = localStorage.getItem("chesshub_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      }
    } catch (e) {
      console.warn("خطا در خواندن تنظیمات:", e);
    }
    return { ...defaultSettings };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem("chesshub_settings", JSON.stringify(settings));
    } catch (e) {
      console.warn("خطا در ذخیره تنظیمات:", e);
    }
  }

  function getCurrentPieceSet() {
    return loadSettings().pieceSet || "classic";
  }

  function getCurrentTheme() {
    return loadSettings().theme || "4";
  }

  function isSoundEnabled() {
    return loadSettings().sound !== false;
  }

  // ============================================
  // 🎨 پنل تنظیمات (برای استفاده در همه صفحات)
  // ============================================

  function togglePanel(open) {
    const panel = document.getElementById("settingsPanel");
    if (!panel) return;

    if (open === undefined) {
      panel.classList.toggle("open");
      document.body.style.overflow = panel.classList.contains("open")
        ? "hidden"
        : "";
    } else if (open) {
      panel.classList.add("open");
      document.body.style.overflow = "hidden";
    } else {
      panel.classList.remove("open");
      document.body.style.overflow = "";
    }
  }

  // ============================================
  // 🎨 اعمال تم
  // ============================================

  function applyTheme(theme) {
    document.body.className = document.body.className
      .split(" ")
      .filter((cls) => !cls.startsWith("theme-"))
      .join(" ");

    if (theme && theme !== "light" && theme !== "1") {
      document.body.classList.add(`theme-${theme}`);
    } else if (theme === "light") {
      document.body.classList.add("theme-light");
    } else {
      document.body.classList.add("theme-4");
    }

    const settings = loadSettings();
    settings.theme = theme;
    saveSettings(settings);

    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });

    // ارسال رویداد به سایر صفحات
    document.dispatchEvent(
      new CustomEvent("themeChanged", {
        detail: { theme: theme },
      }),
    );
  }

  // ============================================
  // ♟️ تغییر مجموعه مهره‌ها
  // ============================================

  function changePieceSet(setName) {
    if (!pieceSets.includes(setName)) {
      console.warn(`مجموعه مهره "${setName}" موجود نیست`);
      return;
    }

    const settings = loadSettings();
    settings.pieceSet = setName;
    saveSettings(settings);

    document.querySelectorAll(".piece-set-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.set === setName);
    });

    // ارسال رویداد به سایر صفحات
    document.dispatchEvent(
      new CustomEvent("pieceSetChanged", {
        detail: { pieceSet: setName },
      }),
    );
  }

  // ============================================
  // 🔊 صدا
  // ============================================

  function toggleSound(enabled) {
    const settings = loadSettings();
    settings.sound = enabled;
    saveSettings(settings);

    const label = document.querySelector(".toggle-label");
    if (label) label.textContent = enabled ? "فعال" : "غیرفعال";

    document.dispatchEvent(
      new CustomEvent("soundChanged", {
        detail: { sound: enabled },
      }),
    );
  }

  // ============================================
  // 🎨 ساخت دکمه‌های مهره (فقط در صفحات دیگر به‌جز settings.html)
  // ============================================

  function buildPieceSetButtons() {
    const container = document.getElementById("pieceSetsContainer");
    if (!container) return;

    // اگه در صفحه تنظیمات هستیم، کاری نکن (چون خودش مدیریت میکنه)
    if (window._isSettingsPage) return;

    const currentSet = getCurrentPieceSet();
    container.innerHTML = "";

    pieceSets.forEach((setName) => {
      const btn = document.createElement("button");
      btn.className = `piece-set-btn ${setName === currentSet ? "active" : ""}`;
      btn.dataset.set = setName;
      // اسم زیبا برای نمایش
      const displayName = setName.replace(/_/g, " ");
      btn.textContent =
        displayName.charAt(0).toUpperCase() + displayName.slice(1);
      btn.title = setName;
      btn.onclick = () => {
        changePieceSet(setName);
      };
      container.appendChild(btn);
    });
  }

  // ============================================
  // 🚀 مقداردهی اولیه
  // ============================================

  function initSettings() {
    // 🔹 باز کردن پنل تنظیمات از منو
    const menuLink = document.getElementById("settingsMenuLink");
    if (menuLink) {
      menuLink.addEventListener("click", (e) => {
        e.preventDefault();
        const nav = document.getElementById("mainNav");
        if (nav) nav.classList.remove("show");
        togglePanel(true);
      });
    }

    // 🔹 دکمه بستن پنل
    const closeBtn = document.getElementById("settingsClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => togglePanel(false));
    }

    // 🔹 بستن پنل با کلیک بیرون
    document.addEventListener("click", (e) => {
      const panel = document.getElementById("settingsPanel");
      if (panel && panel.classList.contains("open")) {
        if (!panel.contains(e.target)) {
          togglePanel(false);
        }
      }
    });

    // 🔹 دکمه‌های تم
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.theme);
      });
    });

    // 🔹 دکمه صدا
    const soundToggle = document.getElementById("soundToggle");
    if (soundToggle) {
      const settings = loadSettings();
      soundToggle.checked = settings.sound !== false;
      const label = document.querySelector(".toggle-label");
      if (label) label.textContent = soundToggle.checked ? "فعال" : "غیرفعال";

      soundToggle.addEventListener("change", () => {
        toggleSound(soundToggle.checked);
      });
    }

    // 🔹 دکمه‌های مهره (فقط در صفحات غیر از settings.html)
    if (!window._isSettingsPage) {
      buildPieceSetButtons();
    }

    // 🔹 اعمال تم ذخیره‌شده
    const settings = loadSettings();
    applyTheme(settings.theme || "4");
  }

  // ============================================
  // 📦 صادر کردن توابع به window
  // ============================================

  window.ChessSettings = {
    loadSettings,
    saveSettings,
    applyTheme,
    changePieceSet,
    toggleSound,
    togglePanel,
    getCurrentPieceSet,
    getCurrentTheme,
    isSoundEnabled,
    buildPieceSetButtons,
    pieceSets: pieceSets,
  };

  // ============================================
  // 🚀 راه‌اندازی در زمان مناسب
  // ============================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettings);
  } else {
    initSettings();
  }
})();

// ============================================
// 🎯 توابع کمکی برای استفاده در صفحات دیگر
// ============================================

function getCurrentPieceSet() {
  return window.ChessSettings
    ? window.ChessSettings.getCurrentPieceSet()
    : "classic";
}

function getCurrentTheme() {
  return window.ChessSettings ? window.ChessSettings.getCurrentTheme() : "4";
}

function getBoardColors() {
  const root = document.documentElement;
  const light =
    getComputedStyle(root).getPropertyValue("--board-light").trim() ||
    "#f0d9b5";
  const dark =
    getComputedStyle(root).getPropertyValue("--board-dark").trim() || "#b58863";
  return { light, dark };
}

// ============================================
// 🚀 بارگذاری اولیه
// ============================================

document.addEventListener("DOMContentLoaded", async () => {
  // بارگذاری هدر و فوتر
  await loadComponent("#header-placeholder", "header.html");
  await loadComponent("#footer-placeholder", "footer.html");

  // راه‌اندازی منوی موبایل
  initMobileMenu();

  console.log("✅ ChessHub script loaded successfully");
});
