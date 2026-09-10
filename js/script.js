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
        if (this._loadedPieces) return resolve();
        const pieceSet = this.getCurrentPieceSet();
        let loaded = 0;
        const total = Object.keys(this.pieceCodes).length;
        for (const [key, filename] of Object.entries(this.pieceCodes)) {
          const img = new Image();
          img.onload = img.onerror = () => {
            loaded++;
            if (loaded === total) {
              this._loadedPieces = true;
              resolve();
            }
          };
          img.src = `pieces/${pieceSet}/${filename}`;
          this._pieceImages[key] = img;
        }
      });
    },
    getBoardColors() {
      const root = document.documentElement;
      return {
        light:
          getComputedStyle(root).getPropertyValue("--board-light").trim() ||
          "#f0d9b5",
        dark:
          getComputedStyle(root).getPropertyValue("--board-dark").trim() ||
          "#b58863",
      };
    },
  };

  window.ChessUtils = ChessUtils;
  window.ChessUtilsBound = {
    loadPieces: ChessUtils.loadPieces.bind(ChessUtils),
    getCurrentPieceSet: ChessUtils.getCurrentPieceSet.bind(ChessUtils),
    getBoardColors: ChessUtils.getBoardColors.bind(ChessUtils),
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
    } catch (error) {
      console.error(`خطا در بارگذاری ${url}:`, error);
    }
  }

  // ============================================
  // 📱 منوی موبایل و کشویی
  // ============================================
  function initMobileMenu() {
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    if (!menuToggle || !mainNav) return;

    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      mainNav.classList.toggle("show");
      const icon = this.querySelector("i");
      if (icon)
        icon.style.transform = mainNav.classList.contains("show")
          ? "rotate(90deg)"
          : "rotate(0deg)";
    });

    function initMobileDropdowns() {
      if (window.innerWidth <= 768) {
        document.querySelectorAll(".dropdown").forEach((drop) => {
          const toggle = drop.querySelector(".dropdown-toggle");
          const menu = drop.querySelector(".dropdown-menu");
          if (toggle && menu) {
            toggle.removeEventListener("click", toggle._mobileHandler);
            const handler = function (e) {
              e.preventDefault();
              e.stopPropagation();
              document.querySelectorAll(".dropdown").forEach((d) => {
                if (d !== drop) {
                  d.querySelector(".dropdown-menu")?.classList.remove(
                    "show-mobile",
                  );
                  d.classList.remove("open");
                }
              });
              menu.classList.toggle("show-mobile");
              drop.classList.toggle("open");
            };
            toggle._mobileHandler = handler;
            toggle.addEventListener("click", handler);
          }
        });
      } else {
        document
          .querySelectorAll(".dropdown-menu")
          .forEach((menu) => menu.classList.remove("show-mobile"));
        document
          .querySelectorAll(".dropdown")
          .forEach((drop) => drop.classList.remove("open"));
      }
    }

    document.addEventListener("click", function (e) {
      if (
        mainNav &&
        menuToggle &&
        !mainNav.contains(e.target) &&
        !menuToggle.contains(e.target)
      ) {
        mainNav.classList.remove("show");
        const icon = menuToggle.querySelector("i");
        if (icon) icon.style.transform = "rotate(0deg)";
        document
          .querySelectorAll(".dropdown-menu")
          .forEach((menu) => menu.classList.remove("show-mobile"));
        document
          .querySelectorAll(".dropdown")
          .forEach((drop) => drop.classList.remove("open"));
      }
    });

    initMobileDropdowns();
    let resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(initMobileDropdowns, 200);
    });
  }

  // ============================================
  // ⚙️ سیستم تنظیمات
  // ============================================
  const defaultSettings = { pieceSet: "neo", theme: "1", sound: true };

  function loadSettings() {
    try {
      const saved = localStorage.getItem("chesshub_settings");
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch (e) {}
    return defaultSettings;
  }

  function applyTheme(theme) {
    document.body.className = document.body.className
      .split(" ")
      .filter((cls) => !cls.startsWith("theme-"))
      .join(" ");
    if (theme && theme !== "light")
      document.body.classList.add(`theme-${theme}`);
    const settings = loadSettings();
    settings.theme = theme;
    localStorage.setItem("chesshub_settings", JSON.stringify(settings));
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
      const settings = loadSettings();
      applyTheme(settings.theme || "1");
    });
  } else {
    (async () => {
      await loadComponent("#header-placeholder", "header.html");
      await loadComponent("#footer-placeholder", "footer.html");
      initMobileMenu();
      const settings = loadSettings();
      applyTheme(settings.theme || "1");
    })();
  }

  window.ChessHub = {
    ChessUtils,
    loadSettings,
    applyTheme,
    loadComponent,
    initMobileMenu,
  };
})();
