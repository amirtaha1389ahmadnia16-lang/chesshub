/* ============================================
   🤝 ChessHub | منطق صفحه‌ی همکاری در گشایش‌ها
   --------------------------------------------
   - فرم کامل گشایش + واریانت‌ها (تله، نمونه بازی،
     حرکات پرتکرار، آمار، ارزیابی، ایده‌ها ...)
   - انتشار در سایت: localStorage با کلید
     chesshub_user_openings — صفحه‌ی گشایش‌ها به‌صورت
     خودکار آن‌ها را در دسته‌بندی درست قرار می‌دهد
   - نام نویسنده: فقط یک بار پرسیده می‌شود و از
     js/author.js (window.ChessHubAuthor) خوانده و
     ذخیره می‌شود؛ همین نام برای دروس هم استفاده
     می‌شود (window.ChessHubAuthorName)
   - ویرایش گشایش: opening-coop.html?edit=<id>
     (فقط نویسنده‌ی همان گشایش اجازه‌ی ویرایش دارد)
   ============================================ */
(function () {
  "use strict";

  // ===== اعمال تم ذخیره‌شده (قبل از رندر برای جلوگیری از پرش) =====
  (function applySavedTheme() {
    try {
      const settings = JSON.parse(
        localStorage.getItem("chesshub_settings")
      );
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
  const STORAGE_KEY = "chesshub_user_openings";
  const OPENINGS_URL = "openings.html";
  const AUTO_CATEGORY_NAMES = {
    e4: "گشایش‌های 1.e4",
    d4: "گشایش‌های 1.d4",
    c4: "گشایش‌های 1.c4",
    Nf3: "گشایش‌های 1.Nf3",
    other: "سایر گشایش‌ها",
  };

  // ===== DOM refs =====
  const variantsContainer = document.getElementById("variantsContainer");
  const publishBtn = document.getElementById("publishBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const resetBtn = document.getElementById("resetBtn");
  const addVariantBtn = document.getElementById("addVariantBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
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

  let variantCounter = 0;
  let editingOpening = null; // گشایش در حال ویرایش (اگر حالت ویرایش فعال باشد)
  let pendingPublish = false; // ادامه‌ی انتشار پس از انتخاب نام نویسنده

  // ===== نام نویسنده (مشترک با بخش دروس) =====
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
      showToast(
        "✅ خوش آمدید، " + window.ChessHubAuthor.name + "!",
        "success"
      );
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

  // ===== ذخیره‌سازی گشایش‌های کاربر =====
  function loadUserOpenings() {
    try {
      const list = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "[]"
      );
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveUserOpenings(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

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

  // ===== ساخت HTML واریانت =====
  function createVariantHTML(index) {
    const num = index + 1;
    return `
      <div class="variant-entry" data-index="${index}">
        <button class="remove-variant" data-index="${index}" title="حذف واریانت">✕</button>
        <div class="variant-header">
          <span class="num-badge">${num}</span>
          <span class="title">واریانت ${num}</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>نام واریانت <span class="required">*</span></label>
            <input type="text" class="variant-name" placeholder="مثلاً: واریانت ناژدورف" />
          </div>
          <div class="form-group">
            <label>حرکات واریانت <span class="required">*</span></label>
            <input type="text" class="variant-moves" placeholder="مثلاً: e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6" />
          </div>
        </div>
        <div class="form-row three">
          <div class="form-group">
            <label>برد سفید (%)</label>
            <input type="number" class="variant-white-wins" placeholder="مثلاً: 38" min="0" max="100" />
          </div>
          <div class="form-group">
            <label>برد سیاه (%)</label>
            <input type="number" class="variant-black-wins" placeholder="مثلاً: 32" min="0" max="100" />
          </div>
          <div class="form-group">
            <label>مساوی (%)</label>
            <input type="number" class="variant-draws" placeholder="مثلاً: 30" min="0" max="100" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>نقاط قوت</label>
            <textarea class="variant-strengths" placeholder="هر خط یک مورد&#10;مثلاً: انعطاف‌پذیری بالا" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>نقاط ضعف</label>
            <textarea class="variant-weaknesses" placeholder="هر خط یک مورد&#10;مثلاً: توسعه نیافتن سریع فیل" rows="2"></textarea>
          </div>
        </div>
        <div class="form-group">
          <label>حرکات پرتکرار</label>
          <div class="popular-moves-container"></div>
          <button class="add-btn green add-pop-btn" type="button">➕ افزودن حرکت پرتکرار</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>ارزیابی (امتیاز)</label>
            <input type="text" class="variant-score" placeholder="مثلاً: +0.3" />
          </div>
          <div class="form-group">
            <label>ارزیابی (توضیح)</label>
            <input type="text" class="variant-summary" placeholder="مثلاً: سفید برتری اندکی دارد" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>ایده‌ها و طرح‌ها</label>
            <textarea class="variant-ideas" placeholder="هر خط یک مورد&#10;مثلاً: سفید: حمله در جناح شاه" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>آخر بازی‌های احتمالی</label>
            <textarea class="variant-endgames" placeholder="هر خط یک مورد&#10;مثلاً: آخر بازی رخ و پیاده" rows="2"></textarea>
          </div>
        </div>
        <div class="form-group">
          <label>تله‌ها</label>
          <div class="traps-container"></div>
          <button class="add-btn amber add-trap-btn" type="button">➕ افزودن تله</button>
        </div>
        <div class="form-group">
          <label>نمونه بازی‌ها</label>
          <div class="games-container"></div>
          <button class="add-btn purple add-game-btn" type="button">➕ افزودن نمونه بازی</button>
        </div>
      </div>
    `;
  }

  function addVariant(data) {
    variantCounter++;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = createVariantHTML(variantCounter - 1);
    const entry = wrapper.firstElementChild;
    variantsContainer.appendChild(entry);

    const popContainer = entry.querySelector(".popular-moves-container");
    const trapContainer = entry.querySelector(".traps-container");
    const gameContainer = entry.querySelector(".games-container");

    if (data) {
      // حالت ویرایش: پر کردن فیلدها از داده‌ی ذخیره‌شده
      entry.querySelector(".variant-name").value = data.name || "";
      entry.querySelector(".variant-moves").value = (data.moves || []).join(
        " "
      );
      entry.querySelector(".variant-white-wins").value =
        data.stats && data.stats.whiteWins != null
          ? data.stats.whiteWins
          : "";
      entry.querySelector(".variant-black-wins").value =
        data.stats && data.stats.blackWins != null
          ? data.stats.blackWins
          : "";
      entry.querySelector(".variant-draws").value =
        data.stats && data.stats.draws != null ? data.stats.draws : "";
      entry.querySelector(".variant-strengths").value = (
        data.strengths || []
      ).join("\n");
      entry.querySelector(".variant-weaknesses").value = (
        data.weaknesses || []
      ).join("\n");
      entry.querySelector(".variant-score").value =
        (data.evaluation && data.evaluation.score) || "";
      entry.querySelector(".variant-summary").value =
        (data.evaluation && data.evaluation.summary) || "";
      entry.querySelector(".variant-ideas").value = (data.ideas || []).join(
        "\n"
      );
      entry.querySelector(".variant-endgames").value = (
        data.endgames || []
      ).join("\n");

      popContainer.innerHTML = "";
      const pops =
        data.popularMoves && data.popularMoves.length
          ? data.popularMoves
          : [null];
      pops.forEach((pm) =>
        popContainer.appendChild(createPopularMoveEntry(pm || undefined))
      );

      trapContainer.innerHTML = "";
      const traps = data.traps && data.traps.length ? data.traps : [null];
      traps.forEach((t) =>
        trapContainer.appendChild(createTrapEntry(t || undefined))
      );

      gameContainer.innerHTML = "";
      const games =
        data.sampleGames && data.sampleGames.length
          ? data.sampleGames
          : [null];
      games.forEach((g) =>
        gameContainer.appendChild(createGameEntry(g || undefined))
      );
    } else {
      // واریانت جدید: یک زیرورودی پیش‌فرض برای هر بخش
      popContainer.appendChild(createPopularMoveEntry());
      trapContainer.appendChild(createTrapEntry());
      gameContainer.appendChild(createGameEntry());
      showToast("✅ واریانت جدید اضافه شد", "success");
    }

    entry
      .querySelector(".remove-variant")
      .addEventListener("click", function () {
        removeVariant(this);
      });
  }

  function removeVariant(btn) {
    if (variantsContainer.children.length <= 1) {
      showToast("❌ حداقل یک واریانت باید وجود داشته باشد", "error");
      return;
    }
    const entry = btn.closest(".variant-entry");
    entry.remove();
    // به‌روزرسانی شماره‌ها
    variantsContainer
      .querySelectorAll(".variant-entry")
      .forEach((el, i) => {
        const num = el.querySelector(".num-badge");
        const title = el.querySelector(".variant-header .title");
        if (num) num.textContent = i + 1;
        if (title) title.textContent = `واریانت ${i + 1}`;
        el.dataset.index = i;
      });
    showToast("🗑️ واریانت حذف شد", "warning");
  }

  // ===== زیرورودی‌ها (با پشتیبانی داده برای حالت ویرایش) =====
  function createPopularMoveEntry(data) {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group">
          <label>حرکت (SAN)</label>
          <input type="text" class="pop-move-san" placeholder="مثلاً: 6.Bg5" />
        </div>
        <div class="form-group">
          <label>توضیح</label>
          <input type="text" class="pop-move-desc" placeholder="مثلاً: حمله ریشتر-رائوزر" />
        </div>
        <div class="form-group">
          <label>حرکات</label>
          <input type="text" class="pop-move-moves" placeholder="مثلاً: Bg5 e6 f4" />
        </div>
      </div>
    `;
    if (data) {
      div.querySelector(".pop-move-san").value = data.san || "";
      div.querySelector(".pop-move-desc").value = data.description || "";
      div.querySelector(".pop-move-moves").value = (data.moves || []).join(
        " "
      );
    }
    div
      .querySelector(".remove-sub")
      .addEventListener("click", function () {
        removeSubEntry(this);
      });
    return div;
  }

  function createTrapEntry(data) {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group">
          <label>نام تله</label>
          <input type="text" class="trap-name" placeholder="مثلاً: تله مسموم" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>حرکات تله</label>
          <input type="text" class="trap-moves" placeholder="مثلاً: e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2 Rb1" />
        </div>
      </div>
    `;
    if (data) {
      div.querySelector(".trap-name").value = data.name || "";
      div.querySelector(".trap-moves").value = (data.moves || []).join(" ");
    }
    div
      .querySelector(".remove-sub")
      .addEventListener("click", function () {
        removeSubEntry(this);
      });
    return div;
  }

  function createGameEntry(data) {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group">
          <label>سفید</label>
          <input type="text" class="game-white" placeholder="نام بازیکن سفید" />
        </div>
        <div class="form-group">
          <label>سیاه</label>
          <input type="text" class="game-black" placeholder="نام بازیکن سیاه" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>سال</label>
          <input type="number" class="game-year" placeholder="مثلاً: 1972" />
        </div>
        <div class="form-group">
          <label>نتیجه</label>
          <select class="game-result">
            <option value="1-0">برد سفید</option>
            <option value="0-1">برد سیاه</option>
            <option value="1/2-1/2">مساوی</option>
          </select>
        </div>
      </div>
      <div class="form-row single">
        <div class="form-group">
          <label>حرکات PGN</label>
          <textarea class="game-pgn" placeholder="حرکات بازی به فرمت PGN&#10;مثلاً: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" rows="2"></textarea>
        </div>
      </div>
    `;
    if (data) {
      div.querySelector(".game-white").value = data.white || "";
      div.querySelector(".game-black").value = data.black || "";
      div.querySelector(".game-year").value = data.year || "";
      div.querySelector(".game-result").value = data.result || "1-0";
      div.querySelector(".game-pgn").value = data.pgn || "";
    }
    div
      .querySelector(".remove-sub")
      .addEventListener("click", function () {
        removeSubEntry(this);
      });
    return div;
  }

  // افزودن زیرورودی (از طریق رویدادهای تفویض‌شده)
  function addPopularMove(btn) {
    const container = btn.previousElementSibling;
    container.appendChild(createPopularMoveEntry());
    showToast("✅ حرکت پرتکرار اضافه شد", "success");
  }

  function addTrap(btn) {
    const container = btn.previousElementSibling;
    container.appendChild(createTrapEntry());
    showToast("✅ تله اضافه شد", "success");
  }

  function addGame(btn) {
    const container = btn.previousElementSibling;
    container.appendChild(createGameEntry());
    showToast("✅ نمونه بازی اضافه شد", "success");
  }

  function removeSubEntry(btn) {
    const container = btn.closest(".sub-entry").parentElement;
    if (container.children.length <= 1) {
      showToast("❌ حداقل یک آیتم باید وجود داشته باشد", "error");
      return;
    }
    btn.closest(".sub-entry").remove();
    showToast("🗑️ آیتم حذف شد", "warning");
  }

  // تفویض رویداد برای دکمه‌های «افزودن» داخل واریانت‌ها
  // (جایگزین مطمئن onclick اینلاین برای توابع داخلی IIFE)
  variantsContainer.addEventListener("click", function (e) {
    const popBtn = e.target.closest(".add-pop-btn");
    if (popBtn) {
      addPopularMove(popBtn);
      return;
    }
    const trapBtn = e.target.closest(".add-trap-btn");
    if (trapBtn) {
      addTrap(trapBtn);
      return;
    }
    const gameBtn = e.target.closest(".add-game-btn");
    if (gameBtn) {
      addGame(gameBtn);
    }
  });

  // ===== جمع‌آوری و اعتبارسنجی داده‌ها =====
  function collectOpeningData() {
    const openingName = document
      .getElementById("openingName")
      .value.trim();
    const categoryCode = document.getElementById("categoryCode").value;
    let categoryName = document
      .getElementById("categoryName")
      .value.trim();
    const openingMoves = document
      .getElementById("openingMoves")
      .value.trim();

    if (!openingName) {
      showToast("❌ لطفاً نام گشایش را وارد کنید", "error");
      return null;
    }
    if (!openingMoves) {
      showToast("❌ لطفاً حرکات اصلی گشایش را وارد کنید", "error");
      return null;
    }
    if (!categoryName) {
      categoryName = AUTO_CATEGORY_NAMES[categoryCode] || "سایر گشایش‌ها";
    }

    const variantElements = document.querySelectorAll(".variant-entry");
    const variants = [];

    for (const el of variantElements) {
      const name = el.querySelector(".variant-name").value.trim();
      const moves = el.querySelector(".variant-moves").value.trim();

      if (!name || !moves) {
        showToast(
          "❌ لطفاً نام و حرکات همه واریانت‌ها را کامل کنید",
          "error"
        );
        return null;
      }

      const whiteWins =
        parseInt(el.querySelector(".variant-white-wins").value) || 0;
      const blackWins =
        parseInt(el.querySelector(".variant-black-wins").value) || 0;
      const draws =
        parseInt(el.querySelector(".variant-draws").value) || 0;

      const strengths = el
        .querySelector(".variant-strengths")
        .value.split("\n")
        .filter((s) => s.trim());
      const weaknesses = el
        .querySelector(".variant-weaknesses")
        .value.split("\n")
        .filter((s) => s.trim());

      const popularMoves = [];
      el.querySelectorAll(".popular-moves-container .sub-entry").forEach(
        (sub) => {
          const san = sub.querySelector(".pop-move-san").value.trim();
          if (san) {
            popularMoves.push({
              san: san,
              description:
                sub.querySelector(".pop-move-desc").value.trim() || "",
              moves: sub
                .querySelector(".pop-move-moves")
                .value.trim()
                .split(/\s+/)
                .filter(Boolean),
            });
          }
        }
      );

      const score =
        el.querySelector(".variant-score").value.trim() || "0.0";
      const summary =
        el.querySelector(".variant-summary").value.trim() || "";

      const ideas = el
        .querySelector(".variant-ideas")
        .value.split("\n")
        .filter((s) => s.trim());
      const endgames = el
        .querySelector(".variant-endgames")
        .value.split("\n")
        .filter((s) => s.trim());

      const traps = [];
      el.querySelectorAll(".traps-container .sub-entry").forEach((sub) => {
        const nameTrap = sub.querySelector(".trap-name").value.trim();
        const movesTrap = sub.querySelector(".trap-moves").value.trim();
        if (nameTrap && movesTrap) {
          traps.push({ name: nameTrap, moves: movesTrap.split(/\s+/) });
        }
      });

      const sampleGames = [];
      el.querySelectorAll(".games-container .sub-entry").forEach((sub) => {
        const white = sub.querySelector(".game-white").value.trim();
        const black = sub.querySelector(".game-black").value.trim();
        if (white && black) {
          const year =
            parseInt(sub.querySelector(".game-year").value) || 0;
          const result = sub.querySelector(".game-result").value;
          const gameObj = { white, black, year, result };
          const pgn = sub.querySelector(".game-pgn").value.trim();
          if (pgn) gameObj.pgn = pgn;
          sampleGames.push(gameObj);
        }
      });

      variants.push({
        name,
        moves: moves.split(/\s+/),
        stats: { whiteWins, blackWins, draws },
        strengths,
        weaknesses,
        popularMoves,
        evaluation: { score, summary },
        ideas,
        endgames,
        traps,
        sampleGames,
      });
    }

    if (variants.length === 0) {
      showToast("❌ حداقل یک واریانت معتبر وارد کنید", "error");
      return null;
    }

    return {
      name: openingName,
      moves: openingMoves.split(/\s+/),
      categoryCode,
      categoryName,
      variants,
    };
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

  function doPublish() {
    const author = currentAuthor();
    if (!author) {
      // اگر به هر دلیلی نام از بین رفته باشد، دوباره پرسیده می‌شود
      pendingPublish = true;
      showAuthorModal();
      return;
    }

    const data = collectOpeningData();
    if (!data) return;

    const now = Date.now();
    const list = loadUserOpenings();

    if (editingOpening) {
      let idx = list.findIndex(
        (o) => String(o.id) === String(editingOpening.id)
      );
      if (idx === -1) {
        // گشایش فقط روی سرور بود (ویرایش بین‌دستگاهی) — به این دستگاه هم می‌آید
        list.unshift(Object.assign({}, editingOpening));
        idx = 0;
      }
      list[idx] = Object.assign({}, list[idx], data, {
        thumbIcon: list[idx].thumbIcon || "fas fa-chess-queen",
        color: list[idx].color || "#2c7da0",
        author: author,
        updatedAt: now,
      });
      if (!saveUserOpenings(list)) {
        showToast(
          "❌ ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست",
          "error"
        );
        return;
      }
      editingOpening = list[idx];
      showToast("✅ تغییرات گشایش با موفقیت ذخیره شد!", "success");
      showSuccess(true);
      syncToServer(list[idx], false);
    } else {
      const opening = Object.assign({}, data, {
        id: "u_" + now,
        thumbIcon: "fas fa-chess-queen",
        color: "#2c7da0",
        author: author,
        createdAt: now,
        updatedAt: now,
      });
      list.unshift(opening);
      if (!saveUserOpenings(list)) {
        showToast(
          "❌ ذخیره‌سازی ممکن نشد؛ حافظه‌ی مرورگر در دسترس نیست",
          "error"
        );
        return;
      }
      editingOpening = opening;
      showToast("✅ گشایش شما با موفقیت منتشر شد!", "success");
      showSuccess(false);
      syncToServer(opening, true);
    }
  }

  // 🌍 انتشار عمومی روی سرور — گشایش برای «همه‌ی کاربران سایت» نمایش داده می‌شود
  function syncToServer(localItem, isNew) {
    if (!window.CommunityHub) return;
    const serverId = localItem.serverId || null;
    const payload = {
      name: localItem.name,
      moves: localItem.moves,
      categoryCode: localItem.categoryCode,
      categoryName: localItem.categoryName,
      thumbIcon: localItem.thumbIcon,
      color: localItem.color,
      variants: localItem.variants,
      author: localItem.author,
    };
    CommunityHub.save(
      "openings",
      serverId ? "update" : "publish",
      serverId || localItem.id,
      payload
    )
      .then(function (j) {
        if (j.item && j.item.id) {
          const list = loadUserOpenings();
          const it = list.find(
            (o) => String(o.id) === String(localItem.id)
          );
          if (it) {
            it.serverId = j.item.id;
            saveUserOpenings(list);
            if (
              editingOpening &&
              String(editingOpening.id) === String(it.id)
            ) {
              editingOpening.serverId = j.item.id;
            }
          }
        }
        showToast(
          isNew
            ? "🌍 گشایش برای همه‌ی کاربران سایت منتشر شد!"
            : "🌍 تغییرات برای همه‌ی کاربران سایت به‌روزرسانی شد",
          "success"
        );
      })
      .catch(function (err) {
        showToast(
          "⚠️ در این دستگاه ذخیره شد، اما انتشار عمومی ناموفق بود: " +
            err.message,
          "warning"
        );
      });
  }

  function showSuccess(isUpdate) {
    const author = currentAuthor();
    successTitle.textContent = isUpdate
      ? "گشایش شما به‌روزرسانی شد!"
      : "گشایش شما منتشر شد!";
    successText.textContent =
      "نویسنده: " +
      author +
      " — گشایش شما به‌صورت خودکار در دسته‌ی درست از دانشنامه‌ی گشایش‌ها قرار گرفت.";
    successModal.classList.add("open");
  }

  function resetToNewOpening() {
    successModal.classList.remove("open");
    resetForm(false);
  }

  function restorePublishButton() {
    publishBtn.innerHTML =
      '<i class="fas fa-paper-plane"></i> انتشار در سایت';
  }

  // ===== خروجی JSON (پشتیبان‌گیری/انتقال دستی) =====
  function exportJSON() {
    const data = collectOpeningData();
    if (!data) return;

    const openingData = Object.assign({}, data, {
      id: editingOpening ? editingOpening.id : "u_" + Date.now(),
      thumbIcon: "fas fa-chess-queen",
      color: "#2c7da0",
      author: currentAuthor(),
    });

    const json = JSON.stringify(openingData, null, 2);
    const blob = new Blob([json], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opening_${data.name.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      `✅ فایل JSON با موفقیت دانلود شد! (${data.variants.length} واریانت)`,
      "success"
    );
  }

  // ===== ریست فرم =====
  function resetForm(needsConfirm) {
    if (needsConfirm) {
      if (!confirm("آیا مطمئنی؟ تمام اطلاعات فرم پاک می‌شود.")) return;
    }
    document
      .querySelectorAll(
        "#coopForm input, #coopForm textarea, #coopForm select"
      )
      .forEach((el) => {
        if (el.tagName === "SELECT") el.selectedIndex = 0;
        else el.value = "";
      });
    // ریست واریانت‌ها
    variantsContainer.innerHTML = "";
    variantCounter = 0;
    addVariant();
    editingOpening = null;
    editModeBanner.style.display = "none";
    restorePublishButton();
    try {
      history.replaceState(null, "", "opening-coop.html");
    } catch (e) {}
    if (needsConfirm) showToast("🔄 فرم پاک شد", "warning");
  }

  // ===== حالت ویرایش (opening-coop.html?edit=<id>) =====
  function loadEditingOpening() {
    let editId = null;
    try {
      editId = new URLSearchParams(window.location.search).get("edit");
    } catch (e) {
      return;
    }
    if (!editId) return;

    const opening = loadUserOpenings().find(
      (o) => String(o.id) === String(editId)
    );
    if (!opening) {
      // 🔁 در این دستگاه نیست — شاید گشایش عمومی سرور باشد
      if (window.CommunityHub) {
        CommunityHub.fetchAll()
          .then(function (c) {
            const remote = (c.openings || []).find(
              (o) => String(o.id) === String(editId)
            );
            if (remote)
              applyEditMode(
                Object.assign({}, remote, { serverId: remote.id })
              );
            else showToast("❌ گشایش مورد نظر برای ویرایش پیدا نشد", "error");
          })
          .catch(function () {
            showToast("❌ گشایش مورد نظر برای ویرایش پیدا نشد", "error");
          });
      } else {
        showToast("❌ گشایش مورد نظر برای ویرایش پیدا نشد", "error");
      }
      return;
    }
    applyEditMode(opening);
  }

  function applyEditMode(opening) {
    // فقط نویسنده‌ی همان گشایش حق ویرایش دارد
    const author = currentAuthor();
    if (author && opening.author && opening.author !== author) {
      showToast(
        "⚠️ فقط نویسنده‌ی گشایش می‌تواند آن را ویرایش کند",
        "warning"
      );
      return;
    }

    editingOpening = opening;

    document.getElementById("openingName").value = opening.name || "";
    document.getElementById("categoryCode").value =
      opening.categoryCode || "e4";
    const autoName = AUTO_CATEGORY_NAMES[opening.categoryCode];
    document.getElementById("categoryName").value =
      opening.categoryName && opening.categoryName !== autoName
        ? opening.categoryName
        : "";
    document.getElementById("openingMoves").value = (
      opening.moves || []
    ).join(" ");

    variantsContainer.innerHTML = "";
    variantCounter = 0;
    const variants =
      Array.isArray(opening.variants) && opening.variants.length
        ? opening.variants
        : [null];
    variants.forEach((v) => addVariant(v || undefined));

    editModeTitle.textContent = opening.name || "بدون نام";
    editModeBanner.style.display = "flex";
    publishBtn.innerHTML = '<i class="fas fa-save"></i> ذخیره تغییرات';

    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("📝 در حال ویرایش گشایش ذخیره‌شده شما", "info");
  }

  // ===== دکمه‌های اصلی =====
  publishBtn.addEventListener("click", publishFlow);
  downloadBtn.addEventListener("click", exportJSON);
  resetBtn.addEventListener("click", function () {
    resetForm(true);
  });
  addVariantBtn.addEventListener("click", function () {
    addVariant();
  });
  cancelEditBtn.addEventListener("click", function () {
    resetForm(false);
    showToast("انصراف از ویرایش؛ فرم برای گشایش جدید آماده است", "info");
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
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && authorModal.classList.contains("open")) {
      pendingPublish = false;
      hideAuthorModal();
    }
  });

  // ===== مودال انتشار موفق =====
  createAnotherBtn.addEventListener("click", resetToNewOpening);

  // ===== مقداردهی اولیه =====
  document.addEventListener("DOMContentLoaded", function () {
    variantsContainer.innerHTML = "";
    variantCounter = 0;

    updateAuthorChip();
    loadEditingOpening();

    // اگر حالت ویرایش واریانتی نساخته، یک واریانت پیش‌فرض بساز
    if (!variantsContainer.children.length) {
      addVariant();
    }

    console.log(
      "✅ ChessHub Cooperation - Openings loaded successfully"
    );
  });
})();
