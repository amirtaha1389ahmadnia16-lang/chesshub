// lessons.js - مدیریت صفحه دروس

(function () {
  "use strict";

  // ============================================
  // 🎨 اعمال تم
  // ============================================
  (function applySavedTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (settings && settings.theme) {
        document.body.className = document.body.className
          .split(" ")
          .filter((cls) => !cls.startsWith("theme-"))
          .join(" ");
        document.body.classList.add(`theme-${settings.theme}`);
      }
    } catch (e) {}
  })();

  // ============================================
  // 📦 متغیرها
  // ============================================
  let currentCategory = "all";
  let searchText = "";

  const gridContainer = document.getElementById("lessonsGridContainer");
  const overlay = document.getElementById("lessonOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const viewerContainer = document.getElementById("lessonViewerContainer");
  const closeBtn = document.getElementById("closeOverlay");

  const categoryColors = {
    "شروع بازی": "#38a169", // سبز
    "وسط بازی": "#3182ce", // آبی
    "آخر بازی": "#805ad5", // بنفش
  };

  const categoryClasses = {
    "شروع بازی": "tag-opening",
    "وسط بازی": "tag-middlegame",
    "آخر بازی": "tag-endgame",
  };

  // ============================================
  // 📂 باز کردن درس در Overlay
  // ============================================
  function openLesson(lesson) {
    if (!lesson) return;
    overlayTitle.innerHTML = `<i class="fas fa-graduation-cap"></i> ${lesson.title}`;
    const color = categoryColors[lesson.category] || "#2c3e50";

    viewerContainer.innerHTML = `
      <div class="lesson-viewer">
        <h3>${lesson.title}</h3>
        <div class="tag" style="background:${color}">${lesson.category} – ${lesson.level}</div>
        ${lesson.content}
        <button class="close-modal-btn" id="closeLessonBtn">✖ بستن درس</button>
      </div>
    `;

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    document
      .getElementById("closeLessonBtn")
      .addEventListener("click", closeLessonOverlay);
  }

  // ============================================
  // ❌ بستن Overlay
  // ============================================
  function closeLessonOverlay() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  // ============================================
  // 🎨 رندر کردن دروس
  // ============================================
  function renderLessons() {
    const lessonsData = window.lessons || [];
    let filtered = lessonsData.filter((l) => {
      if (currentCategory !== "all" && l.category !== currentCategory)
        return false;
      if (
        searchText &&
        !l.title.includes(searchText) &&
        !l.description.includes(searchText)
      )
        return false;
      return true;
    });

    if (filtered.length === 0) {
      gridContainer.innerHTML = `<div class="no-result">درسی با این مشخصات پیدا نشد.</div>`;
      return;
    }

    gridContainer.innerHTML = "";

    filtered.forEach((lesson) => {
      const color = categoryColors[lesson.category] || "#2c3e50";
      const cls = categoryClasses[lesson.category] || "";

      const card = document.createElement("div");
      card.className = "lesson-card";
      card.innerHTML = `
        <div class="lesson-thumb" style="background:linear-gradient(135deg, ${color}, ${color}cc)">
          <i class="${lesson.thumbIcon}"></i>
        </div>
        <div class="lesson-content">
          <div class="lesson-meta">
            <span class="lesson-tag ${cls}">${lesson.category}</span>
            <span class="lesson-level">${lesson.level}</span>
          </div>
          <div class="lesson-title">${lesson.title}</div>
          <p class="lesson-description">${lesson.description}</p>
          <div class="lesson-footer">
            <span class="lesson-duration"><i class="far fa-clock"></i> ${lesson.duration}</span>
            <button class="btn-view" data-id="${lesson.id}">مشاهده</button>
          </div>
        </div>
      `;
      gridContainer.appendChild(card);
    });

    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const lesson = window.lessons.find((l) => l.id == this.dataset.id);
        if (lesson) openLesson(lesson);
      });
    });

    document.querySelectorAll(".lesson-card").forEach((card) => {
      card.addEventListener("click", function () {
        const btn = this.querySelector(".btn-view");
        if (btn) btn.click();
      });
    });
  }

  // ============================================
  // 🎛️ راه‌اندازی فیلترها
  // ============================================
  function setupFilters() {
    const setActive = (container, activeBtn) => {
      container
        .querySelectorAll(".chip")
        .forEach((b) => b.classList.remove("active"));
      activeBtn.classList.add("active");
    };

    document.querySelectorAll("#categoryFilters .chip").forEach((btn) => {
      btn.addEventListener("click", function () {
        setActive(document.getElementById("categoryFilters"), this);
        currentCategory = this.dataset.cat;
        renderLessons();
      });
    });

    document
      .getElementById("searchLessonInput")
      .addEventListener("input", (e) => {
        searchText = e.target.value.trim();
        renderLessons();
      });
  }

  // ============================================
  // 🚀 رویدادهای Overlay
  // ============================================
  closeBtn.addEventListener("click", closeLessonOverlay);

  overlay.addEventListener("click", function (e) {
    if (e.target === this) closeLessonOverlay();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLessonOverlay();
  });

  // ============================================
  // 🚀 مقداردهی اولیه
  // ============================================
  function init() {
    renderLessons();
    setupFilters();
    console.log("✅ ChessHub Lessons loaded successfully");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
