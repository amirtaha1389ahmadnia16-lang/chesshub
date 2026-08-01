// ============================================
// 🏗️ ChessHub - فایل اصلی اسکریپت
// ============================================

(function () {
  "use strict";

  // ============================================
  // 🧩 توابع مشترک ChessUtils (یکپارچه)
  // ============================================

  const ChessUtils = {
    pieceCodes: {
      wk: "wk.png",
      wq: "wq.png",
      wr: "wr.png",
      wb: "wb.png",
      wn: "wn.png",
      wp: "wp.png",
      bk: "bk.png",
      bq: "bq.png",
      br: "br.png",
      bb: "bb.png",
      bn: "bn.png",
      bp: "bp.png",
    },

    _pieceImages: {},
    _loadedPieces: false,
    _pendingResolvers: [],

    getCurrentPieceSet() {
      try {
        const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
        return settings?.pieceSet || "neo";
      } catch {
        return "neo";
      }
    },

    loadPieces() {
      return new Promise((resolve) => {
        if (this._loadedPieces) {
          resolve();
          return;
        }

        const pieceSet = this.getCurrentPieceSet();
        let loaded = 0;
        const total = Object.keys(this.pieceCodes).length;

        if (total === 0) {
          this._loadedPieces = true;
          resolve();
          return;
        }

        for (const [key, filename] of Object.entries(this.pieceCodes)) {
          const img = new Image();
          img.onload = img.onerror = () => {
            loaded++;
            if (loaded === total) {
              this._loadedPieces = true;
              resolve();
              this._pendingResolvers.forEach((r) => r());
              this._pendingResolvers = [];
            }
          };
          img.src = `pieces/${pieceSet}/${filename}`;
          this._pieceImages[key] = img;
        }
      });
    },

    getPieceImage(key) {
      return this._pieceImages[key] || null;
    },

    getBoardColors() {
      const root = document.documentElement;
      const light =
        getComputedStyle(root).getPropertyValue("--board-light").trim() ||
        "#f0d9b5";
      const dark =
        getComputedStyle(root).getPropertyValue("--board-dark").trim() ||
        "#b58863";
      return { light, dark };
    },

    _promotionModal: null,
    _promotionCallback: null,

    _initPromotionModal() {
      if (this._promotionModal) return;

      this._promotionModal = document.createElement("div");
      this._promotionModal.id = "promotionModal";
      this._promotionModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); display: none; justify-content: center;
        align-items: center; z-index: 2000; backdrop-filter: blur(4px);
      `;

      const modalContent = document.createElement("div");
      modalContent.style.cssText = `
        background: white; border-radius: 32px; padding: 20px; text-align: center;
        box-shadow: 0 20px 35px rgba(0,0,0,0.3); direction: rtl;
        max-width: 90vw;
      `;
      modalContent.innerHTML = `
        <h3 style="margin-bottom:15px;">ترفیع پیاده</h3>
        <div id="promotionOptions" style="display:flex; gap:15px; justify-content:center; flex-wrap:wrap;"></div>
      `;
      this._promotionModal.appendChild(modalContent);
      document.body.appendChild(this._promotionModal);
    },

    showPromotion(color, callback) {
      this._initPromotionModal();
      this._promotionCallback = callback;

      const optionsDiv = document.getElementById("promotionOptions");
      optionsDiv.innerHTML = "";

      const pieces = [
        { type: "n", name: "اسب", file: "wn.png" },
        { type: "b", name: "فیل", file: "wb.png" },
        { type: "r", name: "رخ", file: "wr.png" },
        { type: "q", name: "وزیر", file: "wq.png" },
      ];

      const pieceSet = this.getCurrentPieceSet();

      pieces.forEach((piece) => {
        const btn = document.createElement("div");
        btn.style.cssText = `
          cursor: pointer; padding: 10px; background: #f0f0f0;
          border-radius: 20px; transition: 0.2s; margin: 5px;
          text-align: center; min-width: 60px;
        `;
        btn.onmouseover = () => (btn.style.transform = "scale(1.05)");
        btn.onmouseout = () => (btn.style.transform = "scale(1)");
        btn.ontouchstart = () => (btn.style.transform = "scale(0.95)");
        btn.ontouchend = () => (btn.style.transform = "scale(1)");

        const img = document.createElement("img");
        img.src = `pieces/${pieceSet}/${piece.file}`;
        img.style.width = "60px";
        img.style.height = "60px";
        img.style.maxWidth = "50px";
        img.style.maxHeight = "50px";

        const label = document.createElement("div");
        label.textContent = piece.name;
        label.style.fontSize = "0.8rem";
        label.style.marginTop = "4px";

        btn.appendChild(img);
        btn.appendChild(label);
        btn.onclick = () => {
          this._promotionModal.style.display = "none";
          if (this._promotionCallback) {
            this._promotionCallback(piece.type);
            this._promotionCallback = null;
          }
        };
        optionsDiv.appendChild(btn);
      });

      this._promotionModal.style.display = "flex";
    },

    hidePromotion() {
      if (this._promotionModal) {
        this._promotionModal.style.display = "none";
      }
      this._promotionCallback = null;
    },

    computeUserColor(moves) {
      if (!moves || moves.length === 0) return "w";
      const firstMoveColor = moves[0].color;
      return firstMoveColor === "w" ? "b" : "w";
    },
  };

  window.ChessUtils = ChessUtils;

  window.ChessUtilsBound = {
    loadPieces: ChessUtils.loadPieces.bind(ChessUtils),
    getCurrentPieceSet: ChessUtils.getCurrentPieceSet.bind(ChessUtils),
    getBoardColors: ChessUtils.getBoardColors.bind(ChessUtils),
    showPromotion: ChessUtils.showPromotion.bind(ChessUtils),
    computeUserColor: ChessUtils.computeUserColor.bind(ChessUtils),
    getPieceImage: ChessUtils.getPieceImage.bind(ChessUtils),
    hidePromotion: ChessUtils.hidePromotion.bind(ChessUtils),
    pieceCodes: ChessUtils.pieceCodes,
  };

  document.addEventListener("pieceSetChanged", function () {
    ChessUtils._loadedPieces = false;
    ChessUtils._pieceImages = {};
    ChessUtils.loadPieces();
  });

  // ============================================
  // 🧩 بارگذاری هدر و فوتر
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
  // 📱 منوی موبایل (اصلاح شده - مطابق تصویر)
  // ============================================

  function initMobileMenu() {
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    if (!menuToggle || !mainNav) return;

    // باز و بسته کردن منو
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

    // مدیریت منوهای کشویی در موبایل
    function initMobileDropdowns() {
      if (window.innerWidth <= 768) {
        const dropdowns = document.querySelectorAll(".dropdown");
        dropdowns.forEach((drop) => {
          const toggle = drop.querySelector(".dropdown-toggle");
          const menu = drop.querySelector(".dropdown-menu");
          if (toggle && menu) {
            // حذف رویداد قبلی
            toggle.removeEventListener("click", toggle._mobileHandler);

            const handler = function (e) {
              e.preventDefault();
              e.stopPropagation();

              // بستن سایر منوهای کشویی
              dropdowns.forEach((d) => {
                if (d !== drop) {
                  const otherMenu = d.querySelector(".dropdown-menu");
                  if (otherMenu) {
                    otherMenu.classList.remove("show-mobile");
                  }
                  d.classList.remove("open");
                }
              });

              // باز/بسته کردن منوی فعلی
              menu.classList.toggle("show-mobile");
              drop.classList.toggle("open");
            };

            toggle._mobileHandler = handler;
            toggle.addEventListener("click", handler);
          }
        });
      } else {
        // در دسکتاپ، منوهای کشویی را ریست کن
        document.querySelectorAll(".dropdown-menu").forEach((menu) => {
          menu.classList.remove("show-mobile");
        });
        document.querySelectorAll(".dropdown").forEach((drop) => {
          drop.classList.remove("open");
        });
      }
    }

    // بستن منو با کلیک خارج از آن
    document.addEventListener("click", function (e) {
      const nav = document.getElementById("mainNav");
      const toggle = document.getElementById("menuToggle");
      if (nav && toggle) {
        if (!nav.contains(e.target) && !toggle.contains(e.target)) {
          nav.classList.remove("show");
          const icon = toggle.querySelector("i");
          if (icon) icon.style.transform = "rotate(0deg)";

          // بستن منوهای کشویی
          document.querySelectorAll(".dropdown-menu").forEach((menu) => {
            menu.classList.remove("show-mobile");
          });
          document.querySelectorAll(".dropdown").forEach((drop) => {
            drop.classList.remove("open");
          });
        }
      }
    });

    // بستن منو با کلیک روی لینک‌ها (در موبایل)
    document
      .querySelectorAll(".nav-list > li > a:not(.dropdown-toggle)")
      .forEach((link) => {
        link.addEventListener("click", function () {
          if (window.innerWidth <= 768) {
            const nav = document.getElementById("mainNav");
            const toggle = document.getElementById("menuToggle");
            if (nav) nav.classList.remove("show");
            if (toggle) {
              const icon = toggle.querySelector("i");
              if (icon) icon.style.transform = "rotate(0deg)";
            }
          }
        });
      });

    // مقداردهی اولیه
    initMobileDropdowns();

    // مقداردهی مجدد هنگام تغییر سایز
    let resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(initMobileDropdowns, 200);
    });
  }

  // ============================================
  // ⚙️ سیستم تنظیمات (ادغام شده با ChessUtils)
  // ============================================

  const defaultSettings = {
    pieceSet: "neo",
    theme: "1",
    sound: true,
  };

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

  function toggleSound(enabled) {
    const settings = loadSettings();
    settings.sound = enabled;
    saveSettings(settings);

    const label = document.querySelector(".toggle-label");
    if (label) label.textContent = enabled ? "فعال" : "غیرفعال";
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

  // ============================================
  // 🚀 مقداردهی اولیه
  // ============================================

  function initSettings() {
    const menuLink = document.getElementById("settingsMenuLink");
    if (menuLink) {
      menuLink.addEventListener("click", (e) => {
        e.preventDefault();
        const nav = document.getElementById("mainNav");
        if (nav) nav.classList.remove("show");
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

    const settings = loadSettings();
    applyTheme(settings.theme || "1");
  }

  // ============================================
  // 🌐 توابع کمکی برای دسترسی از سایر فایل‌ها
  // ============================================

  function getCurrentPieceSet() {
    return ChessUtils.getCurrentPieceSet();
  }

  function getCurrentTheme() {
    return loadSettings().theme || "1";
  }

  // ============================================
  // 🚀 اجرا پس از بارگذاری کامل DOM
  // ============================================

  console.log("✅ ChessHub script.js loaded successfully");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
      await loadComponent("#header-placeholder", "header.html");
      await loadComponent("#footer-placeholder", "footer.html");
      initMobileMenu();
      initSettings();
    });
  } else {
    (async () => {
      await loadComponent("#header-placeholder", "header.html");
      await loadComponent("#footer-placeholder", "footer.html");
      initMobileMenu();
      initSettings();
    })();
  }

  // ============================================
  // 📦 صادرات برای استفاده در سایر فایل‌ها
  // ============================================

  window.ChessHub = {
    ChessUtils,
    loadSettings,
    saveSettings,
    applyTheme,
    toggleSound,
    togglePanel,
    getCurrentPieceSet,
    getCurrentTheme,
    loadComponent,
    initMobileMenu,
  };
})();
