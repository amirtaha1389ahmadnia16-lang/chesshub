/* ============================================================
   ♛ ChessHub — فایل اسکریپت اصلی (مشترک بین همه صفحات)
   ------------------------------------------------------------
   وظایف این فایل:
   ۱) تزریق header.html و footer.html در تمام صفحات
   ۲) منوی موبایل و منوهای آبشاری
   ۳) سیستم تنظیمات (localStorage: chesshub_settings)
   ۴) ChessUtils — پیش‌بارگذاری مهره‌ها، مودال ترفیع، صداها
   ۵) موتور «مسئله روز» — خواندن data/daily_puzzle.txt (یا csv)
      (اول از بک‌اند: /api/daily-puzzle → بعد خود فایل داده → بعد نمونه داخلی)
      چرخش پازل: هر ۲۴ ساعت یک پازل جلو می‌رود (روز اول = سطر اول فایل)
   ۶) درگ‌ودراپ مهره‌ها — هم ماوس (ویندوز) هم لمس (موبایل) + کلیک‌کلیک
   ۷) منطق صفحه تنظیمات (۲۹ تم + مجموعه‌های مهره)
   ============================================================ */

(function () {
  "use strict";

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

  // شماره‌ی روز جاری برای چرخش پازل — بر پایه‌ی «نیمه‌شب محلی» کاربر
  // یعنی همان‌طور که انتظار می‌رود: به محض تغییر تاریخ (مثلاً ۲۱ شهریور → ۲۲ شهریور
  // در نیمه‌شب به وقت ایران) پازل عوض می‌شود، نه ساعت ۳:۳۰ بامداد مثل فرمول قبلی UTC
  // روز ۰ = 2024-01-01 (نیمه‌شب محلی) → روز اول = سطر اول، هر ۲۴ ساعت یکی جلو
  const DAY_EPOCH_LOCAL = new Date(2024, 0, 1).getTime();

  function getDayNumber() {
    return Math.max(0, Math.floor((Date.now() - DAY_EPOCH_LOCAL) / 86400000));
  }

  // مسیرهای فایل داده پازل (اول txt — همان‌طور که کاربر گذاشته — بعد csv)
  const DATA_PATHS = ["data/daily_puzzle.txt", "data/daily_puzzle.csv"];

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

    // action: "publish" | "update" | "delete" — type: lessons/openings/articles
    save(type, action, id, item) {
      const self = this;
      return fetch("/api/community/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type, action: action, id: id, item: item }),
      })
        .then(function (r) {
          return r.json().catch(function () { return null; }).then(function (j) {
            if (!r.ok || !j || !j.ok) {
              throw new Error((j && j.error) || "خطای سرور (" + r.status + ")");
            }
            return j;
          });
        })
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
     ۶) پارسر CSV (سازگار با RFC4180 — کوتیشن و BOM)
     ============================================ */

  function parseCSV(text) {
    // حذف BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0].trim() !== "") rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }

    // سطر آخر (بدون \n انتهایی)
    if (field !== "" || row.length > 0) {
      row.push(field);
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    }

    return rows;
  }

  // تبدیل خروجی parseCSV به آرایه‌ای از آبجکت پازل (فرمت Lichess)
  // هوشمند: اگر سطر اول «هدر» باشد (PuzzleId,FEN,...) از آن استفاده می‌شود،
  // وگرنه فایل بدون هدر است و ستون‌ها به‌صورت پیشفرض خوانده می‌شوند
  // (فایل کاربر بدون هدر است — پازل روز اول دقیقاً از سطر اول می‌آید)
  function rowsToPuzzles(rows) {
    if (!rows || !rows.length) return [];

    const firstRow = rows[0].map((h) => String(h).trim().toLowerCase());
    const hasHeader = firstRow[0] === "puzzleid" || firstRow.indexOf("fen") >= 0;
    const header = hasHeader ? firstRow : [];

    const col = (name, fallback) => {
      const i = header.indexOf(name);
      return i >= 0 ? i : fallback;
    };

    const C = {
      id: col("puzzleid", 0),
      fen: col("fen", 1),
      moves: col("moves", 2),
      rating: col("rating", 3),
      rd: col("ratingdeviation", 4),
      pop: col("popularity", 5),
      nb: col("nbplays", 6),
      themes: col("themes", 7),
      url: col("gameurl", 8),
      open: col("openingtags", 9),
    };

    const list = [];
    for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
      const f = rows[i];
      if (!f[C.fen] || !f[C.moves]) continue;

      const fenParts = String(f[C.fen]).trim().split(/\s+/);
      if (fenParts.length < 2) continue;

      list.push({
        puzzleId: (f[C.id] || String(i + 1)).trim(),
        fen: String(f[C.fen]).trim(),
        moves: String(f[C.moves]).trim().split(/\s+/).filter(Boolean),
        rating: Number(f[C.rating]) || 0,
        ratingDeviation: Number(f[C.rd]) || 0,
        popularity: Number(f[C.pop]) || 0,
        nbPlays: Number(f[C.nb]) || 0,
        themes: String(f[C.themes] || "")
          .split(/\s+/)
          .filter(Boolean),
        gameUrl: (f[C.url] || "").trim(),
        openingTags: (f[C.open] || "").trim(),
        userColor: fenParts[1] === "b" ? "w" : "b",
      });
    }
    return list;
  }

  /* ============================================
     ۷) منبع پازل روزانه — سه لایه:
        ۱) بک‌اند:  GET /api/daily-puzzle   (مرجع اصلی)
        ۲) مستقیم:  data/daily_puzzle.txt  (یا .csv)
        ۳) نمونه داخلی (سه پازل واقعی Lichess)
     چرخش: هر ۲۴ ساعت یک سطر جلو — روز اول = سطر اول
     ============================================ */

  const FALLBACK_PUZZLES = [
    // سه پازل واقعی از داده‌های کاربر — فقط وقتی فایل داده و بک‌اند هر دو در دسترس نباشند
    {
      puzzleId: "a7Pdj",
      fen: "6Qk/pp1R2p1/7p/2PPp1N1/7n/2P1P2P/6PK/1q6 b - - 0 34",
      moves: ["h8g8", "d7d8"],
      rating: 694,
      themes: ["endgame", "mate", "mateIn1", "oneMove"],
      gameUrl: "https://lichess.org/Y301xwgx/black#68",
      userColor: "w",
    },
    {
      puzzleId: "a7PYK",
      fen: "4r3/Qpk2p1p/6p1/2Pp4/8/1n6/5PPP/4N1K1 w - - 1 29",
      moves: ["g1f1", "b3d2", "f1g1", "e8e1"],
      rating: 954,
      themes: ["backRankMate", "deflection", "endgame", "mate", "mateIn2"],
      gameUrl: "https://lichess.org/HxRyvRUv#57",
      userColor: "b",
    },
    {
      puzzleId: "a7PaO",
      fen: "8/p2k3p/1p1Pr1p1/8/5K2/8/PP4PP/3R4 b - - 6 35",
      moves: ["e6d6", "d1d6", "d7d6", "f4g5"],
      rating: 1023,
      themes: ["crushing", "endgame", "master", "rookEndgame"],
      gameUrl: "https://lichess.org/GNSQj1Qe/black#70",
      userColor: "w",
    },
  ];

  async function fetchDailyPuzzle() {
    // ---- لایه ۱: بک‌اند — شماره‌ی روزِ «محلیِ» مرورگر برای سرور فرستاده می‌شود
    // تا پازل دقیقاً با تقویم خود کاربر عوض شود حتی اگر سرور در منطقه‌ی زمانی دیگری باشد
    try {
      const res = await fetch("api/daily-puzzle?day=" + getDayNumber(), { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok && json.puzzle && json.puzzle.fen) {
          return {
            puzzle: json.puzzle,
            index: json.meta ? json.meta.index : 0,
            total: json.meta ? json.meta.total : 1,
            source: "api",
          };
        }
      }
    } catch (e) {
      /* بک‌اند در دسترس نیست → لایه بعد */
    }

    // ---- لایه ۲: خواندن مستقیم فایل داده (اول txt، بعد csv) ----
    for (let i = 0; i < DATA_PATHS.length; i++) {
      try {
        const res = await fetch(DATA_PATHS[i], { cache: "no-store" });
        if (!res.ok) continue;
        const text = await res.text();
        const puzzles = rowsToPuzzles(parseCSV(text)).filter(
          (p) => p.fen && p.moves.length
        );
        if (puzzles.length) {
          const idx = getDayNumber() % puzzles.length;
          return {
            puzzle: puzzles[idx],
            index: idx,
            total: puzzles.length,
            source: "file",
          };
        }
      } catch (e) {
        /* این فایل در دسترس نیست → مسیر بعدی */
      }
    }

    // ---- لایه ۳: نمونه داخلی ----
    const idx = getDayNumber() % FALLBACK_PUZZLES.length;
    return {
      puzzle: FALLBACK_PUZZLES[idx],
      index: idx,
      total: FALLBACK_PUZZLES.length,
      source: "fallback",
    };
  }

  /* ============================================
     ۸) موتور «مسئله روز»
     ------------------------------------------------
     فرمت Lichess: سطر اول Moves حرکت حریف است و
     کاربر با رنگ مقابل بازی می‌کند و باید دنباله را
     تا آخر ادامه دهد.
     ============================================ */

  const DailyPuzzle = {
    game: null,
    fen: "",
    solution: [],
    step: 0,
    userColor: "w",
    orientation: "w",
    selected: null,
    lastMove: null,
    mistakes: 0,
    hintsUsed: 0,
    solved: false,
    busy: true,
    _timer: null,
    _press: null,
    squareEls: {},
    boardEl: null,
    msgEl: null,
    info: null,

    async init() {
      this.boardEl = document.getElementById("chessboard");
      this.msgEl = document.getElementById("message");
      if (!this.boardEl) return;

      if (typeof Chess === "undefined") {
        this.setMessage("کتابخانه شطرنج (chess.js) لود نشد — اینترنت را چک کن", "error");
        return;
      }

      this.info = {
        colorLabel: document.getElementById("userColorLabel"),
        meta: document.getElementById("puzzleMeta"),
        date: document.getElementById("puzzleDate"),
        progressFill: document.querySelector(".puzzle-progress-fill"),
        progressText: document.querySelector(".puzzle-progress-text"),
        solvedBox: document.getElementById("puzzleSolved"),
        resetBtn: document.getElementById("resetBtn"),
        hintBtn: document.getElementById("hintBtn"),
      };

      if (this.info.resetBtn) {
        this.info.resetBtn.addEventListener("click", () => this.reset());
      }
      if (this.info.hintBtn) {
        this.info.hintBtn.addEventListener("click", () => this.hint());
      }

      // درگ‌ودراپ + کلیک/تپ — با Pointer Events (ماوس + لمس + قلم)
      this.initDragAndDrop();

      // تغییر اسکین مهره‌ها → رندر مجدد
      document.addEventListener("pieceSetChanged", () => {
        ChessUtils.loadPieces().then(() => {
          if (this.game) {
            this.renderAll();
            this.updateGlyphSize();
          }
        });
      });

      // اندازه گلیف‌ها هنگام تغییر سایز
      let glyphTimer;
      window.addEventListener("resize", () => {
        clearTimeout(glyphTimer);
        glyphTimer = setTimeout(() => this.updateGlyphSize(), 150);
      });

      this.setMessage("در حال آماده‌سازی پازل روزانه…", "info");

      try {
        await ChessUtils.loadPieces();
        await this.refreshForNewDay(true);
      } catch (err) {
        console.error("خطا در پازل روزانه:", err);
        this.setMessage("پازل روزانه بارگذاری نشد — دوباره تلاش کن", "error");
      }

      // ⏰ چرخش زنده: اگر صفحه باز بماند و نیمه‌شب (تغییر تاریخ) بگذرد،
      // پازل بدون نیاز به رفرش دستی، خودکار عوض می‌شود
      if (!this._dayWatcherStarted) {
        this._dayWatcherStarted = true;
        const checkDayRollover = () => {
          const today = getDayNumber();
          if (this._dayNum != null && today !== this._dayNum && !this._reloading) {
            this._dayNum = today;
            this.setMessage("نیمه‌شب گذشت — پازل جدید امروز می‌آید…", "info");
            this.refreshForNewDay(false);
          }
        };
        setInterval(checkDayRollover, 60000);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) checkDayRollover();
        });
      }
    },

    /* بارگذاری (یا تازه‌سازی) پازلِ روزِ جاری */
    async refreshForNewDay(firstLoad) {
      this._reloading = true;
      try {
        const data = await fetchDailyPuzzle();
        this._dayNum = getDayNumber();
        this.puzzleIndex = data.index;
        this.puzzleTotal = data.total;
        this.source = data.source;
        this.loadPuzzle(data.puzzle);
        if (!firstLoad) {
          this.setMessage("🌅 پازل جدید امروز آماده است — بزن بریم!", "success");
        }
      } catch (err) {
        console.error("خطا در پازل روزانه:", err);
        if (!firstLoad) this.setMessage("پازل جدید بارگذاری نشد — صفحه را رفرش کن", "error");
      } finally {
        this._reloading = false;
      }
    },

    loadPuzzle(puzzle) {
      this.fen = puzzle.fen;
      this.solution = puzzle.moves || [];
      this.currentPuzzle = puzzle;

      this.game = new Chess();
      if (!this.game.load(this.fen)) {
        this.setMessage("FEN پازل نامعتبر است", "error");
        return;
      }

      // کاربر با رنگ مقابلِ نوبتِ FEN بازی می‌کند
      this.userColor = this.game.turn() === "w" ? "b" : "w";
      this.orientation = this.userColor;

      // برچسب رنگ
      if (this.info.colorLabel) {
        this.info.colorLabel.textContent =
          this.userColor === "w" ? "سفید" : "سیاه";
      }

      // متادیتا: امتیاز، تم‌ها، شماره پازل
      if (this.info.meta) {
        const chips = [];
        if (puzzle.rating) {
          chips.push(
            '<span class="chip gold"><i class="fas fa-gauge-high"></i> امتیاز ' +
              faNum(puzzle.rating) +
              "</span>"
          );
        }
        const themeList = puzzle.themes || [];
        if (themeList.length) {
          const shown = themeList.slice(0, 3).join("، ");
          chips.push(
            '<span class="chip"><i class="fas fa-tags"></i> ' + shown +
              (themeList.length > 3 ? " +" + faNum(themeList.length - 3) : "") +
              "</span>"
          );
        }
        chips.push(
          '<span class="chip"><i class="fas fa-hashtag"></i> پازل ' +
            faNum((this.puzzleIndex || 0) + 1) +
            " از " +
            faNum(this.puzzleTotal || 1) +
            "</span>"
        );
        this.info.meta.innerHTML = chips.join("");
      }

      // تاریخ امروز (تقویم شمسی)
      if (this.info.date) {
        try {
          this.info.date.textContent = new Date().toLocaleDateString("fa-IR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
        } catch (e) {
          this.info.date.textContent = "";
        }
      }

      this.startGame();
    },

    startGame() {
      clearTimeout(this._timer);
      if (this.info.solvedBox) this.info.solvedBox.classList.remove("show");
      this.boardEl.classList.remove("board-solved");

      this.game = new Chess();
      this.game.load(this.fen);
      this.step = 0;
      this.mistakes = 0;
      this.hintsUsed = 0;
      this.selected = null;
      this.lastMove = null;
      this.solved = false;
      this.busy = true;

      this.buildBoard();
      this.renderAll();
      this.setMessage("حریف شروع می‌کند…", "info");
      this._timer = setTimeout(() => this.afterMove(), 750);
    },

    /* ---------- ساخت تخته با جهت درست ---------- */

    buildBoard() {
      this.boardEl.innerHTML = "";
      this.squareEls = {};

      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
      const fOrder = this.orientation === "w" ? files : [...files].reverse();
      const rOrder = this.orientation === "w" ? ranks : [...ranks].reverse();

      rOrder.forEach((r) => {
        fOrder.forEach((f) => {
          const sq = f + r;
          const isLight = (files.indexOf(f) + r) % 2 === 0;
          const d = document.createElement("div");
          d.className = "square " + (isLight ? "light" : "dark");
          d.dataset.square = sq;
          this.boardEl.appendChild(d);
          this.squareEls[sq] = d;
        });
      });
    },

    updateGlyphSize() {
      const sq = this.boardEl.querySelector(".square");
      if (!sq) return;
      const w = sq.clientWidth;
      if (w) this.boardEl.style.setProperty("--glyph-size", Math.round(w * 0.78) + "px");
    },

    /* ---------- رندر ---------- */

    renderAll() {
      this.renderBoard();
      this.renderDots();
      this.updateProgress();
    },

    renderBoard() {
      const board = this.game.board();

      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = "abcdefgh"[f] + (8 - r);
          const el = this.squareEls[sq];
          if (!el) continue;
          const p = board[r][f];

          el.innerHTML = "";
          el.classList.remove(
            "selected", "dot", "dot-capture", "last-move",
            "hint", "check", "correct", "wrong"
          );

          if (p) {
            const cached = ChessUtils.getPieceImage(p.color + p.type);
            if (cached) {
              const img = new Image();
              img.src = cached.src;
              img.className = "piece-img";
              img.alt = "";
              img.draggable = false;
              el.appendChild(img);
            } else {
              const glyph = document.createElement("span");
              glyph.className = "piece-glyph " + p.color;
              glyph.textContent = ChessUtils.GLYPHS[p.type];
              el.appendChild(glyph);
            }
          }
        }
      }

      // هایلایت حرکت قبلی
      if (this.lastMove) {
        const from = this.squareEls[this.lastMove.from];
        const to = this.squareEls[this.lastMove.to];
        if (from) from.classList.add("last-move");
        if (to) to.classList.add("last-move");
      }

      // نشانگر کیش روی شاه
      if (this.game.in_check()) {
        const turn = this.game.turn();
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const p = board[r][f];
            if (p && p.type === "k" && p.color === turn) {
              const el = this.squareEls["abcdefgh"[f] + (8 - r)];
              if (el) el.classList.add("check");
            }
          }
        }
      }

      this.updateGlyphSize();
    },

    renderDots() {
      if (!this.selected) return;
      const selEl = this.squareEls[this.selected];
      if (selEl) selEl.classList.add("selected");

      const moves = this.game.moves({ square: this.selected, verbose: true });
      const seen = {};
      moves.forEach((m) => {
        if (seen[m.to]) return;
        seen[m.to] = 1;
        const t = this.squareEls[m.to];
        if (t) t.classList.add(m.captured ? "dot-capture" : "dot");
      });
    },

    updateProgress() {
      const total = this.solution.length || 1;
      const done = Math.min(this.step, total);
      if (this.info.progressFill) {
        this.info.progressFill.style.width = (done / total) * 100 + "%";
      }
      if (this.info.progressText) {
        this.info.progressText.textContent =
          "حرکت " + faNum(done) + " از " + faNum(total);
      }
    },

    setMessage(html, type) {
      if (!this.msgEl) return;
      this.msgEl.className = "message " + (type || "info");
      this.msgEl.innerHTML = html;
    },

    flashSquare(sq, cls) {
      const el = this.squareEls[sq];
      if (!el) return;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 700);
    },

    shakeBoard() {
      this.boardEl.classList.add("shake");
      setTimeout(() => this.boardEl.classList.remove("shake"), 450);
    },

    /* ---------- جریان بازی ---------- */

    afterMove() {
      this.renderAll();

      if (this.step >= this.solution.length) {
        this.win();
        return;
      }

      if (this.game.turn() !== this.userColor) {
        // نوبت حریف — حرکت بعدی راه‌حل به‌صورت خودکار
        this.busy = true;
        this.setMessage("حریف در حال حرکت…", "info");
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.autoPlay(), 600);
      } else {
        this.busy = false;
        this.setMessage("نوبت توئه — حرکت درست را پیدا کن", "info");
      }
    },

    autoPlay() {
      const uci = this.solution[this.step];
      if (!uci) {
        this.win();
        return;
      }

      const mv = this.game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || undefined,
      });

      if (!mv) {
        this.win();
        return;
      }

      this.step++;
      this.lastMove = { from: mv.from, to: mv.to };
      Sound.play("move");
      this.afterMove();
    },

    onSquareClick(sq) {
      if (this.busy || this.solved) return;
      if (this.game.turn() !== this.userColor) return;

      const piece = this.game.get(sq);

      if (this.selected) {
        if (sq === this.selected) {
          this.selected = null;
          this.renderAll();
          return;
        }
        if (piece && piece.color === this.userColor) {
          // انتخاب مهره دیگر
          this.selected = sq;
          Sound.play("select");
          this.renderAll();
          return;
        }
        this.attemptMove(this.selected, sq);
      } else if (piece && piece.color === this.userColor) {
        this.selected = sq;
        Sound.play("select");
        this.renderAll();
      }
    },

    /* --------------------------------------------
       درگ‌ودراپ مهره‌ها — Pointer Events
       هم ماوس (ویندوز/دسکتاپ) هم لمس (موبایل/تبلت)
       + حالت کلیک‌کلیک حفظ شده است
       -------------------------------------------- */

    initDragAndDrop() {
      const board = this.boardEl;

      // 🔑 گارانتی درگ موبایل: لمس روی تخته هرگز نباید اسکرول/زوم شود
      // (مستقل از CSS صفحه — روی ویندوز هم اثری ندارد، فقط لمس را ایمن می‌کند)
      try {
        board.style.touchAction = "none";
        board.style.webkitUserSelect = "none";
        board.style.userSelect = "none";
        board.style.webkitTouchCallout = "none";
        board.style.webkitTapHighlightColor = "transparent";
      } catch (e) {}

      if (window.PointerEvent) {
        // مسیر اصلی — Pointer Events: ماوس + لمس + قلم
        board.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this._ppMove = (e) => this.onPointerMove(e);
        this._ppUp = (e) => this.onPointerUp(e);
        this._ppCancel = (e) => this.onPointerCancel(e);
        window.addEventListener("pointermove", this._ppMove, { passive: false });
        window.addEventListener("pointerup", this._ppUp);
        window.addEventListener("pointercancel", this._ppCancel);
      } else {
        // مرورگرهای خیلی قدیمی — حداقل کلیک/تپ کار کند
        board.addEventListener("click", (e) => {
          const sq = e.target.closest(".square");
          if (sq && sq.dataset.square) this.onSquareClick(sq.dataset.square);
        });
      }

      // جلوگیری از منوی راست‌کلیک / منوی لمس طولانی روی تخته
      board.addEventListener("contextmenu", (e) => e.preventDefault());
    },

    // آیا الان نوبت بازیکن است؟
    _canPlay() {
      return (
        !!this.game &&
        !this.busy &&
        !this.solved &&
        this.game.turn() === this.userColor
      );
    },

    // آیا خانه‌ی sq مقصدِ مجازِ مهره‌ی انتخاب‌شده است؟
    _isLegalTarget(sq) {
      if (!this.selected || !this.game) return false;
      return this.game
        .moves({ square: this.selected, verbose: true })
        .some((m) => m.to === sq);
    },

    // پیدا کردن خانه‌ی زیر اشاره‌گر / انگشت
    _squareAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const sq = el && el.closest ? el.closest("#chessboard .square") : null;
      return sq ? sq.dataset.square : null;
    },

    onPointerDown(e) {
      if (this._press) return; // یک اشاره در هر لحظه
      if (e.pointerType === "mouse" && e.button !== 0) return; // فقط کلیک چپ

      const sqEl = e.target.closest
        ? e.target.closest("#chessboard .square")
        : null;
      if (!sqEl) return;
      const sq = sqEl.dataset.square;
      if (!sq) return;

      const press = {
        pointerId: e.pointerId,
        from: sq,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        consumed: false,
        ghost: null,
        overSq: null,
      };
      this._press = press;

      // اگر خانه‌ای انتخاب شده و این خانه مقصد مجاز است → حرکتِ کلیکی سریع
      // (در موبایل با همان لمسِ اول حرکت انجام می‌شود — مثل لایچس)
      if (
        this._canPlay() &&
        this.selected &&
        this.selected !== sq &&
        this._isLegalTarget(sq)
      ) {
        press.consumed = true;
        this.attemptMove(this.selected, sq);
        return;
      }

      e.preventDefault(); // جلوگیری از انتخاب متن / منوی لمسی
    },

    onPointerMove(e) {
      const press = this._press;
      if (!press || e.pointerId !== press.pointerId || press.consumed) return;

      const dx = e.clientX - press.startX;
      const dy = e.clientY - press.startY;

      if (!press.dragging) {
        if (dx * dx + dy * dy < 36) return; // آستانه‌ی شروع درگ: ۶ پیکسل

        // فقط مهره‌ی خودیِ بازیکن در نوبت خودش کشیده می‌شود
        const piece = this.game && this.game.get(press.from);
        if (!piece || !this._canPlay() || piece.color !== this.userColor) {
          return;
        }

        press.dragging = true;
        if (this.selected !== press.from) {
          this.selected = press.from;
          this.renderAll();
        }

        press.ghost = this._createGhost(press.from);
        if (press.ghost) {
          const srcEl = this.squareEls[press.from];
          if (srcEl) srcEl.classList.add("dragging");
          this.boardEl.classList.add("dragging-active");
        }
      }

      if (press.ghost) {
        press.ghost.style.left = e.clientX + "px";
        press.ghost.style.top = e.clientY + "px";

        const over = this._squareAt(e.clientX, e.clientY);
        if (over !== press.overSq) {
          if (press.overSq && this.squareEls[press.overSq]) {
            this.squareEls[press.overSq].classList.remove("drag-over");
          }
          press.overSq = over;
          if (over && this.squareEls[over] && this._isLegalTarget(over)) {
            this.squareEls[over].classList.add("drag-over");
          }
        }
      }
    },

    onPointerUp(e) {
      const press = this._press;
      if (!press || e.pointerId !== press.pointerId) return;
      this._press = null;

      if (press.consumed) {
        this._cleanupDrag(press);
        return;
      }

      if (press.dragging) {
        const from = press.from;
        const to = this._squareAt(e.clientX, e.clientY);
        this._cleanupDrag(press);

        if (to && to !== from && this._isLegalTarget(to)) {
          this.attemptMove(from, to);
        } else {
          // رها کردن روی خانه‌ی نامعتبر — مهره به‌جای خود برمی‌گردد
          this.renderAll();
        }
        return;
      }

      // بدون کشیدن = یک «کلیک/تپ» ساده — همان منطق قدیمی کلیک‌کلیک
      this.onSquareClick(press.from);
    },

    onPointerCancel(e) {
      const press = this._press;
      if (!press || e.pointerId !== press.pointerId) return;
      this._press = null;
      this._cleanupDrag(press);
      this.renderAll();
    },

    // ساخت مهره‌ی شناور که دنبال اشاره‌گر می‌آید
    _createGhost(fromSq) {
      const srcEl = this.squareEls[fromSq];
      if (!srcEl) return null;
      const pieceNode =
        srcEl.querySelector(".piece-img") ||
        srcEl.querySelector(".piece-glyph");
      if (!pieceNode) return null;

      const rect = srcEl.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.style.left = rect.left + rect.width / 2 + "px";
      ghost.style.top = rect.top + rect.height / 2 + "px";

      const clone = pieceNode.cloneNode(true);
      if (clone.classList && clone.classList.contains("piece-glyph")) {
        clone.style.fontSize = getComputedStyle(pieceNode).fontSize;
      }
      ghost.appendChild(clone);
      document.body.appendChild(ghost);
      return ghost;
    },

    _cleanupDrag(press) {
      if (press && press.ghost) {
        press.ghost.remove();
        press.ghost = null;
      }
      if (press && press.overSq && this.squareEls[press.overSq]) {
        this.squareEls[press.overSq].classList.remove("drag-over");
      }
      this.boardEl.classList.remove("dragging-active");
      Object.keys(this.squareEls).forEach((k) => {
        this.squareEls[k].classList.remove("dragging", "drag-over");
      });
    },

    attemptMove(from, to) {
      const expected = this.solution[this.step] || "";
      const expFrom = expected.slice(0, 2);
      const expTo = expected.slice(2, 4);
      const expPromo = expected.slice(4);

      if (from === expFrom && to === expTo) {
        const piece = this.game.get(from);
        const isPromotion =
          piece && piece.type === "p" && (to[1] === "8" || to[1] === "1");

        if (isPromotion) {
          ChessUtils.showPromotion(this.userColor, (chosen) => {
            if (!expPromo || chosen === expPromo) {
              this.commitUserMove(from, to, expPromo || chosen);
            } else {
              this.wrongMove(to);
            }
          });
          return;
        }

        this.commitUserMove(from, to, null);
        return;
      }

      // حرکت مجاز ولی اشتباه
      const legal = this.game
        .moves({ square: from, verbose: true })
        .some((m) => m.to === to);

      if (legal) {
        this.wrongMove(to);
      } else {
        // حرکت غیرمجاز — فقط لغو انتخاب
        this.selected = null;
        this.renderAll();
      }
    },

    commitUserMove(from, to, promo) {
      const mv = this.game.move({ from, to, promotion: promo || undefined });
      if (!mv) {
        this.wrongMove(to);
        return;
      }

      this.step++;
      this.lastMove = { from: mv.from, to: mv.to };
      this.selected = null;
      Sound.play("correct");
      this.afterMove();
      this.flashSquare(mv.to, "correct");
    },

    wrongMove(to) {
      this.mistakes++;
      Sound.play("wrong");
      this.selected = null;
      this.renderAll();
      this.flashSquare(to, "wrong");
      this.shakeBoard();

      const extra =
        this.mistakes >= 3
          ? " — یک راهنمایی بزن"
          : "";
      this.setMessage("این حرکت درست نیست! دوباره امتحان کن" + extra, "error");
    },

    hint() {
      if (this.solved || this.busy) return;
      if (this.step >= this.solution.length) return;

      this.hintsUsed++;
      const uci = this.solution[this.step];
      const from = uci.slice(0, 2);

      this.renderAll();
      const el = this.squareEls[from];
      if (el) el.classList.add("hint");

      Sound.play("select");
      this.setMessage("به مهره چشمک‌زن نگاه کن — مقصد درست را پیدا کن", "hint");
    },

    win() {
      this.solved = true;
      this.busy = false;
      this.renderAll();
      this.boardEl.classList.add("board-solved");
      Sound.play("win");

      const mate = this.game.in_checkmate();
      this.setMessage(
        (mate ? "<i class=\"fas fa-crown\"></i> کیش و مات! " : "<i class=\"fas fa-circle-check\"></i> ") +
          "آفرین، پازل حل شد!",
        "success"
      );

      // جعبه نتیجه
      if (this.info.solvedBox) {
        const p = this.currentPuzzle || {};
        const chips = [
          '<span class="chip gold"><i class="fas fa-gauge-high"></i> امتیاز ' +
            faNum(p.rating || 0) +
            "</span>",
          '<span class="chip"><i class="fas fa-circle-xmark"></i> خطا: ' +
            faNum(this.mistakes) +
            "</span>",
          '<span class="chip"><i class="fas fa-lightbulb"></i> راهنما: ' +
            faNum(this.hintsUsed) +
            "</span>",
        ];

        this.info.solvedBox.innerHTML =
          '<div class="solved-title"><i class="fas fa-trophy"></i> نتیجه پازل</div>' +
          '<div class="solved-stats">' +
          chips.join("") +
          "</div>" +
          (p.gameUrl
            ? '<a class="solved-link" target="_blank" rel="noopener" href="' +
              p.gameUrl +
              '"><i class="fas fa-arrow-up-right-from-square"></i> مشاهده بازی کامل</a>'
            : "");

        this.info.solvedBox.classList.add("show");
      }
    },

    reset() {
      if (!this.fen) return;
      Sound.play("select");
      this.startGame();
    },

    /* داده خام پازل جاری برای win() */
    currentPuzzle: null,
  };

  /* ============================================
     ۹) تنظیمات نسخه پنل کناری (سازگاری با کدهای قدیمی)
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
     ۱۰) منطق صفحه تنظیمات (۲۹ تم + مجموعه‌های مهره)
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
     ۱۱) بوت — اجرا پس از آماده شدن DOM
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

    // فقط صفحه مسئله روز (index) — تخته + دکمه «شروع مجدد» (resetBtn) را دارد
    // صفحاتی مثل پازل عجله‌ای تخته‌ی خودشان را جداگانه مدیریت می‌کنند
    if (document.getElementById("chessboard") && document.getElementById("resetBtn")) {
      DailyPuzzle.init();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ============================================
     ۱۲) صادرات برای استفاده در سایر صفحات
     ============================================ */

  window.ChessHub = {
    ChessUtils,
    Sound,
    DailyPuzzle,
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
    parseCSV,
    rowsToPuzzles,
    fetchDailyPuzzle,
    getDayNumber,
    faNum,
  };
})();

console.log("ChessHub: script.js loaded");