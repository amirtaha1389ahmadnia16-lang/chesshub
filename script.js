/* ============================================================
   ♛ ChessHub — فایل اسکریپت اصلی (مشترک بین همه صفحات)
   ------------------------------------------------------------
   وظایف این فایل:
   ۱) تزریق header.html و footer.html در تمام صفحات
   ۲) منوی موبایل و منوهای آبشاری
   ۳) سیستم تنظیمات (localStorage: chesshub_settings)
   ۴) ChessUtils — پیش‌بارگذاری مهره‌ها، مودال ترفیع، صداها
   ۵) درگ‌ودراپ مهره‌ها — هم ماوس (ویندوز) هم لمس (موبایل) + کلیک‌کلیک
   ۶) منطق صفحه تنظیمات (کاتالوگ رسمی تم‌ها و مهره‌ها)
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
    theme: "3",
    sound: true,
    volume: 70,
  };

  /* ============================================
     کاتالوگ‌های رسمی تنظیمات
     🔑 بی‌نهایت‌پذیر: علاوه بر لیست پایینی، هر تعداد تم رنگی و
        مجموعهٔ مهرهٔ دلخواه از دو فایل زیر اضافه می‌شود (بدون محدودیت):
          js/custom-themes.js  →  window.CHESSHUB_EXTRA_THEMES
          js/custom-pieces.js  →  window.CHESSHUB_EXTRA_PIECE_SETS
     ============================================ */

  // 🎨 تم‌های پایهٔ رنگی تخته — آیکون ۲×۲ شطرنجی
  let THEME_CATALOG = [
    { id: "1",  name: "Wood",     light: "#ecc79b", dark: "#c7703c" },
    { id: "2",  name: "Ocean",    light: "#eae9d2", dark: "#4b7399" },
    { id: "3",  name: "Classic",  light: "#f0d9b5", dark: "#b58863" },
    { id: "4",  name: "Charcoal", light: "#717b8e", dark: "#2b323f" },
    { id: "5",  name: "Meadow",   light: "#eeeed2", dark: "#769656" },
    { id: "6",  name: "Ice",      light: "#eef4f9", dark: "#6493b8" },
    { id: "7",  name: "Stone",    light: "#cac8bf", dark: "#52514e" },
    { id: "8",  name: "Violet",   light: "#efefef", dark: "#8877b7" },
    { id: "9",  name: "Coral",    light: "#f0d8bf", dark: "#ba5546" },
    { id: "10", name: "Forest",   light: "#efefec", dark: "#33684b" },
  ];

  // ♟️ مجموعه‌های پایهٔ مهره — پیش‌نمایش: pieces/<id>/wk.png و bk.png
  let PIECE_SETS = [
    { id: "alpha",     name: "Alpha" },
    { id: "classic",   name: "Classic" },
    { id: "g08ph",     name: "G08ph" },
    { id: "game_room", name: "Game Room" },
    { id: "glass",     name: "Glass" },
    { id: "light",     name: "Light" },
    { id: "neo",       name: "Neo" },
    { id: "neo_wood",  name: "Neo Wood" },
    { id: "ocean",     name: "Ocean" },
  ];

  let VALID_THEMES = THEME_CATALOG.map(function (t) { return t.id; });
  let VALID_PIECE_SETS = PIECE_SETS.map(function (p) { return p.id; });

  /* ---- 🔑 ادغام تم‌ها/مهره‌های سفارشی (تا بی‌نهایت) ---- */
  function loadLocalScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  /* CSS تم‌های سفارشی — چون تم با کلاس body اعمال می‌شود، قاعدهٔ آن
     همین‌جا از روی رنگ‌های تعریف‌شده ساخته می‌شود؛ یعنی برای تم جدید
     هیچ ویرایش CSS لازم نیست، فقط یک خط در custom-themes.js */
  function injectCustomThemeStyles(extraThemes) {
    if (!extraThemes.length) return;
    const css = extraThemes
      .map(function (t) {
        return ".theme-" + t.id + " { --board-light: " + t.light + "; --board-dark: " + t.dark + "; }";
      })
      .join("\n");
    const st = document.createElement("style");
    st.id = "chesshub-custom-theme-styles";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function mergeCustomCatalogs() {
    /* تم‌های سفارشی — id تکراری با پایه یا داخل خود لیست نادیده گرفته می‌شود */
    const extrasT = Array.isArray(window.CHESSHUB_EXTRA_THEMES) ? window.CHESSHUB_EXTRA_THEMES : [];
    const seenT = {};
    THEME_CATALOG.forEach(function (t) { seenT[t.id] = true; });
    const newThemes = [];
    extrasT.forEach(function (t) {
      if (!t || !t.id || !t.name || !t.light || !t.dark) return;
      if (seenT[String(t.id)]) return;
      seenT[String(t.id)] = true;
      newThemes.push({ id: String(t.id), name: String(t.name), light: String(t.light), dark: String(t.dark) });
    });
    THEME_CATALOG = THEME_CATALOG.concat(newThemes);
    injectCustomThemeStyles(newThemes);

    /* مجموعه‌های مهرهٔ سفارشی */
    const extrasP = Array.isArray(window.CHESSHUB_EXTRA_PIECE_SETS) ? window.CHESSHUB_EXTRA_PIECE_SETS : [];
    const seenP = {};
    PIECE_SETS.forEach(function (p) { seenP[p.id] = true; });
    const newPieces = [];
    extrasP.forEach(function (p) {
      if (!p || !p.id || !p.name) return;
      if (seenP[String(p.id)]) return;
      seenP[String(p.id)] = true;
      newPieces.push({ id: String(p.id), name: String(p.name) });
    });
    PIECE_SETS = PIECE_SETS.concat(newPieces);

    /* بازسازی لیست‌های اعتبارسنجی */
    VALID_THEMES = THEME_CATALOG.map(function (t) { return t.id; });
    VALID_PIECE_SETS = PIECE_SETS.map(function (p) { return p.id; });
  }

  function loadSettings() {
    const s = { ...defaultSettings };
    try {
      const saved = localStorage.getItem("chesshub_settings");
      if (saved) Object.assign(s, JSON.parse(saved));
    } catch (e) {}
    // اعتبارسنجی — مقدار ذخیره‌شدهٔ قدیمی که دیگر در کاتالوگ نیست → پیشفرض
    if (VALID_THEMES.indexOf(s.theme) < 0) s.theme = defaultSettings.theme;
    if (VALID_PIECE_SETS.indexOf(s.pieceSet) < 0) s.pieceSet = defaultSettings.pieceSet;
    const vol = Number(s.volume);
    s.volume = isNaN(vol) ? defaultSettings.volume : Math.max(0, Math.min(100, vol));
    s.sound = s.sound !== false;
    return s;
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
    document.body.classList.add(`theme-${settings.theme}`);
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
    return loadSettings().pieceSet;
  }

  function getCurrentTheme() {
    return loadSettings().theme;
  }

  /* ============================================
     ۲) موتور صدا (Web Audio — بدون هیچ فایل خارجی)
     صدای طبیعی و خشکِ نشستن مهره روی تخته — جدا برای
     حرکت / گرفتن مهره / کیش / برد / باخت + کنترل صدا
     ============================================ */

  const Sound = {
    _ctx: null,
    _master: null,
    _noiseBuf: null,
    _tempVol: null, // فقط در صفحه تنظیمات — پیش‌نمایش زندهٔ ولوم

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
          this._master = this._ctx.createGain();
          this._master.connect(this._ctx.destination);
        }
        if (this._ctx.state === "suspended") this._ctx.resume();
        // ولوم کاربر — سقف کلی پایین نگه داشته می‌شود تا هیچ‌وقت تند نباشد
        const vol = this._tempVol != null ? this._tempVol : loadSettings().volume;
        this._master.gain.value = 0.42 * (0.3 + 0.7 * (vol / 100));
        return this._ctx;
      } catch (e) {
        return null;
      }
    },

    _noise(ctx) {
      // بافر نویز سفید کوتاه — برای بدنهٔ «کلیکِ» ضربه
      if (!this._noiseBuf) {
        const len = Math.floor(ctx.sampleRate * 0.12);
        this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this._noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      return this._noiseBuf;
    },

    // ضربهٔ خشکِ چوبی = بدنهٔ نویز باندپس‌شده + تامپِ سینوسی با پیچ افت‌کننده
    _knock(at, freq, vol, dur) {
      const ctx = this._ctx;
      try {
        // ۱) کلیک — نویز فیلترشده با افت خیلی سریع
        const src = ctx.createBufferSource();
        src.buffer = this._noise(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = freq * 4.4;
        bp.Q.value = 1.3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        src.connect(bp);
        bp.connect(g);
        g.connect(this._master);
        src.start(at);
        src.stop(at + dur + 0.02);

        // ۲) تامپ چوبی — سینوس کوتاه که پیچش پایین می‌آید
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * 2.1, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, at + dur);
        og.gain.setValueAtTime(vol * 0.9, at);
        og.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.2);
        osc.connect(og);
        og.connect(this._master);
        osc.start(at);
        osc.stop(at + dur * 1.25 + 0.02);
      } catch (e) {}
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
        gain.connect(this._master);
        osc.start(at);
        osc.stop(at + dur + 0.03);
      } catch (e) {}
    },

    play(name) {
      const ctx = this._ensure();
      if (!ctx) return;
      const t = ctx.currentTime + 0.001;

      if (name === "move") {
        // نشستن مهره — یک ضربهٔ کوتاه و خشک
        this._knock(t, 180, 0.5, 0.055);
      } else if (name === "capture") {
        // گرفتن مهره — دو ضربهٔ محکم پشت‌سرهم
        this._knock(t, 160, 0.62, 0.05);
        this._knock(t + 0.055, 128, 0.52, 0.07);
      } else if (name === "check") {
        // کیش — همان ضربه + تیک هشدار ظریف
        this._knock(t, 200, 0.5, 0.05);
        this._tone(1180, t + 0.05, 0.07, "sine", 0.10);
        this._tone(880, t + 0.12, 0.09, "sine", 0.09);
      } else if (name === "select") {
        this._tone(520, t, 0.04, "sine", 0.07);
      } else if (name === "correct") {
        this._tone(660, t, 0.08, "sine", 0.12);
        this._tone(990, t + 0.085, 0.12, "sine", 0.12);
      } else if (name === "wrong") {
        this._tone(210, t, 0.13, "sine", 0.11);
        this._tone(155, t + 0.1, 0.16, "sine", 0.10);
      } else if (name === "win") {
        [523, 659, 784, 1046].forEach((f, i) => {
          this._tone(f, t + i * 0.09, 0.16, "sine", 0.11);
        });
      } else if (name === "lose") {
        [392, 311, 262].forEach((f, i) => {
          this._tone(f, t + i * 0.12, 0.18, "sine", 0.10);
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
    // صفحاتی مثل game-review.html عمداً header/footer ندارند — بی‌صدا رد شود
    if (!element) return false;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      if (element) element.innerHTML = html;
      else console.warn("المان " + selector + " پیدا نشد");
      return true;
    } catch (error) {
      console.error("خطا در بارگذاری " + url + ":", error.message);
      // پیام راهنمای ملایم برای کاربر
      if (element) {
        element.innerHTML =
          '<div class="component-error">' +
          '<i class="fas fa-triangle-exclamation"></i>' +
          "ارتباط با سرور برقرار نشد — اتصال اینترنت را بررسی کن و صفحه را دوباره بارگذاری کن." +
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
     ۷) منطق صفحه تنظیمات — کاتالوگ رسمی
     ۱۰ تم رنگی + ۹ مجموعه مهره + کارت صدا + Guard
     ============================================ */

  function initSettingsPage() {
    const themeGrid = document.getElementById("themeGrid");
    const pieceContainer = document.getElementById("pieceSetsContainer");
    if (!themeGrid && !pieceContainer) return;

    /* زیرنویس با تعداد واقعی — بعد از افزودن تم/مهرهٔ دلخواه خودش به‌روز می‌ماند */
    if (themeGrid) {
      const card = themeGrid.closest(".settings-card");
      const sub = card ? card.querySelector(".card-sub") : null;
      if (sub) sub.textContent = faNum(THEME_CATALOG.length) + " تم رنگی — افزودن تم دلخواه تا بی‌نهایت";
    }
    if (pieceContainer) {
      const card = pieceContainer.closest(".settings-card");
      const sub = card ? card.querySelector(".card-sub") : null;
      if (sub) sub.textContent = faNum(PIECE_SETS.length) + " مجموعهٔ مهره — افزودن مجموعهٔ دلخواه تا بی‌نهایت";
    }

    const $ = (id) => document.getElementById(id);
    const saved = loadSettings();
    let tempTheme = saved.theme;
    let tempPieceSet = saved.pieceSet;
    let tempSound = saved.sound;
    let tempVolume = saved.volume;
    let pendingUrl = null;

    const dirtyPill = $("unsavedPill");
    const saveBtn = $("saveSettingsBtn");

    const isDirty = () => {
      const cur = loadSettings();
      return (
        tempTheme !== cur.theme ||
        tempPieceSet !== cur.pieceSet ||
        tempSound !== cur.sound ||
        tempVolume !== cur.volume
      );
    };

    const refreshDirtyUI = () => {
      const dirty = isDirty();
      if (dirtyPill) dirtyPill.classList.toggle("show", dirty);
      if (saveBtn) saveBtn.classList.toggle("has-changes", dirty);
    };

    const toast = (text) => {
      const el = $("settingsToast");
      if (!el) return;
      el.textContent = text;
      el.classList.add("show");
      clearTimeout(el._timeout);
      el._timeout = setTimeout(() => el.classList.remove("show"), 2500);
    };

    /* ---- دیالوگ داخلی (به‌جای confirm خام مرورگر) ---- */
    const dialogEl = $("ghDialog");
    let dialogOk = null;
    let dialogAlt = null;

    function openDialog(opts) {
      if (!dialogEl) return;
      $("ghDialogTitle").textContent = opts.title;
      $("ghDialogDesc").textContent = opts.desc;
      $("ghDialogIcon").innerHTML = '<i class="' + opts.icon + '"></i>';
      dialogEl.dataset.tone = opts.tone || "warn";
      $("ghDialogOkLabel").textContent = opts.ok;
      $("ghDialogOkIcon").className = opts.okIcon || "fas fa-floppy-disk";
      const altBtn = $("ghDialogAlt");
      if (opts.alt) {
        altBtn.style.display = "";
        $("ghDialogAltLabel").textContent = opts.alt;
        $("ghDialogAltIcon").className = opts.altIcon || "fas fa-xmark";
        dialogAlt = opts.onAlt || null;
      } else {
        altBtn.style.display = "none";
        dialogAlt = null;
      }
      dialogOk = opts.onOk || null;
      dialogEl.classList.add("open");
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        const b = $("ghDialogCancel");
        if (b) b.focus();
      }, 80);
    }

    function closeDialog() {
      if (!dialogEl) return;
      dialogEl.classList.remove("open");
      document.body.style.overflow = "";
      dialogOk = null;
      dialogAlt = null;
    }

    if (dialogEl) {
      $("ghDialogCancel").addEventListener("click", closeDialog);
      $("ghDialogOk").addEventListener("click", () => {
        const fn = dialogOk;
        closeDialog();
        if (fn) fn();
      });
      $("ghDialogAlt").addEventListener("click", () => {
        const fn = dialogAlt;
        closeDialog();
        if (fn) fn();
      });
      dialogEl.addEventListener("click", (e) => {
        if (e.target === dialogEl) closeDialog();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && dialogEl.classList.contains("open")) {
          closeDialog();
        }
      });
    }

    /* ---- اعمال موقت تم (پیش‌نمایش — ذخیره با دکمه) ---- */
    const applyTempTheme = (id) => {
      document.body.className = document.body.className
        .split(" ")
        .filter((cls) => !cls.startsWith("theme-"))
        .join(" ");
      document.body.classList.add("theme-" + id);
    };

    /* ---- رنگ پس‌زمینهٔ پیش‌نمایش مهره‌ها = تم انتخابی ---- */
    function updatePieceBoxColors() {
      if (!pieceContainer) return;
      const th =
        THEME_CATALOG.find((t) => t.id === tempTheme) || THEME_CATALOG[2];
      pieceContainer.querySelectorAll(".piece-box").forEach((el) => {
        el.style.setProperty("--cl", th.light);
        el.style.setProperty("--cd", th.dark);
      });
    }

    /* ---- کارت‌های تم — پیش‌نمایش واقعی شطرنجی ---- */
    function buildThemeButtons() {
      if (!themeGrid) return;
      themeGrid.innerHTML = "";
      THEME_CATALOG.forEach((theme) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-card" + (theme.id === tempTheme ? " active" : "");
        btn.title = theme.name;
        btn.innerHTML =
          '<span class="theme-board" style="--cl:' + theme.light + ";--cd:" + theme.dark + '"></span>' +
          '<span class="theme-name">' + theme.name + "</span>" +
          '<span class="pick-badge"><i class="fas fa-check"></i></span>';
        btn.onclick = () => {
          themeGrid
            .querySelectorAll(".theme-card")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          tempTheme = theme.id;
          applyTempTheme(theme.id);
          updatePieceBoxColors();
          Sound.play("select");
          refreshDirtyUI();
        };
        themeGrid.appendChild(btn);
      });
    }

    /* ---- کارت‌های مهره — بزرگ، پیش‌نمایش واقعی، نام انگلیسی ---- */
    function buildPieceButtons() {
      if (!pieceContainer) return;
      pieceContainer.innerHTML = "";
      PIECE_SETS.forEach((set) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "piece-card" + (set.id === tempPieceSet ? " active" : "");
        btn.dataset.set = set.id;
        btn.title = set.name;
        btn.innerHTML =
          '<span class="piece-box">' +
          '<img src="pieces/' + set.id + '/wk.png" alt="King" loading="lazy" ' +
          'onerror="this.style.display=\'none\'">' +
          '<img src="pieces/' + set.id + '/bk.png" alt="King" loading="lazy" ' +
          'onerror="this.style.display=\'none\'">' +
          "</span>" +
          '<span class="piece-name">' + set.name + "</span>" +
          '<span class="pick-badge"><i class="fas fa-check"></i></span>';
        btn.onclick = () => {
          pieceContainer
            .querySelectorAll(".piece-card")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          tempPieceSet = set.id;
          Sound.play("select");
          refreshDirtyUI();
        };
        pieceContainer.appendChild(btn);
      });
      updatePieceBoxColors();
    }

    /* ---- کارت صدا: کلید + ولوم + نمونه ---- */
    function syncSoundUI() {
      const soundToggle = $("settingsSoundToggle");
      const volSlider = $("volumeSlider");
      const volValue = $("volumeValue");
      const stateEl = $("soundStateLabel");
      if (soundToggle) soundToggle.checked = tempSound;
      if (stateEl) {
        stateEl.textContent = tempSound ? "فعال" : "غیرفعال";
        stateEl.classList.toggle("on", tempSound);
      }
      if (volSlider) volSlider.value = tempVolume;
      if (volValue) volValue.textContent = faNum(tempVolume) + "٪";
    }

    function initSoundCard() {
      const soundToggle = $("settingsSoundToggle");
      const volSlider = $("volumeSlider");
      const testBtn = $("soundTestBtn");
      syncSoundUI();

      if (soundToggle) {
        soundToggle.addEventListener("change", () => {
          tempSound = soundToggle.checked;
          syncSoundUI();
          refreshDirtyUI();
          if (tempSound) Sound.play("select");
        });
      }
      if (volSlider) {
        volSlider.addEventListener("input", () => {
          tempVolume = Number(volSlider.value);
          syncSoundUI();
          Sound._tempVol = tempVolume; // پیش‌نمایش زندهٔ ولوم
          refreshDirtyUI();
        });
        volSlider.addEventListener("change", () => {
          if (tempSound) Sound.play("move"); // شنیدن ضربه با ولوم جدید
        });
      }
      if (testBtn) {
        testBtn.addEventListener("click", () => {
          if (!tempSound) {
            toast("اول صدا را فعال کن");
            return;
          }
          Sound._tempVol = tempVolume;
          Sound.play("move");
          setTimeout(() => Sound.play("capture"), 280);
          setTimeout(() => Sound.play("check"), 680);
        });
      }
    }

    /* ---- ذخیره نهایی ---- */
    function persistAll() {
      const settings = loadSettings();
      settings.theme = tempTheme;
      settings.pieceSet = tempPieceSet;
      settings.sound = tempSound;
      settings.volume = tempVolume;
      saveSettings(settings);
      Sound._tempVol = null;
      applyTempTheme(settings.theme);
      document.dispatchEvent(
        new CustomEvent("pieceSetChanged", { detail: { pieceSet: settings.pieceSet } })
      );
      document.dispatchEvent(
        new CustomEvent("themeChanged", { detail: { theme: settings.theme } })
      );
    }

    function saveAll() {
      persistAll();
      Sound.play("correct");
      refreshDirtyUI();
      if (pendingUrl) {
        const url = pendingUrl;
        pendingUrl = null;
        toast("ذخیره شد — در حال خروج…");
        setTimeout(() => {
          window.location.href = url;
        }, 420);
      } else {
        toast("تنظیمات با موفقیت ذخیره شد");
      }
    }

    function resetAll() {
      openDialog({
        tone: "danger",
        icon: "fas fa-rotate-left",
        title: "بازنشانی تنظیمات",
        desc: "همهٔ تنظیمات به حالت پیشفرض برمی‌گردد. مطمئنی؟",
        ok: "بازنشانی",
        okIcon: "fas fa-rotate-left",
        onOk: () => {
          tempTheme = defaultSettings.theme;
          tempPieceSet = defaultSettings.pieceSet;
          tempSound = defaultSettings.sound;
          tempVolume = defaultSettings.volume;
          applyTempTheme(tempTheme);
          Sound._tempVol = null;
          buildThemeButtons();
          buildPieceButtons();
          syncSoundUI();
          document.dispatchEvent(
            new CustomEvent("pieceSetChanged", {
              detail: { pieceSet: defaultSettings.pieceSet },
            })
          );
          document.dispatchEvent(
            new CustomEvent("themeChanged", {
              detail: { theme: defaultSettings.theme },
            })
          );
          Sound.play("select");
          toast("به پیشفرض بازگشت — برای ماندگاری ذخیره کن");
          refreshDirtyUI();
        },
      });
    }

    /* ---- Guard: تغییرات ذخیره‌نشده ---- */
    function openGuard() {
      openDialog({
        tone: "warn",
        icon: "fas fa-triangle-exclamation",
        title: "تغییرات ذخیره نشده‌اند",
        desc: "آیا می‌خواهید ذخیره کنید؟",
        ok: "ذخیره و خروج",
        okIcon: "fas fa-floppy-disk",
        onOk: saveAll,
        alt: "خروج بدون ذخیره",
        altIcon: "fas fa-arrow-right-from-bracket",
        onAlt: () => {
          if (pendingUrl) {
            const u = pendingUrl;
            pendingUrl = null;
            window.location.href = u;
          }
        },
      });
    }

    // کلیک روی هر لینک صفحه → اگر تغییر ذخیره‌نشده هست، اول دیالوگ
    document.addEventListener(
      "click",
      (e) => {
        if (!isDirty()) return;
        if (dialogEl && dialogEl.classList.contains("open")) return;
        const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href || href === "#" || href.indexOf("javascript:") === 0) return;
        if (a.target === "_blank") return;
        e.preventDefault();
        e.stopPropagation();
        pendingUrl = href;
        openGuard();
      },
      true
    );

    // بستن تب / رفرش صفحه → هشدار خود مرورگر
    window.addEventListener("beforeunload", (e) => {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    });

    /* ---- بوت صفحه ---- */
    buildThemeButtons();
    buildPieceButtons();
    initSoundCard();
    refreshDirtyUI();

    if (saveBtn) saveBtn.addEventListener("click", saveAll);
    const resetBtn = $("resetSettingsBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetAll);
  }


  /* ============================================
     ۷٫۵) انجین شطرنج — دانلود + ذخیره در IndexedDB + Worker
     ------------------------------------------------------------
     • کاتالوگ: نسخه‌های رسمی WASM «single» از unpkg (بدون نیاز
       به SharedArrayBuffer؛ CORS باز — تست‌شده).
     • ذخیره‌سازی: IndexedDB (محلی؛ حجم بزرگ پشتیبانی می‌شود).
       localStorage فقط برای «انجین فعال» و نشان‌گر بستن
       دعوت‌نامهٔ اولیه استفاده می‌شود.
     • اجرا: Worker از Blob + مسیر فایل wasm از طریق «hash» آدرس
       Worker — مکانیزم رسمی خودِ لودر Stockfish
       (self.location.hash → e[0]). اگر hash پشتیبانی نشود متن
       لودر با نشانی Blob پچ می‌شود؛ فالبک نهایی: انجین محلی.
     ============================================ */

  const ENGINE_DB_NAME = "chesshub_engine";
  const ENGINE_FILES_STORE = "files";
  const ENGINE_META_STORE = "meta";
  const ENGINE_ACTIVE_KEY = "chesshub_engine_active";
  const ENGINE_PROMPT_KEY = "chesshub_engine_prompt_dismissed";
  const ENGINE_DEFAULT_ID = "sf18lite";

  // کاتالوگ رسمی انجین‌ها — ۵ انجین (نسخه‌های رسمی single؛ سازگار با همهٔ هاست‌ها)
  const ENGINE_CATALOG = [
    {
      id: "sf19", label: "Stockfish 19", version: "19.0.1", sizeBytes: 95200000,
      desc: "جدیدترین و قوی‌ترین نسخهٔ رسمی — NNUE کامل",
      tag: "قوی‌ترین",
      js: "https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-single.js",
      wasm: "https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-single.wasm",
    },
    {
      id: "sf18", label: "Stockfish 18", version: "18.0.8", sizeBytes: 108000000,
      desc: "نسخهٔ پایدار و بسیار قوی — NNUE کامل",
      tag: "پایدار",
      js: "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-single.js",
      wasm: "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-single.wasm",
    },
    {
      id: "sf19lite", label: "Stockfish 19 Lite", version: "19.0.1", sizeBytes: 1900000,
      desc: "سبک‌ترین نسخهٔ رسمی ۱۹ — دانلود سریع، شروع آنی",
      tag: "سریع",
      js: "https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-lite-single.js",
      wasm: "https://unpkg.com/stockfish@19.0.1/bin/stockfish-19-lite-single.wasm",
    },
    {
      id: "sf18lite", label: "Stockfish 18 Lite", version: "18.0.8", sizeBytes: 7300000,
      desc: "سبک و سریع با NNUE — مناسب بارگذاری سریع",
      tag: "پیشنهادی",
      js: "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js",
      wasm: "https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm",
    },
    {
      id: "sf16", label: "Stockfish 16", version: "16.0.0", sizeBytes: 620000,
      desc: "نسخهٔ کلاسیک فوق‌سبک — برای دستگاه‌های قدیمی‌تر",
      tag: "فوق‌سبک",
      js: "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.js",
      wasm: "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.wasm",
    },
  ];

  /* ---- ابزار IndexedDB ---- */
  function engineDbOpen() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB پشتیبانی نمی‌شود"));
        return;
      }
      const req = indexedDB.open(ENGINE_DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(ENGINE_FILES_STORE)) db.createObjectStore(ENGINE_FILES_STORE);
        if (!db.objectStoreNames.contains(ENGINE_META_STORE)) db.createObjectStore(ENGINE_META_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB باز نشد")); };
    });
  }
  function engineDbPut(store, key, val) {
    return engineDbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error || new Error("ذخیره ناموفق")); };
      });
    });
  }
  function engineDbGet(store, key) {
    return engineDbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const rq = db.transaction(store, "readonly").objectStore(store).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function engineDbDelete(store, key) {
    return engineDbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function engineDbKeys(store) {
    return engineDbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const rq = db.transaction(store, "readonly").objectStore(store).getAllKeys();
        rq.onsuccess = function () { res(rq.result || []); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  const EngineStore = {
    catalog: ENGINE_CATALOG,
    downloads: {}, // engineId → AbortController
    watchers: {},  // engineId → fn(percent) برای نمایش زندهٔ درصد

    meta(id) {
      for (let i = 0; i < ENGINE_CATALOG.length; i++) {
        if (ENGINE_CATALOG[i].id === id) return ENGINE_CATALOG[i];
      }
      return null;
    },

    listDownloaded() {
      return engineDbKeys(ENGINE_META_STORE).catch(function () { return []; });
    },

    activeId() {
      try { return localStorage.getItem(ENGINE_ACTIVE_KEY) || null; } catch (e) { return null; }
    },

    setActive(id) {
      try {
        if (id) localStorage.setItem(ENGINE_ACTIVE_KEY, id);
        else localStorage.removeItem(ENGINE_ACTIVE_KEY);
      } catch (e) {}
      document.dispatchEvent(new CustomEvent("engineStoreChanged"));
    },

    get(id) {
      return Promise.all([
        engineDbGet(ENGINE_FILES_STORE, id + "/engine.js"),
        engineDbGet(ENGINE_FILES_STORE, id + "/engine.wasm"),
      ]).then(function (pair) {
        if (!pair[0] || !pair[1]) return null;
        return { js: pair[0], wasm: pair[1] };
      });
    },

    // دانلود با درصد ۰ تا ۱۰۰ — onProgress(percent)
    download(id, onProgress) {
      const self = this;
      const meta = this.meta(id);
      if (!meta) return Promise.reject(new Error("انجین پیدا نشد"));
      if (self.downloads[id]) return Promise.reject(new Error("دانلود در جریان است"));
      const ctrl = new AbortController();
      self.downloads[id] = ctrl;
      const rep = function (p) {
        const v = Math.max(0, Math.min(100, Math.round(p)));
        if (onProgress) onProgress(v);
        if (self.watchers[id]) self.watchers[id](v);
      };
      rep(1);
      const opts = { cache: "no-store", signal: ctrl.signal };
      const jsFetch = fetch(meta.js, opts).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        const total = Number(r.headers.get("content-length")) || 40000;
        return engineStreamToBlob(r, function (rec) { rep(1 + 2 * (rec / total)); });
      });
      const wasmFetch = jsFetch.then(function () {
        return fetch(meta.wasm, opts).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          const total = Number(r.headers.get("content-length")) || Math.max(1, meta.sizeBytes - 40000);
          return engineStreamToBlob(r, function (rec) { rep(3 + 96 * (rec / total)); });
        });
      });
      return Promise.all([jsFetch, wasmFetch])
        .then(function (pair) {
          rep(99);
          return Promise.all([
            engineDbPut(ENGINE_FILES_STORE, id + "/engine.js", pair[0]),
            engineDbPut(ENGINE_FILES_STORE, id + "/engine.wasm", pair[1]),
            engineDbPut(ENGINE_META_STORE, id, {
              id: id, label: meta.label, version: meta.version,
              size: pair[0].size + pair[1].size, t: Date.now(),
            }),
          ]).then(function () { rep(100); });
        })
        .then(function () {
          delete self.downloads[id];
          if (!self.activeId()) self.setActive(id);
          else document.dispatchEvent(new CustomEvent("engineStoreChanged"));
          return true;
        })
        .catch(function (err) {
          delete self.downloads[id];
          throw err;
        });
    },

    cancel(id) {
      const c = this.downloads[id];
      if (c && c.abort) c.abort();
    },

    isDownloading(id) { return !!this.downloads[id]; },

    remove(id) {
      const self = this;
      return Promise.all([
        engineDbDelete(ENGINE_FILES_STORE, id + "/engine.js").catch(function () {}),
        engineDbDelete(ENGINE_FILES_STORE, id + "/engine.wasm").catch(function () {}),
        engineDbDelete(ENGINE_META_STORE, id).catch(function () {}),
      ]).then(function () {
        if (self.activeId() === id) {
          return self.listDownloaded().then(function (rest) {
            self.setActive(rest.length ? rest[0] : null);
          });
        }
        document.dispatchEvent(new CustomEvent("engineStoreChanged"));
      });
    },

    // ساخت Worker از انجین ذخیره‌شده
    // usePatch=false → مکانیزم hash خود لودر؛ usePatch=true → پچ مستقیم نشانی wasm
    createWorker(id, usePatch) {
      return this.get(id).then(function (files) {
        if (!files) return null;
        const wasmUrl = URL.createObjectURL(
          new Blob([files.wasm], { type: "application/wasm" })
        );
        return files.js.text().then(function (jsText) {
          let jsUrl;
          try {
            if (usePatch) {
              const patched = jsText.replace(
                'location.origin+location.pathname.replace(/\\.js$/i,".wasm")',
                '"' + wasmUrl + '"'
              );
              jsUrl = URL.createObjectURL(new Blob([patched], { type: "text/javascript" }));
            } else {
              jsUrl =
                URL.createObjectURL(new Blob([jsText], { type: "text/javascript" })) +
                "#" +
                encodeURIComponent(wasmUrl);
            }
            const w = new Worker(jsUrl);
            w._chWasmUrl = wasmUrl;
            return w;
          } catch (e) {
            console.warn("[EngineStore] ساخت Worker ناموفق:", e && e.message);
            return null;
          }
        });
      });
    },

    // Worker انجین فعال — اگر هیچ انجین ذخیره‌شده‌ای نیست null
    createActiveWorker(usePatch) {
      const self = this;
      return self.listDownloaded().then(function (list) {
        if (!list.length) return null;
        let id = self.activeId();
        if (list.indexOf(id) < 0) id = list[0];
        return self.createWorker(id, usePatch).then(function (w) {
          if (w) w._chEngineId = id;
          return w;
        });
      });
    },

    promptDismissed() {
      try { return localStorage.getItem(ENGINE_PROMPT_KEY) === "1"; } catch (e) { return false; }
    },

    dismissPrompt() {
      try { localStorage.setItem(ENGINE_PROMPT_KEY, "1"); } catch (e) {}
    },
  };
  window.EngineStore = EngineStore;

  // خواندن استریمی پاسخ → Blob با گزارش پیشرفت
  function engineStreamToBlob(resp, onRec) {
    const total = Number(resp.headers.get("content-length")) || 0;
    if (!resp.body || typeof resp.body.getReader !== "function") {
      return resp.blob().then(function (b) { if (onRec) onRec(b.size, b.size); return b; });
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    return new Promise(function (resolve, reject) {
      function pump() {
        reader.read().then(function (r) {
          if (r.done) { resolve(new Blob(chunks)); return; }
          chunks.push(r.value);
          received += r.value.byteLength;
          if (onRec) onRec(received, total);
          pump();
        }).catch(reject);
      }
      pump();
    });
  }

  /* ---- کادر دعوت دانلود انجین (فقط اولین ورود) ---- */
  function initEnginePrompt() {
    const mount = document.getElementById("enginePromptMount");
    if (!mount) return;
    EngineStore.listDownloaded().then(function (list) {
      if (list.length || EngineStore.promptDismissed()) return;
      mount.innerHTML =
        '<div class="gh-dialog-overlay engine-prompt" id="enginePrompt" data-tone="engine">' +
          '<div class="gh-dialog" role="dialog" aria-modal="true">' +
            '<div class="gh-dialog-icon"><i class="fas fa-microchip"></i></div>' +
            '<h3 class="gh-dialog-title">دانلود انجین Stockfish</h3>' +
            '<p class="gh-dialog-desc">برای مرور دقیق بازی‌ها، می‌توانید موتور انجین اصل (Stockfish) را یک بار دانلود کنید. پس از دانلود، در مرورگر شما ذخیره می‌شود و دفعات بعد نیازی به دانلود دوباره نیست. <b>(حدود ۷ مگابایت)</b></p>' +
            '<div class="engine-prog" id="enginePromptProg"><div class="engine-prog-fill"></div></div>' +
            '<div class="engine-prog-pct" id="enginePromptPct"></div>' +
            '<div class="gh-dialog-actions">' +
              '<button type="button" class="gh-btn gh-btn-save" id="enginePromptOk"><i class="fas fa-download"></i> دانلود انجین</button>' +
              '<button type="button" class="gh-btn gh-btn-muted" id="enginePromptNo">فعلاً نه</button>' +
              '<a class="gh-link" href="settings.html#engine-section">می‌توانید بعداً از بخش تنظیمات، انجین را دانلود کنید.</a>' +
            '</div>' +
          '</div>' +
        '</div>';
      const ov = document.getElementById("enginePrompt");
      requestAnimationFrame(function () { ov.classList.add("open"); });

      function hide() { ov.classList.remove("open"); }

      document.getElementById("enginePromptNo").addEventListener("click", function () {
        EngineStore.dismissPrompt();
        hide();
      });
      ov.addEventListener("click", function (e) { if (e.target === ov) hide(); });
      document.getElementById("enginePromptOk").addEventListener("click", function () {
        const btn = this;
        const prog = document.getElementById("enginePromptProg");
        const fill = prog.querySelector(".engine-prog-fill");
        const pct = document.getElementById("enginePromptPct");
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> در حال دانلود…';
        prog.classList.add("show");
        EngineStore.download(ENGINE_DEFAULT_ID, function (p) {
          fill.style.width = p + "%";
          pct.textContent = faNum(p) + "٪";
        })
          .then(function () {
            hide();
            if (window.GameReview && GameReview.showToast) {
              GameReview.showToast("انجین ذخیره شد — از این به بعد در مرور بازی استفاده می‌شود");
            }
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> تلاش مجدد';
            prog.classList.remove("show");
            pct.textContent = "";
            console.warn("[EngineStore] دانلود ناموفق:", err && err.message);
            if (window.GameReview && GameReview.showToast) {
              GameReview.showToast("دانلود ناموفق بود — اینترنت را بررسی کن");
            }
          });
      });
    });
  }

  /* ---- بخش «دانلود انجین» در صفحهٔ تنظیمات ---- */
  function initEngineSection() {
    const box = document.getElementById("engineList");
    const activeBox = document.getElementById("engineActiveBox");
    if (!box) return;

    function sizeFa(bytes) {
      if (bytes < 1048576) return "کمتر از ۱ مگابایت";
      return faNum(Math.round(bytes / 1048576)) + " مگابایت";
    }

    /* ---- کادر «انجین فعال» — فقط انجین انتخاب‌شده در آنالیز استفاده می‌شود ---- */
    function renderActiveBox(downloaded) {
      if (!activeBox) return;
      if (!downloaded.length) {
        activeBox.innerHTML =
          '<div class="ea-ico"><i class="fas fa-bolt"></i></div>' +
          '<div class="ea-label">انجین فعال<small>هنوز هیچ انجینی دانلود نشده — آنالیز با انجین سبک داخلی اجرا می‌شود</small></div>' +
          '<span class="engine-select engine-empty"><i class="fas fa-circle-info"></i> اول یک انجین دانلود کن</span>';
        return;
      }
      const active = EngineStore.activeId();
      const validActive = downloaded.indexOf(active) >= 0 ? active : downloaded[0];
      let html =
        '<div class="ea-ico"><i class="fas fa-bolt"></i></div>' +
        '<div class="ea-label">انجین فعال<small>فقط همین انجین در تحلیل‌ها و مرور بازی استفاده می‌شود</small></div>' +
        '<select class="engine-select" id="engineActiveSelect" aria-label="انتخاب انجین فعال">';
      ENGINE_CATALOG.forEach(function (eng) {
        if (downloaded.indexOf(eng.id) < 0) return;
        html += '<option value="' + eng.id + '"' + (eng.id === validActive ? " selected" : "") + ">" +
          eng.label + " — v" + eng.version + "</option>";
      });
      html += "</select>";
      activeBox.innerHTML = html;
      const sel = document.getElementById("engineActiveSelect");
      if (sel) {
        sel.addEventListener("change", function () {
          EngineStore.setActive(this.value);
          Sound.play("select");
          const m = EngineStore.meta(this.value);
          toast("انجین فعال: " + (m ? m.label : this.value));
        });
      }
    }

    function render() {
      EngineStore.listDownloaded().then(function (downloaded) {
        const active = EngineStore.activeId();
        renderActiveBox(downloaded);
        box.innerHTML = "";
        ENGINE_CATALOG.forEach(function (eng) {
          const isDone = downloaded.indexOf(eng.id) >= 0;
          const isActive = isDone && active === eng.id;
          const isDl = EngineStore.isDownloading(eng.id);
          const row = document.createElement("div");
          row.className =
            "engine-item" + (isDone ? " done" : "") + (isActive ? " active" : "");
          row.innerHTML =
            '<div class="engine-ico"><i class="fas fa-microchip"></i></div>' +
            '<div class="engine-info">' +
              '<div class="engine-name">' + eng.label +
                ' <span class="engine-ver">v' + eng.version + "</span>" +
                (eng.tag ? '<span class="engine-tag">' + eng.tag + "</span>" : "") +
              "</div>" +
              '<div class="engine-desc">' + eng.desc + "</div>" +
              '<div class="engine-size">حجم تقریبی: ≈ ' + sizeFa(eng.sizeBytes) + "</div>" +
              '<div class="engine-status' + (isDone ? " ok" : "") + '">' +
                (isDone ? "دانلود شده ✅" : "ذخیره نشده") +
                (isActive
                  ? '<span class="engine-active-chip"><i class="fas fa-circle-check"></i> انجین فعال</span>'
                  : "") +
              "</div>" +
              '<div class="engine-prog"><div class="engine-prog-fill"></div></div>' +
            "</div>" +
            '<div class="engine-actions"></div>';

          const actions = row.querySelector(".engine-actions");
          const prog = row.querySelector(".engine-prog");
          const fill = row.querySelector(".engine-prog-fill");

          function mkBtn(label, icon, cls, fn) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "engine-btn " + cls;
            /* 🔑 آیکن داخل چیپ گرد — fa- پیشوند لازم است وگرنه آیکن رندر نمی‌شود */
            b.innerHTML = '<i class="fas fa-' + icon + '"></i> ' + label;
            b.addEventListener("click", fn);
            actions.appendChild(b);
            return b;
          }

          function startDownload() {
            prog.classList.add("show");
            // در حین دانلود فقط «لغو» نشان داده شود
            actions.innerHTML = "";
            mkBtn("لغو", "xmark", "ghost", function () { EngineStore.cancel(eng.id); });
            EngineStore.download(eng.id, function (p) {
              fill.style.width = p + "%";
            })
              .then(function () { render(); })
              .catch(function (err) {
                prog.classList.remove("show");
                fill.style.width = "0%";
                if (err && err.name === "AbortError") { render(); return; }
                console.warn("[EngineStore] دانلود ناموفق:", err && err.message);
                alert("دانلود انجین ناموفق بود: " + ((err && err.message) || "خطای شبکه"));
                render();
              });
          }

          if (isDl) {
            prog.classList.add("show");
            mkBtn("لغو", "xmark", "ghost", function () { EngineStore.cancel(eng.id); });
          } else if (isDone) {
            if (!isActive) {
              mkBtn("فعال‌سازی", "circle-check", "primary", function () {
                EngineStore.setActive(eng.id);
              });
            }
            mkBtn("دانلود مجدد", "rotate", "ghost", startDownload);
            mkBtn("حذف", "trash", "danger", function () { EngineStore.remove(eng.id); });
          } else {
            mkBtn("دانلود انجین", "download", "primary", startDownload);
          }

          box.appendChild(row);
        });
      });
    }

    render();
    document.addEventListener("engineStoreChanged", render);
  }


  /* ============================================
     ۸) بوت — اجرا پس از آماده شدن DOM
     ============================================ */

  async function boot() {
    /* 🔑 اول فایل‌های سفارشی (بی‌نهایت تم/مهره) — با بستر زمانی تا ویرایشِ
       مالکِ سایت همیشه بدون مشکل کش بلافاصله دیده شود */
    await Promise.all([
      loadLocalScript("js/custom-themes.js?t=" + Date.now()),
      loadLocalScript("js/custom-pieces.js?t=" + Date.now()),
    ]);
    mergeCustomCatalogs();

    applySavedThemeEarly();

    await Promise.all([
      loadComponent("#header-placeholder", "header.html"),
      loadComponent("#footer-placeholder", "footer.html"),
    ]);

    initMobileMenu();
    initSettings();
    initSettingsPage();
    initEnginePrompt();
    initEngineSection();
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
    initEnginePrompt,
    initEngineSection,
    faNum,
  };
})();

console.log("ChessHub: script.js loaded");