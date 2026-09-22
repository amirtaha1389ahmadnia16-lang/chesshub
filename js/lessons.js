/* ============================================
   🎓 ChessHub | منطق صفحه‌ی دروس آموزشی
   --------------------------------------------
   - ترکیب درس‌های پایه (lessons-data.js) با
     درس‌های منتشرشده‌ی کاربران (localStorage)
   - فیلتر دسته‌بندی + جستجوی زنده
   - پنجره‌ی مطالعه (Overlay) با نویسنده و مشخصات
   - ویرایش/حذف درس‌های خودِ کاربر (نام نویسنده
     از js/author.js — window.ChessHubAuthor)
   ============================================ */
(function () {
  "use strict";

  // ---------- ثابت‌ها ----------
  const STORAGE_KEY = "chesshub_user_lessons";
  const COOP_URL = "lesson-coop.html";
  const TEAM_AUTHOR = "تیم ChessHub";

  const CATEGORY_CLASS = {
    "شروع بازی": "tag-opening",
    "وسط بازی": "tag-middlegame",
    "آخر بازی": "tag-endgame",
  };

  // ---------- عناصر DOM ----------
  const grid = document.getElementById("lessonsGridContainer");
  const searchInput = document.getElementById("searchLessonInput");
  const filterWrap = document.getElementById("categoryFilters");
  const overlay = document.getElementById("lessonOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const viewer = document.getElementById("lessonViewerContainer");
  const closeOverlayBtn = document.getElementById("closeOverlay");

  if (!grid) return;

  // ---------- وضعیت ----------
  let allLessons = [];
  let activeCat = "all";
  let searchTerm = "";

  // ---------- ابزار ----------
  function loadUserLessons() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveUserLessons(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function currentUser() {
    return (window.ChessHubAuthor && window.ChessHubAuthor.name) || "";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // روشن/تیره کردن رنگ برای گرادیان تصویر کارت
  function shadeColor(hex, percent) {
    const num = parseInt(String(hex || "#2c7da0").replace("#", ""), 16);
    if (isNaN(num)) return hex;
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((num >> 16) + Math.round(2.55 * percent));
    const g = clamp(((num >> 8) & 0x00ff) + Math.round(2.55 * percent));
    const b = clamp((num & 0x0000ff) + Math.round(2.55 * percent));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function categoryClass(cat) {
    return CATEGORY_CLASS[cat] || "tag-middlegame";
  }

  // فقط درس‌های خودِ کاربر قابل ویرایش/حذف‌اند
  function isOwn(lesson) {
    const author = currentUser();
    return !!author && !lesson.isBuiltin && lesson.author === author;
  }

  // ---------- داده ----------
  function loadAll() {
    const builtins = (window.lessons || []).map((l) =>
      Object.assign({}, l, {
        isBuiltin: true,
        author: l.author || TEAM_AUTHOR,
      })
    );
    const users = loadUserLessons().map((l) =>
      Object.assign({}, l, { isBuiltin: false })
    );
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    // درس‌های منتشرشده‌ی کاربران در بالای صفحه، سپس درس‌های پایه
    allLessons = users.concat(builtins);
  }

  // 🌍 واکشی درس‌های عمومی از سرور — هر درسی که «هر» کاربری منتشر کرده باشد
  // برای همه نمایش داده می‌شود (نه فقط مرورگر نویسنده)
  function refreshCommunity() {
    if (!window.CommunityHub) return Promise.resolve();
    return CommunityHub.fetchAll()
      .then(function (c) {
        const server = c.lessons || [];
        const serverIds = {};
        server.forEach(function (l) { serverIds[String(l.id)] = true; });
        // نسخه‌های محلیِ منتشرشده روی سرور حذف می‌شوند (بدون تکرار)
        const drafts = loadUserLessons().filter(function (l) {
          if (serverIds[String(l.id)]) return false;
          return !(l.serverId && serverIds[String(l.serverId)]);
        });
        const community = server.map(function (l) {
          return Object.assign({}, l, {
            isBuiltin: false,
            isCommunity: true,
          });
        });
        community.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        drafts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const builtins = (window.lessons || []).map((l) =>
          Object.assign({}, l, {
            isBuiltin: true,
            author: l.author || TEAM_AUTHOR,
          })
        );
        allLessons = community.concat(drafts, builtins);
        renderGrid();
      })
      .catch(function () {
        /* سرور در دسترس نیست — درس‌های محلی و پایه نمایش داده می‌شوند */
      });
  }

  // ---------- فیلتر و رندر ----------
  function getFiltered() {
    const q = searchTerm.trim();
    return allLessons.filter((lesson) => {
      const okCat = activeCat === "all" || lesson.category === activeCat;
      const haystack =
        (lesson.title || "") +
        " " +
        (lesson.description || "") +
        " " +
        (lesson.author || "");
      const okSearch = !q || haystack.indexOf(q) !== -1;
      return okCat && okSearch;
    });
  }

  function renderGrid() {
    const list = getFiltered();
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML =
        '<div class="no-result"><i class="fas fa-search"></i>هیچ درسی با این شرایط پیدا نشد؛ فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید.</div>';
      return;
    }
    list.forEach((lesson) => grid.appendChild(buildCard(lesson)));
  }

  function buildCard(lesson) {
    const card = document.createElement("article");
    card.className = "lesson-card";
    card.dataset.id = lesson.id;

    const own = isOwn(lesson);
    const gradient =
      "background: linear-gradient(135deg, " +
      (lesson.color || "#2c7da0") +
      ", " +
      shadeColor(lesson.color, -30) +
      ");";

    card.innerHTML =
      '<div class="lesson-thumb" style="' +
      gradient +
      '">' +
      '<i class="' +
      escapeHtml(lesson.thumbIcon || "fas fa-book-open") +
      '"></i>' +
      (own
        ? '<span class="lesson-own-badge"><i class="fas fa-user-check"></i> درس شما</span>'
        : lesson.isCommunity
        ? '<span class="lesson-own-badge" style="background:rgba(16,185,129,0.9)"><i class="fas fa-globe"></i> عمومی</span>'
        : "") +
      "</div>" +
      '<div class="lesson-content">' +
      '<div class="lesson-meta">' +
      '<span class="lesson-tag ' +
      categoryClass(lesson.category) +
      '">' +
      escapeHtml(lesson.category) +
      "</span>" +
      '<span class="lesson-level">' +
      escapeHtml(lesson.level) +
      "</span>" +
      "</div>" +
      '<h3 class="lesson-title">' +
      escapeHtml(lesson.title) +
      "</h3>" +
      '<p class="lesson-description">' +
      escapeHtml(lesson.description) +
      "</p>" +
      '<div class="lesson-author"><i class="fas fa-user-edit"></i> نویسنده: ' +
      escapeHtml(lesson.author || TEAM_AUTHOR) +
      "</div>" +
      '<div class="lesson-footer">' +
      '<span class="lesson-duration"><i class="far fa-clock"></i> ' +
      escapeHtml(lesson.duration) +
      "</span>" +
      '<div class="lesson-footer-left">' +
      (own
        ? '<div class="lesson-actions">' +
          '<button class="btn-act edit" title="ویرایش درس" data-act="edit"><i class="fas fa-pen"></i></button>' +
          '<button class="btn-act delete" title="حذف درس" data-act="delete"><i class="fas fa-trash-alt"></i></button>' +
          "</div>"
        : "") +
      '<button class="btn-view" data-act="view">مشاهده درس</button>' +
      "</div>" +
      "</div>" +
      "</div>";

    card.addEventListener("click", function (e) {
      const actBtn = e.target.closest("[data-act]");
      const act = actBtn ? actBtn.dataset.act : "view";
      if (act === "edit") {
        e.stopPropagation();
        editLesson(lesson);
        return;
      }
      if (act === "delete") {
        e.stopPropagation();
        deleteLesson(lesson);
        return;
      }
      openLesson(lesson);
    });

    return card;
  }

  // ---------- عملیات کاربر ----------
  function editLesson(lesson) {
    window.location.href =
      COOP_URL + "?edit=" + encodeURIComponent(lesson.id);
  }

  function deleteLesson(lesson) {
    if (!confirm("درس «" + lesson.title + "» برای همیشه حذف شود؟")) return;

    // اگر روی سرور منتشر شده، اول از سرور هم حذف شود (فقط نویسنده مجاز است)
    if (window.CommunityHub && CommunityHub.isSynced(lesson)) {
      CommunityHub.save("lessons", "delete", lesson.serverId || lesson.id, {
        author: currentUser(),
      })
        .then(function () {
          showToast("🗑 درس از سرور هم حذف شد و برای همه قابل مشاهده نیست", "success");
        })
        .catch(function (err) {
          alert("حذف از سرور ممکن نشد: " + err.message);
          return;
        });
    }

    const list = loadUserLessons().filter(
      (l) => String(l.id) !== String(lesson.id)
    );
    if (!saveUserLessons(list)) {
      alert("ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست.");
      return;
    }
    loadAll();
    renderGrid();
    refreshCommunity();
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

  // ---------- پنجره‌ی مطالعه ----------
  function openLesson(lesson) {
    const own = isOwn(lesson);

    overlayTitle.innerHTML =
      '<i class="fas fa-graduation-cap"></i> ' + escapeHtml(lesson.title);

    viewer.innerHTML =
      '<span class="tag" style="background:' +
      (lesson.color || "#2c7da0") +
      '">' +
      escapeHtml(lesson.category) +
      "</span>" +
      "<h3>" +
      escapeHtml(lesson.title) +
      "</h3>" +
      '<div class="viewer-meta">' +
      '<span class="vm-author"><i class="fas fa-user-edit"></i> نویسنده: ' +
      escapeHtml(lesson.author || TEAM_AUTHOR) +
      "</span>" +
      "<span><i class=\"fas fa-signal\"></i> سطح: " +
      escapeHtml(lesson.level) +
      "</span>" +
      "<span><i class=\"far fa-clock\"></i> " +
      escapeHtml(lesson.duration) +
      "</span>" +
      "</div>" +
      (own
        ? '<div class="viewer-actions">' +
          '<button class="viewer-edit-btn" id="viewerEditBtn"><i class="fas fa-pen"></i> ویرایش این درس</button>' +
          '<button class="viewer-del-btn" id="viewerDeleteBtn"><i class="fas fa-trash-alt"></i> حذف درس</button>' +
          "</div>"
        : "") +
      // محتوای درس HTML غنی ساخته‌شده با ویرایشگر است و عمداً بدون فرار رندر می‌شود
      '<div class="lesson-body">' +
      (lesson.content || "") +
      "</div>" +
      '<button class="close-modal-btn" id="viewerCloseBtn">بستن درس</button>';

    const editBtn = document.getElementById("viewerEditBtn");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        closeLesson();
        editLesson(lesson);
      });
    }
    const delBtn = document.getElementById("viewerDeleteBtn");
    if (delBtn) {
      delBtn.addEventListener("click", function () {
        closeLesson();
        deleteLesson(lesson);
      });
    }
    document
      .getElementById("viewerCloseBtn")
      .addEventListener("click", closeLesson);

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    overlay.scrollTop = 0;
  }

  function closeLesson() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  // ---------- رویدادها ----------
  filterWrap.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    filterWrap
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeCat = chip.dataset.cat || "all";
    renderGrid();
  });

  searchInput.addEventListener("input", function () {
    searchTerm = searchInput.value;
    renderGrid();
  });

  closeOverlayBtn.addEventListener("click", closeLesson);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      closeLesson();
    }
  });

  // هم‌گام‌سازی خودکار اگر در تب دیگری درسی منتشر/ویرایش شود
  window.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY) {
      loadAll();
      renderGrid();
    }
  });

  // ---------- شروع ----------
  loadAll();
  renderGrid();
  refreshCommunity();
})();
