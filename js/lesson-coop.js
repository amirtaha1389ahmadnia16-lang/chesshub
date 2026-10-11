/* ============================================
   🤝 ChessHub | منطق صفحه‌ی همکاری در دروس
   --------------------------------------------
   - ویرایشگر حرفه‌ای محتوا (تیتر، لیست، جدول،
     رنگ متن و پس‌زمینه، تصویر با لینک، ...)
   - انتشار درس در سایت: localStorage با کلید
     chesshub_user_lessons — نمایش در صفحه دروس
   - نام نویسنده: فقط یک بار پرسیده می‌شود و از
     js/author.js (window.ChessHubAuthor) خوانده
     و ذخیره می‌شود؛ window.ChessHubAuthorName
     هم برای سایر صفحات به‌روز نگه داشته می‌شود.
   - ویرایش درس: lesson-coop.html?edit=<id>
     (فقط نویسنده‌ی همان درس اجازه‌ی ویرایش دارد)
   ============================================ */
(function () {
  "use strict";

  // ===== اعمال تم ذخیره‌شده (قبل از رندر برای جلوگیری از پرش) =====
  (function applySavedTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
      if (settings && settings.theme) {
        document.body.className = document.body.className
          .split(" ")
          .filter((c) => !c.startsWith("theme-"))
          .join(" ");
        document.body.classList.add(`theme-${settings.theme}`);
      }
    } catch (e) {}
  })();

  // ===== ثابت‌ها =====
  const STORAGE_KEY = "chesshub_user_lessons";
  const LESSONS_URL = "lessons.html";

  // ===== لیست آیکن‌ها (۲۰ عدد) =====
  const ICONS = [
    "fas fa-book-open",
    "fas fa-chess-queen",
    "fas fa-chess-king",
    "fas fa-chess-rook",
    "fas fa-chess-bishop",
    "fas fa-chess-knight",
    "fas fa-chess-pawn",
    "fas fa-chess-board",
    "fas fa-flag-checkered",
    "fas fa-crown",
    "fas fa-shield-alt",
    "fas fa-bolt",
    "fas fa-fire",
    "fas fa-brain",
    "fas fa-crosshairs",
    "fas fa-bullseye",
    "fas fa-graduation-cap",
    "fas fa-puzzle-piece",
    "fas fa-lightbulb",
    "fas fa-star",
  ];

  // ===== لیست رنگ‌ها (۲۰ عدد) =====
  const COLORS = [
    "#2c7da0",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#3b82f6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#22d3ee",
    "#a855f7",
    "#34d399",
    "#f472b6",
    "#fb923c",
    "#60a5fa",
    "#a78bfa",
    "#4ade80",
    "#f87171",
    "#94a3b8",
  ];

  // ===== رنگ‌های سلول جدول =====
  const CELL_COLORS = [
    "#ffffff",
    "#fef3c7",
    "#d1fae5",
    "#dbeafe",
    "#fee2e2",
    "#f3e8ff",
    "#fce7f3",
    "#e0f2fe",
    "#ffedd5",
    "#ecfdf5",
  ];

  // ===== DOM refs =====
  const editorArea = document.getElementById("editorArea");
  const previewContent = document.getElementById("previewContent");
  const iconGrid = document.getElementById("iconGrid");
  const colorGrid = document.getElementById("colorGrid");
  const selectedIconInput = document.getElementById("selectedIcon");
  const selectedColorInput = document.getElementById("selectedColor");
  const tablePanel = document.getElementById("tablePanel");
  const previewTable = document.getElementById("previewTable");
  const textColorPicker = document.getElementById("textColorPicker");
  const bgColorPicker = document.getElementById("bgColorPicker");
  const cellColorPalette = document.getElementById("cellColorPalette");
  const publishBtn = document.getElementById("publishBtn");
  const exportJSONBtn = document.getElementById("exportJSONBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const resetFormBtn = document.getElementById("resetFormBtn");
  const editModeBanner = document.getElementById("editModeBanner");
  const editModeTitle = document.getElementById("editModeTitle");
  const authorChip = document.getElementById("authorChip");
  const authorChipName = document.getElementById("authorChipName");
  const authorModal = document.getElementById("authorModal");
  const authorNameInput = document.getElementById("authorNameInput");
  const authorError = document.getElementById("authorError");
  const saveAuthorBtn = document.getElementById("saveAuthorBtn");
  const closeAuthorModalBtn = document.getElementById("closeAuthorModal");
  const successModal = document.getElementById("successModal");
  const successTitle = document.getElementById("successTitle");
  const successText = document.getElementById("successText");
  const createAnotherBtn = document.getElementById("createAnotherBtn");

  let selectedIcon = "fas fa-book-open";
  let selectedColor = "#2c7da0";
  let currentCellColor = "#fef3c7";
  let selectedTableCell = null;
  let tableRowCount = 3;
  let tableColCount = 2;
  let editingLesson = null; // درس در حال ویرایش (اگر حالت ویرایش فعال باشد)
  let pendingPublish = false; // ادامه‌ی انتشار پس از انتخاب نام نویسنده
  let importedAuthor = null; // نویسنده‌ی داخل فایل JSON آپلودشده

  // ===== نام نویسنده =====
  function currentAuthor() {
    return (window.ChessHubAuthor && window.ChessHubAuthor.name) || "";
  }

  function updateAuthorChip() {
    const author = currentAuthor();
    if (author) {
      authorChip.style.display = "flex";
      authorChipName.textContent = author;
    } else {
      authorChip.style.display = "none";
    }
  }

  // 👤 اگر پروفایل سراسری همین حالا ثبت شد، چیپ نویسنده هم به‌روز شود
  document.addEventListener("chesshub:profile-changed", function () {
    updateAuthorChip();
  });

  function showAuthorModal() {
    // 👤 نام نویسنده = پروفایل سراسری سایت (یکتا، فقط یک‌بار در شود انتخاب می‌شود)
    if (window.ChessHubProfile) {
      if (ChessHubProfile.has()) {
        updateAuthorChip();
        if (pendingPublish) {
          pendingPublish = false;
          doPublish();
        }
        return;
      }
      ChessHubProfile.openOnboarding({
        onDone: function () {
          updateAuthorChip();
          if (pendingPublish) {
            pendingPublish = false;
            doPublish();
          }
        },
      });
      return;
    }
    authorError.textContent = "";
    authorNameInput.value = "";
    authorModal.classList.add("open");
    setTimeout(() => authorNameInput.focus(), 120);
  }

  function hideAuthorModal() {
    authorModal.classList.remove("open");
    authorError.textContent = "";
  }

  function saveAuthor() {
    const value = authorNameInput.value;
    if (window.ChessHubAuthor && window.ChessHubAuthor.set(value)) {
      hideAuthorModal();
      updateAuthorChip();
      showToast("✅ خوش آمدید، " + window.ChessHubAuthor.name + "!", "success");
      if (pendingPublish) {
        pendingPublish = false;
        doPublish();
      }
    } else {
      authorError.textContent =
        "نام باید حداقل ۲ حرف و حداکثر ۴۰ حرف باشد.";
      authorNameInput.focus();
    }
  }

  // ===== ذخیره‌سازی درس‌های کاربر =====
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

  // ===== ساخت آیکن‌ها =====
  function buildIconGrid() {
    iconGrid.innerHTML = "";
    ICONS.forEach((icon) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn" + (icon === selectedIcon ? " active" : "");
      btn.innerHTML = `<i class="${icon}"></i>`;
      btn.dataset.icon = icon;
      btn.addEventListener("click", function () {
        iconGrid
          .querySelectorAll(".icon-btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        selectedIcon = this.dataset.icon;
        selectedIconInput.value = selectedIcon;
      });
      iconGrid.appendChild(btn);
    });
  }

  // ===== ساخت رنگ‌ها =====
  function buildColorGrid() {
    colorGrid.innerHTML = "";
    COLORS.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "color-btn" + (color === selectedColor ? " active" : "");
      btn.style.background = color;
      btn.dataset.color = color;
      if (color === selectedColor) {
        btn.innerHTML = `<span class="check"><i class="fas fa-check"></i></span>`;
      }
      btn.addEventListener("click", function () {
        colorGrid.querySelectorAll(".color-btn").forEach((b) => {
          b.classList.remove("active");
          b.innerHTML = "";
        });
        this.classList.add("active");
        this.innerHTML = `<span class="check"><i class="fas fa-check"></i></span>`;
        selectedColor = this.dataset.color;
        selectedColorInput.value = selectedColor;
      });
      colorGrid.appendChild(btn);
    });
  }

  // ===== ساخت رنگ‌های سلول =====
  function buildCellColorPalette() {
    cellColorPalette.innerHTML = "";
    CELL_COLORS.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-btn" + (c === currentCellColor ? " active" : "");
      btn.style.background = c;
      if (c === "#ffffff") btn.style.border = "2px solid #dde4ec";
      if (c === currentCellColor) {
        btn.innerHTML = `<span class="cc-check"><i class="fas fa-check"></i></span>`;
      }
      btn.addEventListener("click", function () {
        cellColorPalette.querySelectorAll(".cc-btn").forEach((b) => {
          b.classList.remove("active");
          b.innerHTML = "";
          if (
            b.style.background === "rgb(255, 255, 255)" ||
            b.style.background === "#ffffff"
          ) {
            b.style.border = "2px solid #dde4ec";
          }
        });
        this.classList.add("active");
        this.innerHTML = `<span class="cc-check"><i class="fas fa-check"></i></span>`;
        currentCellColor = c;
        applyColorToSelectedCell();
      });
      cellColorPalette.appendChild(btn);
    });
  }

  function applyColorToSelectedCell() {
    if (selectedTableCell && selectedTableCell.tagName) {
      selectedTableCell.style.background = currentCellColor;
    }
  }

  // ===== ساخت/بازسازی جدول پیش‌نمایش =====
  function rebuildPreviewTable() {
    const thead = previewTable.querySelector("thead");
    const tbody = previewTable.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    const headerRow = document.createElement("tr");
    for (let c = 0; c < tableColCount; c++) {
      const th = document.createElement("th");
      th.textContent =
        c === 0 ? "حرکت سفید" : c === 1 ? "حرکت سیاه" : "عنوان";
      th.style.background = "#e8f0f6";
      th.addEventListener("click", function () {
        selectPreviewCell(th);
      });
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    for (let r = 0; r < tableRowCount; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < tableColCount; c++) {
        const td = document.createElement("td");
        td.textContent = getDefaultCellText(r, c);
        td.addEventListener("click", function () {
          selectPreviewCell(td);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    selectedTableCell = null;
  }

  function getDefaultCellText(row, col) {
    const moves = [
      ["e4", "e5"],
      ["Nf3", "Nc6"],
      ["Bb5", "a6"],
      ["O-O", "Nf6"],
      ["Re1", "Be7"],
      ["c3", "O-O"],
    ];
    if (row < moves.length && col < moves[row].length) {
      return moves[row][col];
    }
    return "...";
  }

  function selectPreviewCell(cell) {
    previewTable
      .querySelectorAll("th.selected-cell, td.selected-cell")
      .forEach((c) => c.classList.remove("selected-cell"));
    cell.classList.add("selected-cell");
    selectedTableCell = cell;
  }

  function changeRows(delta) {
    const newCount = tableRowCount + delta;
    if (newCount < 1 || newCount > 20) return;
    tableRowCount = newCount;
    document.getElementById("rowCountDisplay").textContent = tableRowCount;
    rebuildPreviewTable();
  }

  function changeCols(delta) {
    const newCount = tableColCount + delta;
    if (newCount < 1 || newCount > 10) return;
    tableColCount = newCount;
    document.getElementById("colCountDisplay").textContent = tableColCount;
    rebuildPreviewTable();
  }

  // ===== درج تگ در ویرایشگر =====
  function insertTag(tag) {
    const selection = window.getSelection();
    let range;
    if (
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      editorArea.contains(selection.anchorNode)
    ) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      const lastChild = editorArea.lastChild;
      if (lastChild) {
        range.setStartAfter(lastChild);
      } else {
        range.setStart(editorArea, 0);
      }
      range.collapse(false);
    }

    const wrapper = document.createElement("div");
    wrapper.style.margin = "0.3rem 0";
    let content = "";
    switch (tag) {
      case "h3":
        content = "<h3>عنوان اصلی</h3>";
        break;
      case "h4":
        content = "<h4>عنوان فرعی</h4>";
        break;
      case "p":
        content = "<p>متن پاراگراف...</p>";
        break;
      case "ul":
        content = "<ul><li>مورد اول</li><li>مورد دوم</li></ul>";
        break;
      case "ol":
        content = "<ol><li>مورد اول</li><li>مورد دوم</li></ol>";
        break;
      case "blockquote":
        content = "<blockquote>نقل قول...</blockquote>";
        break;
      case "code":
        content = "<code>کد نمونه</code>";
        break;
      case "hr":
        content = "<hr />";
        break;
      default:
        return;
    }
    wrapper.innerHTML = content;
    range.deleteContents();
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorArea.focus();
    updatePreview();
  }

  // ===== درج تصویر (فقط لینک) =====
  function insertImage(url) {
    const selection = window.getSelection();
    let range;
    if (
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      editorArea.contains(selection.anchorNode)
    ) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      const lastChild = editorArea.lastChild;
      if (lastChild) {
        range.setStartAfter(lastChild);
      } else {
        range.setStart(editorArea, 0);
      }
      range.collapse(false);
    }
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.margin = "0.3rem 0";
    img.alt = "تصویر شطرنج";
    const wrapper = document.createElement("div");
    wrapper.style.margin = "0.3rem 0";
    wrapper.appendChild(img);
    range.deleteContents();
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorArea.focus();
    updatePreview();
    showToast("✅ تصویر درج شد", "success");
  }

  // ===== درج جدول در ویرایشگر =====
  function insertTableIntoEditor() {
    const tableClone = previewTable.cloneNode(true);
    tableClone.querySelectorAll("th, td").forEach((cell) => {
      cell.classList.remove("selected-cell");
      cell.removeAttribute("contenteditable");
    });
    tableClone.style.width = "100%";
    tableClone.style.borderCollapse = "collapse";
    tableClone.style.margin = "0.5rem 0";
    tableClone.style.fontSize = "0.85rem";
    tableClone.querySelectorAll("th").forEach((th) => {
      th.style.background = th.style.background || "#e8f0f6";
      th.style.color = "#1a5a78";
      th.style.padding = "0.4rem 0.8rem";
      th.style.border = "1px solid #dde4ec";
      th.style.fontWeight = "700";
      th.style.cursor = "default";
    });
    tableClone.querySelectorAll("td").forEach((td) => {
      td.style.padding = "0.4rem 0.8rem";
      td.style.border = "1px solid #dde4ec";
      td.style.cursor = "default";
    });

    const wrapper = document.createElement("div");
    wrapper.style.margin = "0.3rem 0";
    wrapper.appendChild(tableClone);

    const selection = window.getSelection();
    let range;
    if (
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      editorArea.contains(selection.anchorNode)
    ) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      const lastChild = editorArea.lastChild;
      if (lastChild) {
        range.setStartAfter(lastChild);
      } else {
        range.setStart(editorArea, 0);
      }
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorArea.focus();

    tablePanel.style.display = "none";
    showToast("✅ جدول در محتوا درج شد", "success");
    updatePreview();
  }

  // ===== پیش‌نمایش =====
  function updatePreview() {
    previewContent.innerHTML = editorArea.innerHTML;
  }
  editorArea.addEventListener("input", updatePreview);
  editorArea.addEventListener("keyup", updatePreview);
  editorArea.addEventListener("click", updatePreview);

  // ===== Toast =====
  function showToast(text, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = text;
    toast.className = "toast show " + type;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(
      () => toast.classList.remove("show"),
      4000
    );
  }

  // ===== انتشار در سایت =====
  function publishFlow() {
    if (!window.ChessHubAuthor || !window.ChessHubAuthor.has()) {
      // فقط بار اول نام پرسیده می‌شود؛ بعد از آن مستقیم منتشر می‌کنیم
      pendingPublish = true;
      showAuthorModal();
      return;
    }
    doPublish();
  }

  function collectLessonData() {
    return {
      title: document.getElementById("lessonTitle").value.trim(),
      category: document.getElementById("lessonCategory").value,
      level: document.getElementById("lessonLevel").value,
      duration: document.getElementById("lessonDuration").value.trim(),
      description: document.getElementById("lessonDescription").value.trim(),
      thumbIcon: selectedIconInput.value,
      color: selectedColorInput.value,
      content: editorArea.innerHTML.trim(),
    };
  }

  function validateLessonData(data) {
    if (!data.title) {
      showToast("❌ لطفاً عنوان درس را وارد کنید", "error");
      return false;
    }
    if (!data.duration) {
      showToast("❌ لطفاً مدت زمان را وارد کنید", "error");
      return false;
    }
    if (!data.description) {
      showToast("❌ لطفاً توضیحات را وارد کنید", "error");
      return false;
    }
    if (!data.content) {
      showToast("❌ لطفاً محتوای درس را وارد کنید", "error");
      return false;
    }
    return true;
  }

  function doPublish() {
    // نویسنده: از نشست/پروفایل — مگر فایل JSON آپلود شود (با تأیید صریح کاربر)
    const author = importedAuthor || currentAuthor();
    if (!author) {
      // اگر به هر دلیلی نام از بین رفته باشد، دوباره پرسیده می‌شود
      pendingPublish = true;
      showAuthorModal();
      return;
    }

    const data = collectLessonData();
    if (!validateLessonData(data)) return;
    showImportErrors([]); // ✅ اعتبارسنجی رد شد — کادر خطاهای قدیمی پاک شود

    const now = Date.now();
    const list = loadUserLessons();

    if (editingLesson) {
      let idx = list.findIndex(
        (l) => String(l.id) === String(editingLesson.id)
      );
      if (idx === -1) {
        // درس فقط روی سرور بود (ویرایش بین‌دستگاهی) — اکنون به این دستگاه هم می‌آید
        list.unshift(Object.assign({}, editingLesson));
        idx = 0;
      }
      // 📥 اگر آپلودکننده اثر نویسنده‌ی دیگر را ویرایش می‌کند، نام نویسنده‌ی اصلی حفظ می‌شود
      const keepAuthor = !!list[idx].author && list[idx].author !== author;
      list[idx] = Object.assign({}, list[idx], data, {
        author: keepAuthor ? list[idx].author : author,
        importedFile: !!importedAuthor || keepAuthor,
        updatedAt: now,
      });
      if (!saveUserLessons(list)) {
        showToast("❌ ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست", "error");
        return;
      }
      editingLesson = list[idx];
      showToast("✅ تغییرات درس با موفقیت ذخیره شد!", "success");
      showSuccess(true);
      syncToServer(list[idx], false);
    } else {
      const lesson = Object.assign({}, data, {
        id: "u_" + now,
        author: author,
        importedFile: !!importedAuthor,
        // 📥 آپلودکننده ثبت می‌شود تا بعداً ویرایش/حذف برای او هم باز باشد
        importedBy: importedAuthor ? (currentAuthor() || null) : null,
        createdAt: now,
        updatedAt: now,
      });
      list.unshift(lesson);
      if (!saveUserLessons(list)) {
        showToast("❌ ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست", "error");
        return;
      }
      editingLesson = lesson;
      showToast("✅ درس شما با موفقیت منتشر شد!", "success");
      showSuccess(false);
      syncToServer(lesson, true);
    }
  }

  // 🌍 انتشار عمومی روی سرور — درس برای «همه‌ی کاربران سایت» نمایش داده می‌شود
  // (قبلاً فقط در localStorage همین مرورگر ذخیره می‌شد و دیگران آن را نمی‌دیدند)
  function syncToServer(localItem, isNew) {
    if (!window.CommunityHub) return;
    const serverId = localItem.serverId || null;
    const payload = {
      title: localItem.title,
      category: localItem.category,
      level: localItem.level,
      duration: localItem.duration,
      description: localItem.description,
      thumbIcon: localItem.thumbIcon,
      color: localItem.color,
      content: localItem.content,
      author: localItem.author,
    };
    CommunityHub.save(
      "lessons",
      serverId ? "update" : "publish",
      serverId || localItem.id,
      payload,
      // 📥 اگر محتوا از فایل JSON آمده، نام نویسنده‌ی فایل حفظ می‌شود
      localItem.importedFile ? { allowFileAuthor: true } : undefined
    )
      .then(function (j) {
        if (j.item && j.item.id) {
          // ذخیره‌ی شناسه‌ی سروری در نسخه‌ی محلی تا تکراری نمایش داده نشود
          const list = loadUserLessons();
          const it = list.find((l) => String(l.id) === String(localItem.id));
          if (it) {
            it.serverId = j.item.id;
            saveUserLessons(list);
            if (editingLesson && String(editingLesson.id) === String(it.id)) {
              editingLesson.serverId = j.item.id;
            }
          }
        }
        showToast(
          isNew
            ? "🌍 درس برای همه‌ی کاربران سایت منتشر شد!"
            : "🌍 تغییرات برای همه‌ی کاربران سایت به‌روزرسانی شد",
          "success"
        );
      })
      .catch(function (err) {
        showToast(
          "⚠️ در این دستگاه ذخیره شد، اما انتشار عمومی ناموفق بود: " + err.message,
          "warning"
        );
      });
  }

  function showSuccess(isUpdate) {
    const author = currentAuthor();
    successTitle.textContent = isUpdate
      ? "درس شما به‌روزرسانی شد!"
      : "درس شما منتشر شد!";
    successText.textContent =
      "نویسنده: " +
      author +
      " — درس شما اکنون در صفحه‌ی دروس آموزشی قابل مشاهده است.";
    successModal.classList.add("open");
  }

  function resetToNewLesson() {
    successModal.classList.remove("open");
    editingLesson = null;
    editModeBanner.style.display = "none";
    restorePublishButton();
    clearEditorState();
    try {
      history.replaceState(null, "", "lesson-coop.html");
    } catch (e) {}
  }

  function restorePublishButton() {
    publishBtn.innerHTML =
      '<i class="fas fa-paper-plane"></i> انتشار در سایت';
  }

  // ===== خروجی JSON (پشتیبان‌گیری/انتقال دستی) =====
  function exportJSON() {
    const data = collectLessonData();
    if (!validateLessonData(data)) return;

    const lessonData = Object.assign({}, data, {
      id: editingLesson ? editingLesson.id : "u_" + Date.now(),
      author: currentAuthor(),
    });

    const json = JSON.stringify(lessonData, null, 2);
    const blob = new Blob([json], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lesson_${data.title.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✅ فایل JSON با موفقیت دانلود شد! (${data.title})`, "success");
  }

  // ===== ورودی JSON (آپلود فایل استاندارد — دقیقاً یک فایل در هر بار) =====

  // پاک‌سازی HTML درس مطابق استاندارد سرور (حذف اسکریپت/رویداد/لینک خطرناک)
  function sanitizeLessonHtml(html, maxLen) {
    let s = String(html == null ? "" : html);
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s
      .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta|base)[^>]*\/?\s*>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
      .replace(/javascript\s*:/gi, "");
  }

  function importJSON() {
    importFile.value = "";
    importFile.click();
  }

  // ===== 🆕 v8.3 — کادر خطاهای فایل آپلودشده (بالای فرم) =====
  const importErrorBox = document.getElementById("importErrorBox");
  const importErrorList = document.getElementById("importErrorList");

  function faNum(n) {
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
  }

  function showImportErrors(problems) {
    if (!importErrorBox || !importErrorList) return;
    importErrorList.innerHTML = "";
    const list = problems || [];
    list.forEach(function (p) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = p.msg;
      li.appendChild(span);
      if (p.find) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "نمایش در فرم";
        b.addEventListener("click", function () {
          const el = p.find();
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("chmi-bad-input");
          void el.offsetWidth;
          el.classList.add("chmi-bad-input");
          try { el.focus({ preventScroll: true }); } catch (e) {}
          setTimeout(function () { el.classList.remove("chmi-bad-input"); }, 3000);
        });
        li.appendChild(b);
      }
      importErrorList.appendChild(li);
    });
    importErrorBox.style.display = list.length ? "block" : "none";
  }

  function flagBadInput(el, msg) {
    if (!el) return;
    el.classList.add("chmi-bad-input");
    if (msg) el.title = msg;
    // select هم رویداد change می‌فرستد نه input — هر دو گوش داده می‌شوند
    el.addEventListener(
      "input",
      function onFix() {
        el.classList.remove("chmi-bad-input");
        el.removeEventListener("input", onFix);
        el.removeEventListener("change", onChange);
        // ✅ همه‌ی فیلدهای خطادار اصلاح شدند → کادر خطا هم پنهان شود
        if (!document.querySelector(".chmi-bad-input")) showImportErrors([]);
      }
    );
    var onChange = function () {
      el.classList.remove("chmi-bad-input");
      el.removeEventListener("input", onFix);
      el.removeEventListener("change", onChange);
      if (!document.querySelector(".chmi-bad-input")) showImportErrors([]);
    };
    el.addEventListener("change", onChange);
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast("❌ حجم فایل بیش از ۵۱۲ کیلوبایت است", "error");
      return;
    }
    const reader = new FileReader();
    reader.onerror = function () {
      showToast("❌ خواندن فایل ممکن نشد", "error");
    };
    reader.onload = function () {
      let obj = null;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { obj = null; }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        showToast("❌ فایل JSON معتبر نیست — این فایل خروجی «خروجی JSON» همین صفحه است؟", "error");
        return;
      }
      // 🆕 v8.3 — فایل همیشه بارگذاری می‌شود؛ خطاها همه با هم در کادر
      // بالای فرم فهرست می‌شوند تا کاربر همان‌ها را اصلاح کند
      const plan = buildImportPlan(obj);
      fillFormFromImport(plan.data, obj, plan.problems);
    };
    reader.readAsText(file, "utf8");
  }

  // خروجی: { data, problems } — همه‌ی خطاها جمع می‌شوند؛ فایل رد نمی‌شود
  function buildImportPlan(o) {
    const problems = [];
    const titleFind = function () { return document.getElementById("lessonTitle"); };
    const descFind = function () { return document.getElementById("lessonDescription"); };

    const title = String(o.title || "").trim();
    if (title.length < 3 || title.length > 120) {
      problems.push({
        msg: "عنوان درس باید بین ۳ تا ۱۲۰ حرف باشد" + (title ? " (الان " + faNum(title.length) + " حرف)" : " (خالی است)"),
        find: titleFind,
      });
    }

    const description = String(o.description || "").trim();
    if (description.length < 5 || description.length > 400) {
      problems.push({
        msg: "توضیحات درس باید بین ۵ تا ۴۰۰ حرف باشد" + (description ? " (الان " + faNum(description.length) + " حرف)" : " (خالی است)"),
        find: descFind,
      });
    }

    const content = sanitizeLessonHtml(o.content, 80000);
    if (content.trim().length < 20) {
      problems.push({
        msg: "محتوای درس خیلی کوتاه است (حداقل ۲۰ حرف) — در ویرایشگر محتوا کاملش کن",
        find: function () { return document.getElementById("editorArea") || document.getElementById("lessonTitle"); },
      });
    }

    // دسته‌بندی و سطح — فقط مقادیر مجاز فرم
    const catSelect = document.getElementById("lessonCategory");
    const lvlSelect = document.getElementById("lessonLevel");
    const catOptions = Array.from(catSelect.options).map((x) => x.value);
    const lvlOptions = Array.from(lvlSelect.options).map((x) => x.value);
    const category = catOptions.indexOf(String(o.category || "").trim()) >= 0
      ? String(o.category).trim()
      : catOptions[0];
    const level = lvlOptions.indexOf(String(o.level || "").trim()) >= 0
      ? String(o.level).trim()
      : lvlOptions[0];
    if (o.category && catOptions.indexOf(String(o.category).trim()) < 0) {
      problems.push({
        msg: "دسته‌بندی «" + String(o.category).slice(0, 30) + "» در سایت وجود ندارد — «" + catOptions[0] + "» گذاشته شد؛ خودت عوضش کن",
        find: function () { return catSelect; },
      });
    }

    const duration = String(o.duration || "").trim().slice(0, 40) || "۱۰ دقیقه";
    const thumbIcon = ICONS.indexOf(String(o.thumbIcon || "").trim()) >= 0
      ? String(o.thumbIcon).trim()
      : "fas fa-book-open";
    const color = COLORS.indexOf(String(o.color || "").trim()) >= 0
      ? String(o.color).trim()
      : "#2c7da0";

    return {
      data: {
        title: title,
        category: category,
        level: level,
        duration: duration,
        description: description,
        content: content,
        thumbIcon: thumbIcon,
        color: color,
      },
      problems: problems,
    };
  }

  function fillFormFromImport(data, original, problems) {
    // 📥 انتخاب نویسنده — پیش‌فرض: نویسنده‌ی داخل فایل (با تأیید کاربر)
    const fileAuthor = String(original.author || "").trim().slice(0, 40);
    const me = currentAuthor();
    if (fileAuthor && fileAuthor !== me) {
      const keep = confirm(
        "نویسنده‌ی داخل فایل: «" + fileAuthor + "»\n\n" +
          "OK = انتشار با نام نویسنده‌ی فایل («" + fileAuthor + "»)\n" +
          "Cancel = انتشار با نام خودت" + (me ? " («" + me + "»)" : "")
      );
      importedAuthor = keep ? fileAuthor : me;
    } else {
      importedAuthor = me || fileAuthor || null;
    }

    document.getElementById("lessonTitle").value = data.title;
    document.getElementById("lessonCategory").value = data.category;
    document.getElementById("lessonLevel").value = data.level;
    document.getElementById("lessonDuration").value = data.duration;
    document.getElementById("lessonDescription").value = data.description;

    editorArea.innerHTML = data.content;
    selectedIcon = data.thumbIcon;
    selectedIconInput.value = selectedIcon;
    buildIconGrid();
    selectedColor = data.color;
    selectedColorInput.value = selectedColor;
    buildColorGrid();
    updatePreview();

    editingLesson = null;
    editModeBanner.style.display = "none";
    restorePublishButton();
    try { history.replaceState(null, "", "lesson-coop.html"); } catch (e) {}

    if (importedAuthor || me) {
      authorChip.style.display = "flex";
      authorChipName.textContent = importedAuthor || me;
    } else {
      updateAuthorChip();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 🆕 v8.3 — علامت‌گذاری فیلدهای خطادار + کادر خطا بالای فرم
    const probs = problems || [];
    probs.forEach(function (p) {
      if (!p.find) return;
      const el = p.find();
      if (el) flagBadInput(el, p.msg);
    });
    showImportErrors(probs);

    if (probs.length) {
      showToast(
        "⚠️ فایل بارگذاری شد اما " + faNum(probs.length) + " خطا دارد — کادر بالای فرم را ببین و اصلاح کن",
        "warning"
      );
    } else {
      showToast("✅ فایل JSON با موفقیت بارگذاری شد — حالا «انتشار در سایت» را بزن");
    }
  }

  // ===== ریست فرم =====
  function resetForm(needsConfirm) {
    if (needsConfirm) {
      if (!confirm("آیا مطمئنی؟ تمام اطلاعات فرم پاک می‌شود.")) return;
    }
    document
      .querySelectorAll(
        "#coopForm input:not([type=hidden]):not([type=color]), #coopForm select"
      )
      .forEach((el) => {
        if (el.tagName === "SELECT") el.selectedIndex = 0;
        else if (el.type !== "color") el.value = "";
      });
    editorArea.innerHTML = "";
    previewContent.innerHTML = "";
    tablePanel.style.display = "none";
    selectedIcon = "fas fa-book-open";
    selectedIconInput.value = selectedIcon;
    buildIconGrid();
    selectedColor = "#2c7da0";
    selectedColorInput.value = selectedColor;
    buildColorGrid();
    tableRowCount = 3;
    tableColCount = 2;
    currentCellColor = "#fef3c7";
    document.getElementById("rowCountDisplay").textContent = tableRowCount;
    document.getElementById("colCountDisplay").textContent = tableColCount;
    rebuildPreviewTable();
    buildCellColorPalette();
    selectedTableCell = null;
    editingLesson = null;
    importedAuthor = null;
    showImportErrors([]); // 🆕 v8.3 — کادر خطا هم پاک شود
    editModeBanner.style.display = "none";
    restorePublishButton();
    try {
      history.replaceState(null, "", "lesson-coop.html");
    } catch (e) {}
    if (needsConfirm) showToast("🔄 فرم پاک شد", "warning");
  }

  // ===== حالت ویرایش (lesson-coop.html?edit=<id>) =====
  function loadEditingLesson() {
    let editId = null;
    try {
      editId = new URLSearchParams(window.location.search).get("edit");
    } catch (e) {
      return;
    }
    if (!editId) return;

    const lesson = loadUserLessons().find(
      (l) => String(l.id) === String(editId) ||
             String(l.serverId || "") === String(editId)
    );
    if (!lesson) {
      // 🔁 درس در این دستگاه ذخیره نیست — شاید روی سرور عمومی باشد
      // (ویرایش از دستگاه/مرورگر دیگر با همان نام نویسنده)
      if (window.CommunityHub) {
        CommunityHub.fetchAll()
          .then(function (c) {
            const remote = (c.lessons || []).find(
              (l) => String(l.id) === String(editId)
            );
            if (remote) applyEditMode(Object.assign({}, remote, { serverId: remote.id }));
            else showToast("❌ درس مورد نظر برای ویرایش پیدا نشد", "error");
          })
          .catch(function () {
            showToast("❌ درس مورد نظر برای ویرایش پیدا نشد", "error");
          });
      } else {
        showToast("❌ درس مورد نظر برای ویرایش پیدا نشد", "error");
      }
      return;
    }
    applyEditMode(lesson);
  }

  function applyEditMode(lesson) {
    // نویسنده‌ی همان درس (یا آپلودکننده‌ی فایل — مطابق مجوز سرور) حق ویرایش دارد
    const author = currentAuthor();
    const isAllowed = !author || !lesson.author ||
      lesson.author === author || lesson.importedBy === author;

    if (!isAllowed && window.CommunityHub &&
        (lesson.serverId || String(lesson.id || "").indexOf("srv_") === 0)) {
      // 🔄 شاید آپلودکننده‌ی فایل باشی — مجوز واقعی از نسخه‌ی سرور چک می‌شود
      CommunityHub.fetchAll(true).then(function (c) {
        const remote = (c.lessons || []).find(function (x) {
          return String(x.id) === String(lesson.serverId || lesson.id);
        });
        if (remote && (remote.author === author || remote.importedBy === author)) {
          lesson.importedBy = remote.importedBy || author;
          doApplyEditMode(lesson);
        } else {
          showToast("⚠️ فقط نویسنده‌ی درس می‌تواند آن را ویرایش کند", "warning");
        }
      }).catch(function () {
        showToast("⚠️ فقط نویسنده‌ی درس می‌تواند آن را ویرایش کند", "warning");
      });
      return;
    }

    if (!isAllowed) {
      showToast("⚠️ فقط نویسنده‌ی درس می‌تواند آن را ویرایش کند", "warning");
      return;
    }
    doApplyEditMode(lesson);
  }

  function doApplyEditMode(lesson) {

    editingLesson = lesson;

    document.getElementById("lessonTitle").value = lesson.title || "";
    document.getElementById("lessonCategory").value =
      lesson.category || "شروع بازی";
    document.getElementById("lessonLevel").value = lesson.level || "مبتدی";
    document.getElementById("lessonDuration").value = lesson.duration || "";
    document.getElementById("lessonDescription").value =
      lesson.description || "";

    selectedIcon = lesson.thumbIcon || "fas fa-book-open";
    selectedIconInput.value = selectedIcon;
    buildIconGrid();

    selectedColor = lesson.color || "#2c7da0";
    selectedColorInput.value = selectedColor;
    buildColorGrid();

    editorArea.innerHTML = lesson.content || "";
    updatePreview();

    editModeTitle.textContent = lesson.title || "بدون عنوان";
    editModeBanner.style.display = "flex";
    publishBtn.innerHTML =
      '<i class="fas fa-save"></i> ذخیره تغییرات';

    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("📝 در حال ویرایش درس ذخیره‌شده شما", "info");
  }

  // پاک کردن فرم بدون confirm (برای «ساخت درس جدید»)
  function clearEditorState() {
    resetForm(false);
  }

  // ===== رویدادهای toolbar =====
  document
    .querySelectorAll(".editor-toolbar .tool-btn[data-tag]")
    .forEach((btn) => {
      btn.addEventListener("click", function () {
        const tag = this.dataset.tag;
        insertTag(tag);
      });
    });

  document
    .getElementById("imageBtn")
    .addEventListener("click", function () {
      const url = prompt(
        "لینک تصویر را وارد کنید:",
        window.chPh(400, 200, "Chess")
      );
      if (url && url.trim()) insertImage(url.trim());
    });

  document
    .getElementById("applyColorBtn")
    .addEventListener("click", function () {
      const selection = window.getSelection();
      if (
        selection.rangeCount === 0 ||
        selection.isCollapsed ||
        !editorArea.contains(selection.anchorNode)
      ) {
        showToast(
          "لطفاً ابتدا متن مورد نظر را در ویرایشگر انتخاب کنید",
          "warning"
        );
        return;
      }
      const range = selection.getRangeAt(0);
      try {
        const span = document.createElement("span");
        span.style.color = textColorPicker.value;
        span.style.background = bgColorPicker.value;
        span.style.padding = "0.1rem 0.25rem";
        span.style.borderRadius = "4px";
        range.surroundContents(span);
        showToast("✅ رنگ اعمال شد", "success");
        updatePreview();
      } catch (e) {
        showToast(
          "⚠️ لطفاً فقط یک بخش ساده از متن را انتخاب کنید",
          "error"
        );
      }
    });

  // ===== پنل جدول =====
  document
    .getElementById("toggleTablePanelBtn")
    .addEventListener("click", function () {
      if (tablePanel.style.display === "block") {
        tablePanel.style.display = "none";
      } else {
        tablePanel.style.display = "block";
        rebuildPreviewTable();
        buildCellColorPalette();
        selectedTableCell = null;
        tablePanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    });

  document
    .getElementById("closeTablePanelBtn")
    .addEventListener("click", function () {
      tablePanel.style.display = "none";
    });

  document
    .getElementById("incRowsBtn")
    .addEventListener("click", () => changeRows(1));
  document
    .getElementById("decRowsBtn")
    .addEventListener("click", () => changeRows(-1));
  document
    .getElementById("incColsBtn")
    .addEventListener("click", () => changeCols(1));
  document
    .getElementById("decColsBtn")
    .addEventListener("click", () => changeCols(-1));

  document
    .getElementById("insertTableToEditorBtn")
    .addEventListener("click", insertTableIntoEditor);

  document
    .getElementById("resetTableBtn")
    .addEventListener("click", function () {
      tableRowCount = 3;
      tableColCount = 2;
      currentCellColor = "#fef3c7";
      document.getElementById("rowCountDisplay").textContent =
        tableRowCount;
      document.getElementById("colCountDisplay").textContent =
        tableColCount;
      rebuildPreviewTable();
      buildCellColorPalette();
      selectedTableCell = null;
      showToast("🔄 جدول بازنشانی شد", "warning");
    });

  // ===== دکمه‌های اصلی =====
  publishBtn.addEventListener("click", publishFlow);
  exportJSONBtn.addEventListener("click", exportJSON);
  importBtn.addEventListener("click", importJSON);
  importFile.addEventListener("change", function () {
    // دقیقاً یک فایل در هر بار — ورودی بدون multiple است
    if (this.files && this.files[0]) handleImportFile(this.files[0]);
  });
  resetFormBtn.addEventListener("click", function () {
    resetForm(true);
  });

  // ===== مودال نام نویسنده =====
  saveAuthorBtn.addEventListener("click", saveAuthor);
  authorNameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveAuthor();
    }
  });
  closeAuthorModalBtn.addEventListener("click", function () {
    // بستن بدون ذخیره = انصراف از انتشار
    pendingPublish = false;
    hideAuthorModal();
  });

  // ===== مودال انتشار موفق =====
  createAnotherBtn.addEventListener("click", resetToNewLesson);

  // ===== بستن پنل جدول با کلیک خارج =====
  document.addEventListener("click", function (e) {
    if (tablePanel.style.display === "block") {
      const isInsidePanel = tablePanel.contains(e.target);
      const isTableBtn = e.target.closest("#toggleTablePanelBtn");
      if (!isInsidePanel && !isTableBtn) {
        const isInEditor = e.target.closest(".editor-wrapper");
        if (!isInEditor) {
          tablePanel.style.display = "none";
        }
      }
    }
  });

  // ===== مقداردهی اولیه =====
  document.addEventListener("DOMContentLoaded", function () {
    buildIconGrid();
    buildColorGrid();
    buildCellColorPalette();
    rebuildPreviewTable();
    document.getElementById("rowCountDisplay").textContent =
      tableRowCount;
    document.getElementById("colCountDisplay").textContent =
      tableColCount;
    updateAuthorChip();
    loadEditingLesson();
    console.log("✅ ChessHub Cooperation loaded successfully");
  });
})();
