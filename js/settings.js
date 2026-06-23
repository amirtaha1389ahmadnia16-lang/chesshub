// ============================================
// ⚙️ تنظیمات سراسری - Settings Manager
// ============================================

(function () {
  // ----- تنظیمات پیش‌فرض -----
  const defaultSettings = {
    pieceSet: "cburnett",
    theme: "light",
    sound: true,
  };

  // ============================================
  // 🎨 لیست کامل مهره‌ها (۴۱ ست)
  // ============================================
  const pieceSets = [
    // سه بعدی
    { name: "3d_chesskid", label: "کید سه‌بعدی", emoji: "🎮" },
    { name: "3d_plastic", label: "پلاستیک سه‌بعدی", emoji: "🧊" },
    { name: "3d_staunton", label: "استانتون سه‌بعدی", emoji: "🏛️" },
    { name: "3d_wood", label: "چوب سه‌بعدی", emoji: "🪵" },
    // کلاسیک
    { name: "alpha", label: "آلفا", emoji: "🔤" },
    { name: "bases", label: "بیس", emoji: "📐" },
    { name: "cburnett", label: "سی‌برنت", emoji: "🎨" },
    { name: "classic", label: "کلاسیک", emoji: "♟️" },
    { name: "club", label: "کلاب", emoji: "♣️" },
    { name: "condal", label: "کندال", emoji: "🏰" },
    { name: "governor", label: "گاورنر", emoji: "👔" },
    { name: "merida", label: "مریدا", emoji: "🏹" },
    { name: "staunty", label: "استانتی", emoji: "👑" },
    { name: "tatiana", label: "تاتیانا", emoji: "👸" },
    // کارتونی
    { name: "8_bit", label: "۸ بیتی", emoji: "🕹️" },
    { name: "bubblegum", label: "حباب", emoji: "🫧" },
    { name: "graffiti", label: "گرافیتی", emoji: "🎨" },
    { name: "lolz", label: "لولز", emoji: "😂" },
    { name: "tigers", label: "ببری", emoji: "🐯" },
    // طبیعت
    { name: "forest", label: "جنگل", emoji: "🌲" },
    { name: "icy_sea", label: "دریای یخی", emoji: "❄️" },
    { name: "nature", label: "طبیعت", emoji: "🌿" },
    { name: "neo_wood", label: "چوب نئون", emoji: "🪵" },
    { name: "ocean", label: "اقیانوس", emoji: "🌊" },
    { name: "sky", label: "آسمان", emoji: "☁️" },
    { name: "wood", label: "چوب", emoji: "🪵" },
    // مدرن
    { name: "glass", label: "شیشه‌ای", emoji: "🪟" },
    { name: "light", label: "روشن", emoji: "💡" },
    { name: "marble", label: "مرمر", emoji: "🪨" },
    { name: "metal", label: "فلزی", emoji: "⚙️" },
    { name: "modern", label: "مدرن", emoji: "✨" },
    { name: "neo", label: "نئون", emoji: "💫" },
    { name: "neon", label: "نئون", emoji: "🌟" },
    // خاص
    { name: "blindfold", label: "چشم‌بسته", emoji: "😎" },
    { name: "book", label: "کتاب", emoji: "📖" },
    { name: "cases", label: "کیس", emoji: "📦" },
    { name: "dash", label: "دش", emoji: "⚡" },
    { name: "game_room", label: "اتاق بازی", emoji: "🎯" },
    { name: "gothic", label: "گوتیک", emoji: "🏗️" },
    { name: "maya", label: "مایا", emoji: "🗿" },
    { name: "newspaper", label: "روزنامه", emoji: "📰" },
    { name: "space", label: "فضایی", emoji: "🚀" },
    { name: "tournament", label: "تورنمنت", emoji: "🏆" },
    { name: "vintage", label: "وینتیج", emoji: "📻" },
  ];

  // ============================================
  // 🔍 تشخیص نوع فایل (png یا svg)
  // ============================================
  function getPieceFileExtension(setName) {
    // لیست ست‌هایی که png هستند
    const pngSets = [
      "3d_chesskid",
      "3d_plastic",
      "3d_staunton",
      "3d_wood",
      "8_bit",
      "bases",
      "blindfold",
      "book",
      "bubblegum",
      "cases",
      "classic",
      "club",
      "condal",
      "dash",
      "game_room",
      "glass",
      "gothic",
      "graffiti",
      "icy_sea",
      "light",
      "lolz",
      "marble",
      "maya",
      "metal",
      "modern",
      "nature",
      "neo",
      "neon",
      "neo_wood",
      "newspaper",
      "ocean",
      "sky",
      "space",
      "tigers",
      "tournament",
      "vintage",
      "wood",
      "forest",
    ];

    return pngSets.includes(setName) ? "png" : "svg";
  }

  // ============================================
  // 📥 بارگذاری تصاویر مهره‌ها
  // ============================================
  function loadPieceImages(setName, callback) {
    const ext = getPieceFileExtension(setName);
    const pieces = [
      "wK",
      "wQ",
      "wR",
      "wB",
      "wN",
      "wP",
      "bK",
      "bQ",
      "bR",
      "bB",
      "bN",
      "bP",
    ];
    const images = {};
    let loaded = 0;

    pieces.forEach((key) => {
      const img = new Image();
      const color = key[0];
      const type = key[1];
      const fileName = `${color}${type}.${ext}`;
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded === pieces.length && callback) callback(images);
      };
      img.src = `pieces/${setName}/${fileName}`;
      images[key] = img;
    });
  }

  // ============================================
  // 💾 توابع اصلی
  // ============================================
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

  // ============================================
  // 🔧 ساخت دکمه‌های مهره با دسته‌بندی
  // ============================================
  function buildPieceSetButtons() {
    const container = document.getElementById("pieceSetsContainer");
    if (!container) return;

    const currentSet = loadSettings().pieceSet || "cburnett";
    container.innerHTML = "";

    // دسته‌بندی
    const categories = {
      "سه بعدی": ["3d_chesskid", "3d_plastic", "3d_staunton", "3d_wood"],
      کلاسیک: [
        "alpha",
        "bases",
        "cburnett",
        "classic",
        "club",
        "condal",
        "governor",
        "merida",
        "staunty",
        "tatiana",
      ],
      کارتونی: ["8_bit", "bubblegum", "graffiti", "lolz", "tigers"],
      طبیعت: [
        "forest",
        "icy_sea",
        "nature",
        "neo_wood",
        "ocean",
        "sky",
        "wood",
      ],
      مدرن: ["glass", "light", "marble", "metal", "modern", "neo", "neon"],
      خاص: [
        "blindfold",
        "book",
        "cases",
        "dash",
        "game_room",
        "gothic",
        "maya",
        "newspaper",
        "space",
        "tournament",
        "vintage",
      ],
    };

    Object.keys(categories).forEach((catName) => {
      const catDiv = document.createElement("div");
      catDiv.style.cssText = "width:100%; margin-bottom:4px;";

      const catLabel = document.createElement("span");
      catLabel.textContent = catName;
      catLabel.style.cssText =
        "font-size:0.55rem; color:#8a9aaa; display:block; margin-bottom:2px; font-weight:600;";
      catDiv.appendChild(catLabel);

      const btnContainer = document.createElement("div");
      btnContainer.style.cssText = "display:flex; flex-wrap:wrap; gap:4px;";

      categories[catName].forEach((setName) => {
        const info = pieceSets.find((p) => p.name === setName);
        const btn = document.createElement("button");
        btn.className = `piece-set-btn ${setName === currentSet ? "active" : ""}`;
        btn.dataset.set = setName;
        btn.textContent = info ? info.emoji + " " + info.label : setName;
        btn.title = setName;
        btn.style.cssText = `
          padding: 3px 8px;
          border-radius: 30px;
          border: 1.5px solid ${setName === currentSet ? "#2c7da0" : "#dde4ec"};
          background: ${setName === currentSet ? "#2c7da0" : "white"};
          color: ${setName === currentSet ? "white" : "#1a2a3a"};
          font-size: 0.55rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Vazir', sans-serif;
          white-space: nowrap;
        `;
        btn.onmouseover = () => {
          if (setName !== currentSet) btn.style.borderColor = "#2c7da0";
        };
        btn.onmouseout = () => {
          if (setName !== currentSet) btn.style.borderColor = "#dde4ec";
        };
        btn.onclick = () => {
          changePieceSet(setName);
        };
        btnContainer.appendChild(btn);
      });

      catDiv.appendChild(btnContainer);
      container.appendChild(catDiv);
    });
  }

  // ============================================
  // 🚀 مقداردهی اولیه
  // ============================================
  function initSettings() {
    const toggleBtn = document.getElementById("settingsToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePanel();
      });
    }

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

    buildPieceSetButtons();

    const settings = loadSettings();
    applyTheme(settings.theme || "light");
  }

  // ============================================
  // 📦 صادر کردن
  // ============================================
  window.ChessSettings = {
    loadSettings,
    saveSettings,
    applyTheme,
    changePieceSet,
    toggleSound,
    togglePanel,
    loadPieceImages,
    getPieceFileExtension,
    getCurrentPieceSet: () => loadSettings().pieceSet || "cburnett",
    getCurrentTheme: () => loadSettings().theme || "light",
    isSoundEnabled: () => loadSettings().sound !== false,
    pieceSets: pieceSets,
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

function getPieceExtension() {
  if (!window.ChessSettings) return "svg";
  return window.ChessSettings.getPieceFileExtension(getCurrentPieceSet());
}



