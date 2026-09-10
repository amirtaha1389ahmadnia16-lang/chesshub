(function () {
  "use strict";

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

  let selectedIcon = "fas fa-book-open";
  let selectedColor = "#2c7da0";
  let currentCellColor = "#fef3c7";
  let selectedTableCell = null;
  let tableRowCount = 3;
  let tableColCount = 2;

  function buildIconGrid() {
    iconGrid.innerHTML = "";
    ICONS.forEach((icon) => {
      const btn = document.createElement("button");
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

  function buildColorGrid() {
    colorGrid.innerHTML = "";
    COLORS.forEach((color) => {
      const btn = document.createElement("button");
      btn.className = "color-btn" + (color === selectedColor ? " active" : "");
      btn.style.background = color;
      btn.dataset.color = color;
      if (color === selectedColor)
        btn.innerHTML = `<span class="check"><i class="fas fa-check"></i></span>`;
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

  function buildCellColorPalette() {
    cellColorPalette.innerHTML = "";
    CELL_COLORS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "cc-btn" + (c === currentCellColor ? " active" : "");
      btn.style.background = c;
      if (c === "#ffffff") btn.style.border = "2px solid #dde4ec";
      if (c === currentCellColor)
        btn.innerHTML = `<span class="cc-check"><i class="fas fa-check"></i></span>`;
      btn.addEventListener("click", function () {
        cellColorPalette.querySelectorAll(".cc-btn").forEach((b) => {
          b.classList.remove("active");
          b.innerHTML = "";
          if (
            b.style.background === "rgb(255, 255, 255)" ||
            b.style.background === "#ffffff"
          )
            b.style.border = "2px solid #dde4ec";
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
    if (selectedTableCell && selectedTableCell.tagName)
      selectedTableCell.style.background = currentCellColor;
  }

  function rebuildPreviewTable() {
    const thead = previewTable.querySelector("thead");
    const tbody = previewTable.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";
    const headerRow = document.createElement("tr");
    for (let c = 0; c < tableColCount; c++) {
      const th = document.createElement("th");
      th.textContent = c === 0 ? "حرکت سفید" : c === 1 ? "حرکت سیاه" : "عنوان";
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
        const moves = [
          ["e4", "e5"],
          ["Nf3", "Nc6"],
          ["Bb5", "a6"],
          ["O-O", "Nf6"],
          ["Re1", "Be7"],
          ["c3", "O-O"],
        ];
        td.textContent =
          r < moves.length && c < moves[r].length ? moves[r][c] : "...";
        td.addEventListener("click", function () {
          selectPreviewCell(td);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    selectedTableCell = null;
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
      if (lastChild) range.setStartAfter(lastChild);
      else range.setStart(editorArea, 0);
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
      if (lastChild) range.setStartAfter(lastChild);
      else range.setStart(editorArea, 0);
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
      if (lastChild) range.setStartAfter(lastChild);
      else range.setStart(editorArea, 0);
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

  function updatePreview() {
    previewContent.innerHTML = editorArea.innerHTML;
  }

  function showToast(text, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = text;
    toast.className = "toast show " + type;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove("show"), 4000);
  }

  function resetForm() {
    if (!confirm("آیا مطمئنی؟ تمام اطلاعات فرم پاک می‌شود.")) return;
    document
      .querySelectorAll(
        "#coopForm input:not([type=hidden]):not([type=color]), #coopForm select",
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
    showToast("🔄 فرم پاک شد", "warning");
  }

  // فقط فایل JSON را دانلود می‌کند (بدون ذخیره در مرورگر)
  function exportJSON() {
    const title = document.getElementById("lessonTitle").value.trim();
    const category = document.getElementById("lessonCategory").value;
    const level = document.getElementById("lessonLevel").value;
    const duration = document.getElementById("lessonDuration").value.trim();
    const description = document
      .getElementById("lessonDescription")
      .value.trim();
    const icon = selectedIconInput.value;
    const color = selectedColorInput.value;
    const content = editorArea.innerHTML.trim();

    if (!title || !duration || !description || !content) {
      showToast("❌ لطفاً تمام فیلدها را پر کنید", "error");
      return;
    }

    const lessonData = {
      id: Date.now(),
      title: title,
      category: category,
      level: level,
      description: description,
      duration: duration,
      thumbIcon: icon,
      color: color,
      content: content,
    };

    const json = JSON.stringify(lessonData, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lesson_${title.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✅ فایل JSON با موفقیت دانلود شد! (${title})`, "success");
  }

  // راه‌اندازی رویدادها
  document.addEventListener("DOMContentLoaded", function () {
    buildIconGrid();
    buildColorGrid();
    buildCellColorPalette();
    rebuildPreviewTable();

    editorArea.addEventListener("input", updatePreview);
    editorArea.addEventListener("keyup", updatePreview);
    editorArea.addEventListener("click", updatePreview);

    document
      .querySelectorAll(".editor-toolbar .tool-btn[data-tag]")
      .forEach((btn) => {
        btn.addEventListener("click", function () {
          insertTag(this.dataset.tag);
        });
      });

    document.getElementById("imageBtn").addEventListener("click", function () {
      const url = prompt(
        "لینک تصویر را وارد کنید:",
        "https://via.placeholder.com/400x200?text=Chess",
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
            "warning",
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
          showToast("⚠️ لطفاً فقط یک بخش ساده از متن را انتخاب کنید", "error");
        }
      });

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
          tablePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        document.getElementById("rowCountDisplay").textContent = tableRowCount;
        document.getElementById("colCountDisplay").textContent = tableColCount;
        rebuildPreviewTable();
        buildCellColorPalette();
        selectedTableCell = null;
        showToast("🔄 جدول بازنشانی شد", "warning");
      });

    document
      .getElementById("resetFormBtn")
      .addEventListener("click", resetForm);
    document
      .getElementById("exportJsonBtn")
      .addEventListener("click", exportJSON);

    document.addEventListener("click", function (e) {
      if (tablePanel.style.display === "block") {
        const isInsidePanel = tablePanel.contains(e.target);
        const isTableBtn = e.target.closest("#toggleTablePanelBtn");
        if (!isInsidePanel && !isTableBtn) {
          const isInEditor = e.target.closest(".editor-wrapper");
          if (!isInEditor) tablePanel.style.display = "none";
        }
      }
    });
  });
})();
