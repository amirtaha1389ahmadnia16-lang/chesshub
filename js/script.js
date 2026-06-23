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
// ⚙️ سیستم تنظیمات
// ============================================

(function () {
  const defaultSettings = {
    pieceSet: "cburnett",
    theme: "light",
    sound: true,
  };

  const pieceSets = [
    "cburnett",
    "merida",
    "alpha",
    "california",
    "cardinal",
    "dubrovny",
    "gioco",
    "governor",
    "icpieces",
    "maestro",
    "staunty",
    "tatiana",
  ];

  function loadSettings() {
    try {
      const saved = localStorage.getItem("chesshub_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      }
    } catch (e) {}
    return defaultSettings;
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem("chesshub_settings", JSON.stringify(settings));
    } catch (e) {}
  }

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

  function applyTheme(theme) {
    document.body.className = document.body.className
      .split(" ")
      .filter((cls) => !cls.startsWith("theme-"))
      .join(" ");

    if (theme && theme !== "light") {
      document.body.classList.add(`theme-${theme}`);
    }

    const settings = loadSettings();
    settings.theme = theme;
    saveSettings(settings);

    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });
  }

  function changePieceSet(setName) {
    if (!pieceSets.includes(setName)) return;

    const settings = loadSettings();
    settings.pieceSet = setName;
    saveSettings(settings);

    document.querySelectorAll(".piece-set-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.set === setName);
    });

    const event = new CustomEvent("pieceSetChanged", {
      detail: { pieceSet: setName },
    });
    document.dispatchEvent(event);
  }

  function toggleSound(enabled) {
    const settings = loadSettings();
    settings.sound = enabled;
    saveSettings(settings);

    const label = document.querySelector(".toggle-label");
    if (label) label.textContent = enabled ? "فعال" : "غیرفعال";
  }

  function buildPieceSetButtons() {
    const container = document.getElementById("pieceSetsContainer");
    if (!container) return;

    const currentSet = loadSettings().pieceSet || "cburnett";
    container.innerHTML = "";

    pieceSets.forEach((setName) => {
      const btn = document.createElement("button");
      btn.className = `piece-set-btn ${setName === currentSet ? "active" : ""}`;
      btn.dataset.set = setName;
      btn.textContent = setName.charAt(0).toUpperCase() + setName.slice(1);
      btn.title = setName;
      btn.onclick = () => {
        changePieceSet(setName);
      };
      container.appendChild(btn);
    });
  }

  function initSettings() {
    // باز کردن از منو
    const menuLink = document.getElementById("settingsMenuLink");
    if (menuLink) {
      menuLink.addEventListener("click", (e) => {
        e.preventDefault();
        // بستن منو
        const nav = document.getElementById("mainNav");
        if (nav) nav.classList.remove("show");
        // باز کردن پنل تنظیمات
        togglePanel(true);
      });
    }

    const closeBtn = document.getElementById("settingsClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => togglePanel(false));
    }

    document.addEventListener("click", (e) => {
      const panel = document.getElementById("settingsPanel");
      if (panel && panel.classList.contains("open")) {
        if (!panel.contains(e.target)) {
          togglePanel(false);
        }
      }
    });

    document.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.theme);
      });
    });

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

    buildPieceSetButtons();

    const settings = loadSettings();
    applyTheme(settings.theme || "light");
  }

  window.ChessSettings = {
    loadSettings,
    saveSettings,
    applyTheme,
    changePieceSet,
    toggleSound,
    togglePanel,
    getCurrentPieceSet: () => loadSettings().pieceSet || "cburnett",
    getCurrentTheme: () => loadSettings().theme || "light",
    isSoundEnabled: () => loadSettings().sound !== false,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettings);
  } else {
    initSettings();
  }
})();

function getCurrentPieceSet() {
  return window.ChessSettings
    ? window.ChessSettings.getCurrentPieceSet()
    : "cburnett";
}

function getCurrentTheme() {
  return window.ChessSettings
    ? window.ChessSettings.getCurrentTheme()
    : "light";
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadComponent("#header-placeholder", "header.html");
  await loadComponent("#footer-placeholder", "footer.html");
  initMobileMenu();
});



