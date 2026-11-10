/* ============================================================
   ♛ ChessHub — فایل اسکریپت اصلی (مشترک بین همه صفحات)
   ------------------------------------------------------------
   وظایف این فایل:
   ۱) تزریق header.html و footer.html در تمام صفحات
   ۲) منوی موبایل و منوهای آبشاری
   ۳) سیستم تنظیمات (localStorage: chesshub_settings)
   ۴) ChessUtils — پیش‌بارگذاری مهره‌ها، مودال ترفیع، صداها
   ۵) درگ‌ودراپ مهره‌ها — هم ماوس (ویندوز) هم لمس (موبایل) + کلیک‌کلیک
   ۶) منطق صفحه تنظیمات (۲۹ تم + مجموعه‌های مهره)
   ============================================================ */

(function () {
  "use strict";

/* 🖼️ فالبک آواتار محلی — بدون هیچ سرویس اینترنتی (v8.1.2) */
window.chFb = function (name) {
  var ch = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    '<rect width="64" height="64" rx="8" fill="#2c3e50"/>' +
    '<text x="32" y="42" font-size="30" fill="#fff" text-anchor="middle" font-family="sans-serif">' + ch + '</text></svg>';
  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
};
window.chPh = function (w, h, label) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<rect width="100%" height="100%" fill="#22303f"/>' +
    '<text x="50%" y="55%" font-size="26" fill="#8fa3b5" text-anchor="middle" font-family="sans-serif">' + (label || "Chess") + '</text></svg>';
  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
};


  /* ============================================
     ۰) ابزارهای کمکی
     ============================================ */

  // تبدیل عدد به رقم فارسی:  faNum(1902) → «۱٬۹۰۲»
  function faNum(n) {
    try {
      return Number(n).toLocaleString("fa-IR");
    } catch (e) {
      return String(n);
    }
  }

  /* ============================================
     ۱) سیستم تنظیمات
     ============================================ */

  const defaultSettings = {
    pieceSet: "neo",
    theme: "1",
    sound: true,
  };

  function loadSettings() {
    try {
      const saved = localStorage.getItem("chesshub_settings");
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch (e) {}
    return { ...defaultSettings };
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

  // اعمال سریع تم ذخیره‌شده هنگام بوت (قبل از هر رندری)
  function applySavedThemeEarly() {
    const settings = loadSettings();
    const theme = settings.theme || "1";
    document.body.classList.add(`theme-${theme}`);
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
    const shouldOpen =
      open === undefined ? !panel.classList.contains("open") : open;
    panel.classList.toggle("open", shouldOpen);
    document.body.style.overflow = shouldOpen ? "hidden" : "";
  }

  function getCurrentPieceSet() {
    return loadSettings().pieceSet || "neo";
  }

  function getCurrentTheme() {
    return loadSettings().theme || "1";
  }

  /* ============================================
     ۲) موتور صدا (Web Audio — بدون هیچ فایل خارجی)
     ============================================ */

  const Sound = {
    _ctx: null,

    enabled() {
      return loadSettings().sound !== false;
    },

    _ensure() {
      if (!this.enabled()) return null;
      try {
        if (!this._ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          this._ctx = new AC();
        }
        if (this._ctx.state === "suspended") this._ctx.resume();
        return this._ctx;
      } catch (e) {
        return null;
      }
    },

    _tone(freq, at, dur, type, vol) {
      const ctx = this._ctx;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.03);
      } catch (e) {}
    },

    play(name) {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime;

      if (name === "move") {
        this._tone(240, t, 0.07, "triangle", 0.16);
      } else if (name === "select") {
        this._tone(430, t, 0.045, "sine", 0.09);
      } else if (name === "correct") {
        this._tone(620, t, 0.09, "sine", 0.15);
        this._tone(930, t + 0.09, 0.13, "sine", 0.15);
      } else if (name === "wrong") {
        this._tone(150, t, 0.17, "sawtooth", 0.12);
      } else if (name === "win") {
        [523, 659, 784, 1046].forEach((f, i) => {
          this._tone(f, t + i * 0.1, 0.15, "sine", 0.14);
        });
      }
    },
  };

  /* ============================================
     ۳) ChessUtils — مهره‌ها، ترفیع، ابزارهای مشترک
     ============================================ */

  const ChessUtils = {
    // ۱۲ مهره — مسیر: pieces/<set>/<code>.png
    pieceCodes: {
      wk: "wk.png", wq: "wq.png", wr: "wr.png", wb: "wb.png",
      wn: "wn.png", wp: "wp.png", bk: "bk.png", bq: "bq.png",
      br: "br.png", bb: "bb.png", bn: "bn.png", bp: "bp.png",
    },

    // گلیف یونیکد برای وقتی تصویر مهره موجود نیست
    GLYPHS: { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" },

    _pieceImages: {},
    _errors: {},
    _loadedPieces: false,

    getCurrentPieceSet() {
      return getCurrentPieceSet();
    },

    // پیش‌بارگذاری هر ۱۲ مهره — حتی اگر 404 بخورد رد می‌شود
    // تا بعداً فالبک یونیکد استفاده شود (سایت بدون پوشه pieces هم کار می‌کند)
    loadPieces() {
      return new Promise((resolve) => {
        if (this._loadedPieces) {
          resolve();
          return;
        }

        const pieceSet = this.getCurrentPieceSet();
        const entries = Object.entries(this.pieceCodes);
        let loaded = 0;
        const total = entries.length;

        if (total === 0) {
          this._loadedPieces = true;
          resolve();
          return;
        }

        const done = () => {
          loaded++;
          if (loaded === total) {
            this._loadedPieces = true;
            resolve();
          }
        };

        entries.forEach(([key, filename]) => {
          const img = new Image();
          img.onload = done;
          img.onerror = () => {
            this._errors[key] = true;
            done();
          };
          img.src = `pieces/${pieceSet}/${filename}`;
          this._pieceImages[key] = img;
        });
      });
    },

    // تصویر مهره — اگر فایل موجود نباشد null برمی‌گرداند
    getPieceImage(key) {
      if (this._errors[key]) return null;
      return this._pieceImages[key] || null;
    },

    getBoardColors() {
      // تم‌ها روی body تعریف می‌شوند (body.theme-X) — نه روی html
      const host = document.body || document.documentElement;
      const light =
        getComputedStyle(host).getPropertyValue("--board-light").trim() || "#f0d9b5";
      const dark =
        getComputedStyle(host).getPropertyValue("--board-dark").trim() || "#b58863";
      return { light, dark };
    },

    /* ---------- مودال ترفیع پیاده ---------- */

    _promotionModal: null,
    _promotionCallback: null,
    _promotionColor: "w",

    _initPromotionModal() {
      if (this._promotionModal) return;

      const overlay = document.createElement("div");
      overlay.id = "promotionModal";
      overlay.innerHTML =
        '<div class="promotion-card">' +
        '<h3 class="promotion-title"><i class="fas fa-chess-pawn"></i> ترفیع پیاده</h3>' +
        '<div class="promotion-options"></div>' +
        "</div>";

      // کلیک روی پس‌زمینه = بستن بدون انتخاب
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.hidePromotion();
      });

      document.body.appendChild(overlay);
      this._promotionModal = overlay;
    },

    // رنگ صحیح داده می‌شود — باگ نسخه قدیمی (همیشه سفید) رفع شد
    showPromotion(color, callback) {
      this._initPromotionModal();
      this._promotionCallback = callback;
      this._promotionColor = color === "b" ? "b" : "w";

      const optionsDiv = this._promotionModal.querySelector(".promotion-options");
      optionsDiv.innerHTML = "";

      const pieces = [
        { type: "q", name: "وزیر" },
        { type: "r", name: "رخ" },
        { type: "b", name: "فیل" },
        { type: "n", name: "اسب" },
      ];

      const pieceSet = this.getCurrentPieceSet();
      const prefix = this._promotionColor;

      pieces.forEach((piece) => {
        const btn = document.createElement("div");
        btn.className = "promotion-option";

        const code = prefix + piece.type;
        const img = new Image();
        img.src = `pieces/${pieceSet}/${code}.png`;
        img.alt = piece.name;
        img.onerror = () => {
          const glyph = document.createElement("span");
          glyph.className = "piece-glyph " + prefix;
          glyph.textContent = this.GLYPHS[piece.type];
          img.replaceWith(glyph);
        };

        const label = document.createElement("span");
        label.textContent = piece.name;

        btn.appendChild(img);
        btn.appendChild(label);

        btn.onclick = () => {
          // ⚠️ اول callback را بردار، بعد مودال را ببند —
          // hidePromotion کال‌بک را null می‌کند و اگر بعد از آن خوانده شود
          // حرکت ترفیع هیچ‌وقت اعمال نمی‌شد (باگ اصلی همه‌ی بخش‌ها)
          const cb = this._promotionCallback;
          this._promotionCallback = null;
          this.hidePromotion();
          if (cb) cb(piece.type);
        };

        optionsDiv.appendChild(btn);
      });

      this._promotionModal.classList.add("open");
    },

    hidePromotion() {
      if (this._promotionModal) this._promotionModal.classList.remove("open");
      this._promotionCallback = null;
    },

    // رنگ کاربر = برعکسِ رنگ حرکت اول (فرمت Lichess)
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

  // تغییر مجموعه مهره → پاک‌سازی کش و بارگذاری مجدد
  document.addEventListener("pieceSetChanged", function () {
    ChessUtils._loadedPieces = false;
    ChessUtils._pieceImages = {};
    ChessUtils._errors = {};
    ChessUtils.loadPieces();
  });

  /* ============================================
     ۳٫۵) CommunityHub — انتشار عمومی محتوا
     --------------------------------------------
     درس‌ها / گشایش‌ها / مقالاتی که کاربران منتشر
     می‌کنند روی سرور ذخیره می‌شوند (فایل
     data/community_content.json) و برای «همه‌ی»
     بازدیدکنندگان سایت نمایش داده می‌شوند —
     نه فقط در مرورگر خودِ نویسنده.
     ============================================ */
  const CommunityHub = {
    _cache: null,
    _pending: null,

    types: ["lessons", "openings", "articles"],

    // فهرست کامل محتوای عمومی (با کش درون‌حافظه‌ای)
    fetchAll(force) {
      if (!force && this._cache) return Promise.resolve(this._cache);
      if (this._pending) return this._pending;
      const self = this;
      this._pending = fetch("/api/community/content", { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (j) {
          self._cache = {
            lessons: (j && j.lessons) || [],
            openings: (j && j.openings) || [],
            articles: (j && j.articles) || [],
          };
          return self._cache;
        })
        .finally(function () { self._pending = null; });
      return this._pending;
    },

    // 🔐 v8.2 — هدر نشست؛ بدون ورود، سرور انتشار را رد می‌کند
    _headers(extra) {
      const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
      if (window.ChessHubAuth && window.ChessHubAuth.token()) {
        h["X-Session-Token"] = window.ChessHubAuth.token();
      }
      return h;
    },

    // 🛡️ v8.2 — تلاش مجدد خودکار: خطاهای شبکه/سرور شلوغ دیگر
    // «گم‌شدن محتوا» نمی‌سازند (۳ تلاش با فاصله‌ی ۱٫۵ و ۳ ثانیه)
    _postWithRetry(type, action, id, item, bodyExtra) {
      const self = this;
      const bodyObj = { type: type, action: action, id: id, item: item };
      if (bodyExtra && typeof bodyExtra === "object") Object.assign(bodyObj, bodyExtra);
      const payload = JSON.stringify(bodyObj);
      let attempt = 0;
      function go() {
        attempt += 1;
        return fetch("/api/community/publish", {
          method: "POST",
          // ⚠️ رفع باگ «extra is not defined» — این خطا کل انتشار/ویرایش/حذف
          // (درس، گشایش، مقاله) را قبل از رسیدن به سرور می‌خواباند.
          // bodyExtra فیلدهای «بدنه» است، نه هدر — هدرها همان پیش‌فرض + توکن نشست.
          headers: self._headers(),
          body: payload,
        })
          .then(function (r) {
            return r.json().catch(function () { return null; }).then(function (j) {
              if (!r.ok || !j || !j.ok) {
                const err = new Error((j && j.error) || "خطای سرور (" + r.status + ")");
                err.status = r.status;
                err.body = j;
                throw err;
              }
              return j;
            });
          })
          .catch(function (err) {
            // فقط خطاهای شبکه/سرور تلاش مجدد می‌شوند؛ خطاهای کاربر (۴۰۰/۴۰۱/۴۰۳) نه
            const retryable = !err.status || err.status >= 500 || err.status === 429;
            if (retryable && attempt < 3) {
              return new Promise(function (res) { setTimeout(res, attempt * 1500); }).then(go);
            }
            throw err;
          });
      }
      return go();
    },

    // action: "publish" | "update" | "delete" — type: lessons/openings/articles
    // bodyExtra: فیلدهای اضافه‌ی بدنه — مثلاً {allowFileAuthor:true} برای آپلود فایل JSON
    save(type, action, id, item, bodyExtra) {
      const self = this;
      return this._postWithRetry(type, action, id, item, bodyExtra)
        .then(function (j) {
          // همگام‌سازی کش محلی
          if (self._cache && j.item) {
            const arr = self._cache[type] || (self._cache[type] = []);
            const idx = arr.findIndex(function (x) { return String(x.id) === String(j.item.id); });
            if (action === "delete") { if (idx >= 0) arr.splice(idx, 1); }
            else if (idx >= 0) arr[idx] = j.item;
            else arr.unshift(j.item);
          } else if (action === "delete") {
            self._cache = null; // دفعه‌ی بعد تازه گرفته می‌شود
          }
          return j;
        });
    },

    // آیا این آیتم روی سرور منتشر شده است؟
    isSynced(obj) {
      return !!(obj && (obj.serverId || (String(obj.id || "").indexOf("srv_") === 0)));
    },
  };
  window.CommunityHub = CommunityHub;

  /* ============================================
     ۴) بارگذاری هدر و فوتر در همه صفحات
     ============================================ */

  async function loadComponent(selector, url) {
    const element = document.querySelector(selector);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      if (element) element.innerHTML = html;
      else console.warn("المان " + selector + " پیدا نشد");
      return true;
    } catch (error) {
      console.error("خطا در بارگذاری " + url + ":", error.message);
      // حالت file:// یا بدون سرور — پیام راهنمای ملایم
      if (element) {
        element.innerHTML =
          '<div class="component-error">' +
          '<i class="fas fa-triangle-exclamation"></i>' +
          "برای نمایش کامل سایت، پروژه را با سرور اجرا کن: " +
          "<b>node server.js</b> یا Live Server — (" +
          url +
          " بارگذاری نشد)" +
          "</div>";
      }
      return false;
    }
  }

  /* ============================================
     ۵) منوی موبایل و منوهای آبشاری
     ============================================ */

  function closeMobileNav() {
    const nav = document.getElementById("mainNav");
    const toggle = document.getElementById("menuToggle");
    if (nav) nav.classList.remove("show");
    if (toggle) {
      const icon = toggle.querySelector("i");
      if (icon) icon.style.transform = "rotate(0deg)";
      toggle.setAttribute("aria-expanded", "false");
    }
    document.querySelectorAll(".dropdown-menu.show-mobile").forEach((m) => {
      m.classList.remove("show-mobile");
    });
    document.querySelectorAll(".dropdown.open").forEach((d) => {
      d.classList.remove("open");
    });
  }

  function initMobileMenu() {
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");
    if (!menuToggle || !mainNav) return;

    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      mainNav.classList.toggle("show");
      const isOpen = mainNav.classList.contains("show");
      const icon = this.querySelector("i");
      if (icon) icon.style.transform = isOpen ? "rotate(90deg)" : "rotate(0deg)";
      this.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // منوهای آبشاری فقط در موبایل با کلیک باز می‌شوند
    function initMobileDropdowns() {
      if (window.innerWidth <= 768) {
        document.querySelectorAll(".dropdown").forEach((drop) => {
          const toggle = drop.querySelector(".dropdown-toggle");
          const menu = drop.querySelector(".dropdown-menu");
          if (!toggle || !menu) return;

          toggle.removeEventListener("click", toggle._mobileHandler);

          const handler = function (e) {
            e.preventDefault();
            e.stopPropagation();

            // بستن بقیه منوهای باز
            document.querySelectorAll(".dropdown").forEach((d) => {
              if (d !== drop) {
                d.classList.remove("open");
                const other = d.querySelector(".dropdown-menu");
                if (other) other.classList.remove("show-mobile");
              }
            });

            menu.classList.toggle("show-mobile");
            drop.classList.toggle("open");
          };

          toggle._mobileHandler = handler;
          toggle.addEventListener("click", handler);
        });
      } else {
        document.querySelectorAll(".dropdown-menu").forEach((m) => {
          m.classList.remove("show-mobile");
        });
        document.querySelectorAll(".dropdown").forEach((d) => {
          d.classList.remove("open");
        });
      }
    }

    // کلیک بیرون از منو = بستن
    document.addEventListener("click", function (e) {
      const nav = document.getElementById("mainNav");
      const toggle = document.getElementById("menuToggle");
      if (nav && toggle) {
        if (!nav.contains(e.target) && !toggle.contains(e.target)) {
          closeMobileNav();
        }
      }
    });

    // بستن با کلید Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMobileNav();
    });

    // کلیک روی لینک ساده (غیر آبشاری) در موبایل = بستن منو
    document
      .querySelectorAll(".nav-list > li > a:not(.dropdown-toggle)")
      .forEach((link) => {
        link.addEventListener("click", function () {
          if (window.innerWidth <= 768) closeMobileNav();
        });
      });

    initMobileDropdowns();

    // هنگام تغییر سایز، مجدد مقداردهی شود
    let resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (window.innerWidth > 768) closeMobileNav();
        initMobileDropdowns();
      }, 200);
    });

    // هایلایت لینک فعال بر اساس نام فایل صفحه
    const page = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-list a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === page) a.classList.add("active");
    });
  }

  /* ============================================
     ۶) تنظیمات نسخه پنل کناری (سازگاری با کدهای قدیمی)
     ============================================ */

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
    if (closeBtn) closeBtn.addEventListener("click", () => togglePanel(false));

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

    // در صفحه تنظیمات، دکمه‌های تم را صفحه خودش مدیریت می‌کند
    if (!document.getElementById("themeGrid")) {
      document.querySelectorAll(".theme-btn").forEach((btn) => {
        btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
      });
    }
  }

  /* ============================================
     ۷) منطق صفحه تنظیمات (۲۹ تم + مجموعه‌های مهره)
     ============================================ */

  const THEME_CATALOG = [
    { id: "1",  light: "#f3f3f4", dark: "#6a9b41" },
    { id: "2",  light: "#ecc79b", dark: "#c7703c" },
    { id: "3",  light: "#eae9d2", dark: "#4b7399" },
    { id: "4",  light: "#f0d9b5", dark: "#b58863" },
    { id: "5",  light: "#ffffff", dark: "#fcd8dd" },
    { id: "6",  light: "#e0b88f", dark: "#854d2d" },
    { id: "7",  light: "#ba8d51", dark: "#6f3b29" },
    { id: "8",  light: "#717b8e", dark: "#2b323f" },
    { id: "9",  light: "#eeeed2", dark: "#769656" },
    { id: "10", light: "#cddbe2", dark: "#7b9eb3" },
    { id: "11", light: "#dcdcdc", dark: "#ababab" },
    { id: "12", light: "#dce6e6", dark: "#9ea6a1" },
    { id: "13", light: "#beb7a0", dark: "#726d68" },
    { id: "14", light: "#e0e0e0", dark: "#6e6f6f" },
    { id: "15", light: "#cccccc", dark: "#6c625f" },
    { id: "16", light: "#fce4b2", dark: "#d08b18" },
    { id: "17", light: "#cac8bf", dark: "#52514e" },
    { id: "18", light: "#efefef", dark: "#8877b7" },
    { id: "19", light: "#f0d8bf", dark: "#ba5546" },
    { id: "20", light: "#aca8a1", dark: "#4f4d4b" },
    { id: "21", light: "#edc9a2", dark: "#d3a36a" },
    { id: "22", light: "#efefef", dark: "#c2d7e2" },
    { id: "23", light: "#b89a75", dark: "#6e4e37" },
    { id: "24", light: "#efefec", dark: "#33684b" },
    { id: "25", light: "#efefef", dark: "#ababab" },
    { id: "26", light: "#c09d65", dark: "#845c3a" },
    { id: "27", light: "#a9a9a9", dark: "#a6865f" },
    { id: "28", light: "#e3e0c5", dark: "#b8a671" },
    { id: "29", light: "#d0bbaf", dark: "#c6b19d" },
  ];

  // ۳۸ مجموعه مهره — کافیست پوشه pieces/<name>/ را بگذاری
  const PIECE_SETS = {
    "پیشفرض": ["neo"],
    "سه بعدی": ["3d_chesskid", "3d_plastic", "3d_staunton", "3d_wood"],
    "کلاسیک": ["alpha", "bases", "classic", "club", "condal", "tournament", "vintage"],
    "مدرن": ["glass", "light", "marble", "metal", "modern", "neon"],
    "کارتونی": ["8_bit", "bubblegum", "graffiti", "lolz", "tigers"],
    "طبیعی": ["icy_sea", "nature", "neo_wood", "ocean", "sky", "wood"],
    "ویژه": ["blindfold", "book", "cases", "dash", "game_room", "gothic", "maya", "newspaper", "space","g08ph","ca09k",],
  };

  function initSettingsPage() {
    const themeGrid = document.getElementById("themeGrid");
    const pieceContainer = document.getElementById("pieceSetsContainer");
    if (!themeGrid && !pieceContainer) return;

    let tempTheme = getCurrentTheme();
    let tempPieceSet = getCurrentPieceSet();

    const toast = (text) => {
      const el = document.getElementById("settingsToast");
      if (!el) return;
      el.textContent = text;
      el.classList.add("show");
      clearTimeout(el._timeout);
      el._timeout = setTimeout(() => el.classList.remove("show"), 2500);
    };

    const applyTempTheme = (id) => {
      document.body.className = document.body.className
        .split(" ")
        .filter((cls) => !cls.startsWith("theme-"))
        .join(" ");
      document.body.classList.add("theme-" + id);
    };

    /* ---- ساخت دکمه‌های تم (پیش‌نمایش درست روشن/تیره) ---- */
    function buildThemeButtons() {
      if (!themeGrid) return;
      themeGrid.innerHTML = "";
      THEME_CATALOG.forEach((theme) => {
        const btn = document.createElement("button");
        btn.className = "theme-btn" + (theme.id === tempTheme ? " active" : "");
        btn.dataset.theme = theme.id;
        btn.setAttribute("aria-label", "تم " + theme.id);
        btn.innerHTML =
          '<span class="theme-preview">' +
          '<span class="preview-light" style="background:' + theme.light + '"></span>' +
          '<span class="preview-dark" style="background:' + theme.dark + '"></span>' +
          "</span>";
        btn.onclick = () => {
          themeGrid.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          tempTheme = theme.id;
          applyTempTheme(theme.id);
          Sound.play("select");
          toast("تم اعمال شد — برای ماندگاری، ذخیره کن");
        };
        themeGrid.appendChild(btn);
      });
    }

    /* ---- ساخت دکمه‌های مجموعه مهره ---- */
    function buildPieceButtons() {
      if (!pieceContainer) return;
      pieceContainer.innerHTML = "";
      let totalCount = 0;

      Object.keys(PIECE_SETS).forEach((catName) => {
        const section = document.createElement("div");
        section.className = "piece-section";

        const label = document.createElement("span");
        label.className = "section-label";
        label.textContent = catName;
        section.appendChild(label);

        const grid = document.createElement("div");
        grid.className = "section-grid";

        PIECE_SETS[catName].forEach((setName) => {
          totalCount++;
          const btn = document.createElement("button");
          btn.className = "piece-btn" + (setName === tempPieceSet ? " active" : "");
          btn.dataset.set = setName;
          btn.title = setName;

          btn.innerHTML =
            '<div class="piece-preview">' +
            '<img src="pieces/' + setName + '/wk.png" alt="شاه سفید" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
            '<span class="piece-fallback" style="display:none">\u2654</span>' +
            '<img src="pieces/' + setName + '/bk.png" alt="شاه سیاه" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
            '<span class="piece-fallback" style="display:none">\u265A</span>' +
            "</div>";

          btn.onclick = () => {
            pieceContainer.querySelectorAll(".piece-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            tempPieceSet = setName;
            Sound.play("select");
            toast("مجموعه مهره انتخاب شد — ذخیره کن");
          };

          grid.appendChild(btn);
        });

        section.appendChild(grid);
        pieceContainer.appendChild(section);
      });

      const countDisplay = document.getElementById("pieceCountDisplay");
      if (countDisplay) countDisplay.textContent = faNum(totalCount);
    }

    /* ---- ذخیره نهایی ---- */
    function saveAll() {
      const settings = loadSettings();
      settings.theme = tempTheme;
      settings.pieceSet = tempPieceSet;
      saveSettings(settings);
      applyTempTheme(settings.theme);

      document.dispatchEvent(
        new CustomEvent("pieceSetChanged", { detail: { pieceSet: settings.pieceSet } })
      );
      document.dispatchEvent(
        new CustomEvent("themeChanged", { detail: { theme: settings.theme } })
      );

      Sound.play("correct");
      toast("تنظیمات با موفقیت ذخیره شد");
    }

    function resetAll() {
      if (!confirm("مطمئنی؟ همه تنظیمات به حالت پیشفرض برمی‌گردد.")) return;

      const settings = { ...defaultSettings };
      saveSettings(settings);
      tempTheme = "1";
      tempPieceSet = "neo";
      applyTempTheme("1");
      buildThemeButtons();
      buildPieceButtons();

      document.dispatchEvent(
        new CustomEvent("pieceSetChanged", { detail: { pieceSet: "neo" } })
      );
      document.dispatchEvent(
        new CustomEvent("themeChanged", { detail: { theme: "1" } })
      );

      Sound.play("select");
      toast("تنظیمات به حالت پیشفرض بازگشت");
    }

    buildThemeButtons();
    buildPieceButtons();

    const saveBtn = document.getElementById("saveSettingsBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveAll);

    const resetBtn = document.getElementById("resetSettingsBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetAll);
  }

  /* ============================================
     ۸) بوت — اجرا پس از آماده شدن DOM
     ============================================ */

  async function boot() {
    applySavedThemeEarly();

    await Promise.all([
      loadComponent("#header-placeholder", "header.html"),
      loadComponent("#footer-placeholder", "footer.html"),
    ]);

    initMobileMenu();
    initSettings();
    initSettingsPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ============================================
     ۹) صادرات برای استفاده در سایر صفحات
     ============================================ */

  window.ChessHub = {
    ChessUtils,
    Sound,
    loadSettings,
    saveSettings,
    applyTheme,
    toggleSound,
    togglePanel,
    getCurrentPieceSet,
    getCurrentTheme,
    loadComponent,
    initMobileMenu,
    initSettingsPage,
    faNum,
  };
})();

console.log("ChessHub: script.js loaded");