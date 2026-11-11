// openings.js – دانشنامه گشایش‌ها (همراه با تخته و نمایش تعاملی)
// ------------------------------------------------------------
// نسخه حرفه‌ای:
//   - ادغام خودکار گشایش‌های منتشرشده‌ی کاربران (بخش همکاری)
//     با دیتابیس اصلی data/openings.json — هر گشایش بر اساس
//     کد دسته‌بندی (e4/d4/c4/Nf3/سایر) سر جای خودش قرار می‌گیرد
//   - نشان «نویسنده» برای گشایش‌های همکاری + دکمه ویرایش/حذف
//     فقط برای گشایش‌های خودِ کاربر (نام از js/author.js)
//   - چیپ‌های فیلتر به‌صورت خودکار از روی دیتای واقعی ساخته می‌شوند
//   - هم‌گام‌سازی بین تب‌ها با رویداد storage

(function () {
  "use strict";

  // ============================================
  // 📦 استفاده از ChessUtils (در صورت وجود)
  // ============================================
  const { pieceCodes, getCurrentPieceSet, loadPieces, getBoardColors } =
    window.ChessUtilsBound || {
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
      getCurrentPieceSet: function () {
        try {
          const s = JSON.parse(localStorage.getItem("chesshub_settings"));
          return s?.pieceSet || "neo";
        } catch {
          return "neo";
        }
      },
      loadPieces: function () {
        return Promise.resolve();
      },
      getBoardColors: function () {
        // تم‌ها روی body تعریف می‌شوند (body.theme-X) — نه روی html
        const host = document.body || document.documentElement;
        const light =
          getComputedStyle(host).getPropertyValue("--board-light").trim() ||
          "#f0d9b5";
        const dark =
          getComputedStyle(host).getPropertyValue("--board-dark").trim() ||
          "#b58863";
        return { light, dark };
      },
    };

  // ============================================
  // 🗝️ ثابت‌های بخش همکاری
  // ============================================
  const USER_OPENINGS_KEY = "chesshub_user_openings";
  const COOP_URL = "opening-coop.html";
  const SHORT_LABELS = {
    e4: "پیاده شاه",
    d4: "پیاده وزیر",
    c4: "انگلیسی",
    Nf3: "ریتی",
    other: "سایر",
  };

  // ============================================
  // 📦 متغیرها
  // ============================================
  let openingsData = { categories: [] };
  let baseLoadFailed = false;
  let currentFilter = "all";
  let viewStack = [];
  let currentMoveIndex = 0;
  let autoInterval = null;
  let piecesLoaded = false;
  let pieceImages = {};

  const overlay = document.getElementById("mainOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayContent = document.getElementById("overlayContent");
  const backBtn = document.getElementById("backBtn");
  const searchInput = document.getElementById("searchInput");
  const filterWrap = document.getElementById("filterChips");

  // ---------- ابزار ----------
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function currentUser() {
    return (window.ChessHubAuthor && window.ChessHubAuthor.name) || "";
  }

  // ============================================
  // 🖼️ بارگذاری مهره‌ها
  // ============================================
  function loadPiecesLocal(force) {
    if (piecesLoaded && !force) return Promise.resolve();
    return new Promise((resolve) => {
      const set = getCurrentPieceSet();
      let loaded = 0,
        total = Object.keys(pieceCodes).length;
      pieceImages = {};
      for (const [key, filename] of Object.entries(pieceCodes)) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) {
            piecesLoaded = true;
            resolve();
          }
        };
        img.src = `pieces/${set}/${filename}`;
        pieceImages[key] = img;
      }
    });
  }

  // ============================================
  // 👥 گشایش‌های کاربران (بخش همکاری)
  // ============================================
  function loadUserOpenings() {
    try {
      const list = JSON.parse(
        localStorage.getItem(USER_OPENINGS_KEY) || "[]"
      );
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  // 🌍 گشایش‌های عمومی واکشی‌شده از سرور — ساخته‌ی هر کاربر برای همه نمایش داده می‌شود
  let communityOpenings = [];

  function refreshCommunity() {
    if (!window.CommunityHub) return Promise.resolve();
    return CommunityHub.fetchAll()
      .then(function (c) {
        communityOpenings = (c.openings || []).slice();
        renderList();
      })
      .catch(function () {
        /* سرور در دسترس نیست — فقط محلی/پایه */
      });
  }

  // سیستم جایگذاری خودکار: هر گشایش کاربر بر اساس کد دسته‌بندی
  // داخل دسته‌ی همان کد از دیتابیس اصلی می‌نشیند؛ اگر دسته وجود
  // نداشته باشد، دسته‌ی جدید به‌صورت خودکار ساخته می‌شود.
  // گشایش‌های کاربر (جدیدترین اول) بالای دسته‌ی خودشان نمایش داده می‌شوند.
  function mergeAllCategories() {
    // گشایش‌های عمومی سرور + پیش‌نویس‌های محلیِ هنوزمنتشرنشده (بدون تکرار)
    const serverIds = {};
    communityOpenings.forEach(function (o) {
      serverIds[String(o.id)] = true;
    });
    const drafts = loadUserOpenings().filter(function (o) {
      if (!o || !o.name) return false;
      if (serverIds[String(o.id)]) return false;
      return !(o.serverId && serverIds[String(o.serverId)]);
    });
    const users = communityOpenings
      .concat(drafts)
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const cats = (openingsData.categories || []).map((c) => ({
      name: c.name,
      code: c.code,
      openings: (c.openings || []).slice(),
    }));

    // ساخت دسته‌های جدید برای کدهایی که در دیتابیس اصلی نیستند
    users.forEach((op) => {
      const exists = cats.some((c) => c.code === op.categoryCode);
      if (!exists) {
        cats.push({
          name:
            op.categoryName ||
            SHORT_LABELS[op.categoryCode] ||
            "سایر گشایش‌ها",
          code: op.categoryCode || "other",
          openings: [],
        });
      }
    });

    // درج گشایش‌های کاربر بالای دسته‌ی خودشان (جدیدترین = بالاترین)
    users
      .slice()
      .reverse()
      .forEach((op) => {
        const cat = cats.find((c) => c.code === op.categoryCode);
        cat.openings.unshift(Object.assign({}, op, { isUser: true }));
      });

    return cats;
  }

  // ============================================
  // 📥 بارگذاری داده‌ها
  // ============================================
  async function loadOpeningsJSON() {
    baseLoadFailed = false;
    try {
      const res = await fetch("data/openings.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !Array.isArray(data.categories))
        throw new Error("ساختار فایل داده معتبر نیست");
      openingsData = data;
    } catch (err) {
      console.error(err);
      baseLoadFailed = true;
      openingsData = { categories: [] };
    }
    renderList();
  }

  // ============================================
  // 🎨 چیپ‌های فیلتر (خودکار از روی دیتای واقعی)
  // ============================================
  function renderChips(categories) {
    if (!filterWrap) return;
    let html =
      '<button class="chip' +
      (currentFilter === "all" ? " active" : "") +
      '" data-filter="all">همه</button>';
    categories.forEach((cat) => {
      const label = SHORT_LABELS[cat.code] || cat.name || cat.code;
      html +=
        '<button class="chip' +
        (currentFilter === cat.code ? " active" : "") +
        '" data-filter="' +
        escapeHtml(cat.code) +
        '">' +
        escapeHtml(label) +
        "</button>";
    });
    filterWrap.innerHTML = html;
  }

  // ============================================
  // 🎨 رندر لیست گشایش‌ها
  // ============================================
  function renderList() {
    const container = document.getElementById("openingsList");
    if (!container) return;

    let categories = mergeAllCategories();
    renderChips(categories);

    const query = (searchInput && searchInput.value ? searchInput.value : "")
      .trim()
      .toLowerCase();

    if (currentFilter !== "all") {
      categories = categories.filter((c) => c.code === currentFilter);
    }
    if (query) {
      categories = categories
        .map((cat) => ({
          ...cat,
          openings: cat.openings.filter((op) => {
            const hay = [
              op.name || "",
              op.author || "",
              (op.moves || []).join(" "),
              (op.variants || []).map((v) => v.name || "").join(" "),
            ]
              .join(" ")
              .toLowerCase();
            return hay.indexOf(query) !== -1;
          }),
        }))
        .filter((cat) => cat.openings.length > 0);
    }

    let html = "";
    if (baseLoadFailed) {
      html +=
        '<div class="data-warning"><i class="fas fa-exclamation-triangle"></i> دیتابیس اصلی گشایش‌ها (data/openings.json) بارگذاری نشد؛ لطفاً فایل داده را بررسی کنید.</div>';
    }

    if (!categories.length) {
      container.innerHTML =
        html +
        '<div class="no-result"><i class="fas fa-search"></i> گشایشی با این مشخصات یافت نشد.</div>';
      return;
    }

    container.innerHTML = html;
    categories.forEach((cat) => {
      cat.openings.forEach((opening) =>
        container.appendChild(buildCard(opening))
      );
    });
  }

  // ============================================
  // 🃏 ساخت کارت گشایش
  // ============================================
  function buildCard(opening) {
    const card = document.createElement("div");
    card.className = "opening-card";
    const movesDisplay =
      opening.moves && opening.moves.length ? opening.moves.join(" ") : "...";

    const authorBadge =
      opening.isUser && opening.author
        ? '<span class="author-badge" title="نویسنده‌ی این گشایش"><i class="fas fa-pen-nib"></i> ' +
          escapeHtml(opening.author) +
          "</span>"
        : "";

    // ✏️ دکمه‌های ویرایش/حذف فقط برای نویسنده‌ی همان گشایش —
    // گشایش‌های عمومیِ بقیه فقط خواندنی‌اند
    const canManage =
      opening.isUser && currentUser() && opening.author === currentUser();
    const userActions = canManage
      ? '<span class="card-actions">' +
        '<button class="card-action-btn edit" data-act="edit" title="ویرایش این گشایش"><i class="fas fa-edit"></i></button>' +
        '<button class="card-action-btn del" data-act="delete" title="حذف این گشایش"><i class="fas fa-trash-alt"></i></button>' +
        "</span>"
      : "";

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          <i class="fas fa-chess-queen"></i>
          <span>${escapeHtml(opening.name)}</span>
        </div>
        <span class="card-moves" dir="ltr">${escapeHtml(movesDisplay)}</span>
        ${authorBadge}
        ${userActions}
        <i class="fas fa-chevron-down chevron"></i>
      </div>
      <div class="card-body">
        ${
          opening.variants && opening.variants.length
            ? `
          <div class="variants-grid">
            ${opening.variants
              .map(
                (v) => `
              <div class="variant-item" data-name="${escapeHtml(v.name)}">
                <span><i class="fas fa-code-branch"></i> ${escapeHtml(v.name)}</span>
                <span class="variant-moves-preview" dir="ltr">${escapeHtml(
                  (v.moves || []).slice(0, 2).join(" ")
                )}..</span>
              </div>
            `
              )
              .join("")}
          </div>
        `
            : '<div style="padding:1rem;color:#5f7f9e;"><i class="fas fa-info-circle"></i> بدون واریانت</div>'
        }
      </div>
    `;

    const header = card.querySelector(".card-header");
    const body = card.querySelector(".card-body");
    const chevron = header.querySelector(".chevron");

    header.addEventListener("click", function (e) {
      if (e.target.closest(".variant-item")) return;
      if (e.target.closest(".card-action-btn")) return;
      const isOpen = body.classList.toggle("open");
      chevron.classList.toggle("open");
      header.classList.toggle("expanded", isOpen);
    });

    card.querySelectorAll(".variant-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const variant = (opening.variants || []).find(
          (v) => v.name === item.dataset.name
        );
        if (variant)
          openVariantView(variant, opening.name, opening.author);
      });
    });

    const editBtn = card.querySelector('.card-action-btn[data-act="edit"]');
    if (editBtn) {
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href =
          COOP_URL + "?edit=" + encodeURIComponent(opening.id);
      });
    }

    const delBtn = card.querySelector('.card-action-btn[data-act="delete"]');
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteUserOpening(opening);
      });
    }

    return card;
  }

  function deleteUserOpening(opening) {
    if (
      !confirm(
        'گشایش «' + opening.name + "» برای همیشه حذف شود؟ این عمل قابل بازگشت نیست."
      )
    )
      return;

    // اگر روی سرور منتشر شده، از سرور هم حذف شود (فقط نویسنده)
    if (window.CommunityHub && CommunityHub.isSynced(opening)) {
      CommunityHub.save("openings", "delete", opening.serverId || opening.id, {
        author: currentUser(),
      })
        .then(function () {
          showToast("🗑 گشایش از سرور هم حذف شد", "success");
        })
        .catch(function (err) {
          alert("حذف از سرور ممکن نشد: " + err.message);
          return;
        });
    }

    const list = loadUserOpenings().filter(
      (o) => String(o.id) !== String(opening.id)
    );
    try {
      localStorage.setItem(USER_OPENINGS_KEY, JSON.stringify(list));
    } catch (e) {
      alert("ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست.");
      return;
    }
    communityOpenings = communityOpenings.filter(
      (o) => String(o.id) !== String(opening.id)
    );
    renderList();
  }

  function showToast(msg, kind) {
    let el = document.querySelector(".settings-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "settings-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  // ============================================
  // 🎮 Overlay و نمایش جزئیات (ناوبری چندلایه)
  // ============================================
  function pushView(view) {
    viewStack.push(view);
    renderCurrentView();
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function popView() {
    if (viewStack.length > 1) {
      viewStack.pop();
      renderCurrentView();
    } else {
      viewStack = [];
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      stopAutoPlay();
    }
  }

  function renderCurrentView() {
    if (viewStack.length === 0) return;
    const current = viewStack[viewStack.length - 1];
    stopAutoPlay();
    overlayTitle.innerHTML =
      '<i class="fas fa-chess-queen"></i> ' + escapeHtml(current.title);
    overlayContent.innerHTML = current.html;
    overlayContent.scrollTop = 0;

    if (current.type === "variant") {
      setupBoard("variantBoard", current.variant.moves || []);
      setTimeout(() => drawPieChart(current.variant.stats), 100);
    } else if (current.type === "game") {
      setupBoard("gameBoard", current._moves || []);
    } else if (current.type === "trap") {
      setupBoard("trapBoard", current.trap.moves || []);
    }
  }

  backBtn.addEventListener("click", popView);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") popView();
  });

  // ============================================
  // 🖼️ تخته و کنترل‌های پخش
  // ============================================
  function renderBoardDOM(containerId, moves, moveIndex) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const game = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      try {
        game.move(moves[i], { sloppy: true });
      } catch (e) {
        break;
      }
    }
    const board = game.board();
    const colors = getBoardColors();
    const pieceSet = getCurrentPieceSet();

    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(8, 1fr)";
    container.style.aspectRatio = "1 / 1";

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        const isLight = (i + j) % 2 === 0;
        const sq = document.createElement("div");
        sq.className = `square ${isLight ? "light" : "dark"}`;
        if (piece) {
          const key =
            (piece.color === "w" ? "w" : "b") + piece.type.toLowerCase();
          const img = document.createElement("img");
          img.src = `pieces/${pieceSet}/${pieceCodes[key]}`;
          img.classList.add("piece-img");
          img.draggable = false;
          img.style.pointerEvents = "none";
          sq.appendChild(img);
        }
        container.appendChild(sq);
      }
    }
  }

  function setupBoard(boardId, moves) {
    currentMoveIndex = 0;
    const total = moves.length;
    const counter = document.getElementById("moveCounter");
    if (counter) counter.textContent = `0/${Math.ceil(total / 2)}`;

    const update = () => {
      renderBoardDOM(boardId, moves, currentMoveIndex);
      if (counter)
        counter.textContent = `${Math.ceil(currentMoveIndex / 2)}/${Math.ceil(
          total / 2
        )}`;
    };

    window._first = () => {
      stopAutoPlay();
      currentMoveIndex = 0;
      update();
    };
    window._prev = () => {
      stopAutoPlay();
      if (currentMoveIndex > 0) currentMoveIndex--;
      update();
    };
    window._next = () => {
      stopAutoPlay();
      if (currentMoveIndex < total) currentMoveIndex++;
      update();
    };
    window._last = () => {
      stopAutoPlay();
      currentMoveIndex = total;
      update();
    };
    window._toggle = () => {
      const btn = document.getElementById("playPauseBtn");
      if (autoInterval) {
        stopAutoPlay();
        if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
      } else {
        if (btn) btn.innerHTML = '<i class="fas fa-pause"></i> توقف';
        autoInterval = setInterval(() => {
          if (currentMoveIndex < total) {
            currentMoveIndex++;
            update();
          } else {
            stopAutoPlay();
            if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
          }
        }, 1200);
      }
    };
    update();
  }

  function stopAutoPlay() {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.innerHTML = '<i class="fas fa-play"></i> شروع';
  }

  // ============================================
  // 🥧 نمودار دایره‌ای
  // ============================================
  function drawPieChart(stats) {
    const canvas = document.getElementById("pieChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    stats = stats || { whiteWins: 0, blackWins: 0, draws: 0 };
    const total = stats.whiteWins + stats.blackWins + stats.draws;
    if (total === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px Vazir";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("داده‌ای موجود نیست", w / 2, h / 2);
      return;
    }
    const data = [
      { value: stats.whiteWins, color: "#e2e8f0" },
      { value: stats.blackWins, color: "#1e293b" },
      { value: stats.draws, color: "#64748b" },
    ];
    let startAngle = -Math.PI / 2;
    const cx = w / 2,
      cy = h / 2,
      r = Math.min(w, h) / 2 - 4;
    data.forEach((slice) => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += sliceAngle;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 14px Vazir";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${total}`, cx, cy);
  }

  // ============================================
  // 📂 باز کردن Viewها
  // ============================================
  function openVariantView(variant, openingName, author) {
    const stats = variant.stats || { whiteWins: 0, blackWins: 0, draws: 0 };
    const authorCredit = author
      ? '<div class="author-credit"><i class="fas fa-pen-nib"></i> تحلیل و انتشار توسط: <strong>' +
        escapeHtml(author) +
        "</strong></div>"
      : "";

    const view = {
      type: "variant",
      title: `${openingName} – ${variant.name}`,
      variant: variant,
      _moves: variant.moves || [],
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="variantBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="pie-section">
              <canvas id="pieChart" width="100" height="100"></canvas>
              <div class="legend">
                <span><span class="dot" style="background:#e2e8f0;"></span> برد سفید: ${stats.whiteWins}%</span>
                <span><span class="dot" style="background:#1e293b;"></span> برد سیاه: ${stats.blackWins}%</span>
                <span><span class="dot" style="background:#64748b;"></span> مساوی: ${stats.draws}%</span>
              </div>
            </div>
            <div class="info-card"><h4><i class="fas fa-check-circle" style="color:#166534;"></i> نقاط قوت</h4><ul class="info-list">${(variant.strengths || []).map((s) => `<li><i class="fas fa-check-circle" style="color:#166534;"></i> ${escapeHtml(s)}</li>`).join("")}</ul></div>
            <div class="info-card"><h4><i class="fas fa-exclamation-triangle" style="color:#991b1b;"></i> نقاط ضعف</h4><ul class="info-list">${(variant.weaknesses || []).map((w) => `<li><i class="fas fa-times-circle" style="color:#991b1b;"></i> ${escapeHtml(w)}</li>`).join("")}</ul></div>
            <div class="info-card"><h4><i class="fas fa-exchange-alt"></i> حرکات پرتکرار</h4>${(variant.popularMoves || []).map((pm) => `<div class="popular-move"><span>${escapeHtml(pm.san)}${pm.description ? " – " + escapeHtml(pm.description) : ""}</span><span class="move-san">${escapeHtml((pm.moves || []).join(" "))}</span></div>`).join("") || '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> حرکتی ثبت نشده است.</p>'}</div>
            <div class="info-card"><h4><i class="fas fa-balance-scale"></i> ارزیابی پوزیسیون</h4><p>${escapeHtml(variant.evaluation?.summary || "ارزیابی موجود نیست")} <strong>(${escapeHtml(variant.evaluation?.score || "0.0")})</strong></p></div>
            <div class="info-card"><h4><i class="fas fa-lightbulb"></i> ایده‌ها و طرح‌ها</h4><ul class="info-list">${(variant.ideas || []).map((i) => `<li><i class="fas fa-lightbulb"></i> ${escapeHtml(i)}</li>`).join("") || "<li>طرحی ثبت نشده است.</li>"}</ul></div>
            <div class="info-card"><h4><i class="fas fa-flag-checkered"></i> آخر بازی‌های احتمالی</h4><ul class="info-list">${(variant.endgames || []).map((e) => `<li><i class="fas fa-flag-checkered"></i> ${escapeHtml(e)}</li>`).join("") || "<li>آخر بازی ثبت نشده است.</li>"}</ul></div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button class="btn-sm primary" onclick="window._openGamesList()"><i class="fas fa-list"></i> نمونه بازی‌ها (${(variant.sampleGames || []).length})</button>
              <button class="btn-sm primary" onclick="window._openTrapsList()"><i class="fas fa-fish"></i> تله‌ها (${(variant.traps || []).length})</button>
              <button class="btn-sm" onclick="window._downloadVariant()"><i class="fas fa-download"></i> دانلود تحلیل</button>
            </div>
            ${authorCredit}
          </div>
        </div>
      `,
    };
    pushView(view);

    window._openGamesList = () =>
      openGamesListView(
        variant.sampleGames || [],
        `${openingName} – ${variant.name}`
      );
    window._openTrapsList = () =>
      openTrapsListView(
        variant.traps || [],
        `${openingName} – ${variant.name}`
      );
    window._downloadVariant = () => {
      try {
        const payload = { opening: openingName, variant: variant };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analysis_${String(variant.name).replace(
          /\s+/g,
          "_"
        )}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
      }
    };
  }

  function openGamesListView(games, parentTitle) {
    const view = {
      type: "gamesList",
      title: `نمونه بازی‌های ${parentTitle}`,
      html: `
        <div class="info-card" style="max-width:600px; margin:0 auto;">
          ${
            games.length === 0
              ? '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> نمونه بازی‌ای ثبت نشده است.</p>'
              : ""
          }
          ${games
            .map(
              (g, i) => `
            <div class="game-item" onclick="window._openGameView(${i})">
              <span><i class="fas fa-chess-king"></i> ${escapeHtml(g.white)} vs ${escapeHtml(g.black)} (${escapeHtml(g.year || "")}) – ${escapeHtml(g.result || "")}</span>
              <i class="fas fa-chevron-left"></i>
            </div>
          `
            )
            .join("")}
        </div>
      `,
    };
    pushView(view);
    window._openGameView = (idx) => openGameView(games[idx], parentTitle);
  }

  function openGameView(game, parentTitle) {
    let moves = [];
    try {
      const g = new Chess();
      if (game.pgn && g.load_pgn(game.pgn)) moves = g.history();
    } catch (e) {
      console.error(e);
    }

    const view = {
      type: "game",
      title: `${game.white} vs ${game.black}`,
      _moves: moves,
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="gameBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="info-card">
              <p><i class="fas fa-user"></i> سفید: ${escapeHtml(game.white)} | <i class="fas fa-user"></i> سیاه: ${escapeHtml(game.black)}</p>
              <p><i class="fas fa-calendar"></i> سال: ${escapeHtml(game.year || "—")} | <i class="fas fa-flag"></i> نتیجه: ${escapeHtml(game.result || "—")}</p>
            </div>
          </div>
        </div>
      `,
    };
    pushView(view);
  }

  function openTrapsListView(traps, parentTitle) {
    const view = {
      type: "trapsList",
      title: `تله‌های ${parentTitle}`,
      html: `
        <div class="info-card" style="max-width:600px; margin:0 auto;">
          ${
            traps.length === 0
              ? '<p style="color:#5f7f9e;"><i class="fas fa-info-circle"></i> تله‌ای ثبت نشده است.</p>'
              : ""
          }
          ${traps
            .map(
              (t, i) => `
            <div class="trap-item" onclick="window._openTrapView(${i})">
              <span><i class="fas fa-skull"></i> ${escapeHtml(t.name || "تله " + (i + 1))}</span>
              <i class="fas fa-chevron-left"></i>
            </div>
          `
            )
            .join("")}
        </div>
      `,
    };
    pushView(view);
    window._openTrapView = (idx) => openTrapView(traps[idx], parentTitle);
  }

  function openTrapView(trap, parentTitle) {
    const view = {
      type: "trap",
      title: trap.name || "تله",
      trap: trap,
      _moves: trap.moves || [],
      html: `
        <div class="viewer-body">
          <div class="board-wrapper">
            <div id="trapBoard" class="chessboard"></div>
            <div class="control-buttons">
              <button class="btn-sm" onclick="window._first()"><i class="fas fa-fast-backward"></i></button>
              <button class="btn-sm" onclick="window._prev()"><i class="fas fa-step-backward"></i></button>
              <button class="btn-sm primary" id="playPauseBtn" onclick="window._toggle()"><i class="fas fa-play"></i> شروع</button>
              <button class="btn-sm" onclick="window._next()"><i class="fas fa-step-forward"></i></button>
              <button class="btn-sm" onclick="window._last()"><i class="fas fa-fast-forward"></i></button>
              <span class="move-counter" id="moveCounter">0/0</span>
            </div>
          </div>
          <div class="info-wrapper">
            <div class="info-card">
              <p><i class="fas fa-info-circle"></i> توضیح: ${escapeHtml(trap.description || "توضیحی ثبت نشده است.")}</p>
            </div>
          </div>
        </div>
      `,
    };
    pushView(view);
  }

  // ============================================
  // 🎛️ رویدادهای جستجو و فیلتر
  // ============================================
  if (searchInput) {
    searchInput.addEventListener("input", renderList);
  }

  if (filterWrap) {
    filterWrap.addEventListener("click", function (e) {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      filterWrap
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter || "all";
      renderList();
    });
  }

  // هم‌گام‌سازی خودکار اگر در تب دیگری گشایشی منتشر/ویرایش شود
  window.addEventListener("storage", function (e) {
    if (e.key === USER_OPENINGS_KEY) renderList();
  });

  // ============================================
  // 🔄 به‌روزرسانی تخته هنگام تغییر تم یا مهره‌ها
  // ============================================
  function refreshCurrentBoard() {
    if (!overlay.classList.contains("open") || viewStack.length === 0) return;
    const current = viewStack[viewStack.length - 1];
    if (["variant", "game", "trap"].indexOf(current.type) === -1) return;
    const boardId = current.type + "Board";
    if (document.getElementById(boardId)) {
      renderBoardDOM(boardId, current._moves || [], currentMoveIndex || 0);
    }
  }

  document.addEventListener("themeChanged", refreshCurrentBoard);
  document.addEventListener("pieceSetChanged", function () {
    piecesLoaded = false;
    loadPiecesLocal().then(refreshCurrentBoard);
  });

  // ============================================
  // 🚀 راه‌اندازی
  // ============================================
  loadPiecesLocal().then(() => {
    loadOpeningsJSON();
    refreshCommunity(); // 🌍 گشایش‌های عمومی همه‌ی کاربران
    console.log("✅ ChessHub Openings loaded successfully");
  });
})();
