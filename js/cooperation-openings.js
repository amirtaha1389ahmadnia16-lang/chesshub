(function () {
  "use strict";

  // اعمال تم ذخیره شده
  try {
    const settings = JSON.parse(localStorage.getItem("chesshub_settings"));
    if (settings && settings.theme)
      document.body.classList.add(`theme-${settings.theme}`);
  } catch (e) {}

  const variantsContainer = document.getElementById("variantsContainer");
  let variantCounter = 0;

  function createVariantHTML(index) {
    const num = index + 1;
    return `
      <div class="variant-entry" data-index="${index}">
        <button class="remove-variant" title="حذف واریانت">✕</button>
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
          <button class="add-btn green add-sub-btn" data-type="popular">➕ افزودن حرکت پرتکرار</button>
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
          <button class="add-btn amber add-sub-btn" data-type="trap">➕ افزودن تله</button>
        </div>
        <div class="form-group">
          <label>نمونه بازی‌ها</label>
          <div class="games-container"></div>
          <button class="add-btn purple add-sub-btn" data-type="game">➕ افزودن نمونه بازی</button>
        </div>
      </div>
    `;
  }

  function createPopularMoveEntry() {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group"><label>حرکت (SAN)</label><input type="text" class="pop-move-san" placeholder="مثلاً: 6.Bg5" /></div>
        <div class="form-group"><label>توضیح</label><input type="text" class="pop-move-desc" placeholder="مثلاً: حمله ریشتر-رائوزر" /></div>
        <div class="form-group"><label>حرکات</label><input type="text" class="pop-move-moves" placeholder="مثلاً: Bg5 e6 f4" /></div>
      </div>
    `;
    return div;
  }

  function createTrapEntry() {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group"><label>نام تله</label><input type="text" class="trap-name" placeholder="مثلاً: تله مسموم" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>حرکات تله</label><input type="text" class="trap-moves" placeholder="مثلاً: e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2 Rb1" /></div>
      </div>
    `;
    return div;
  }

  function createGameEntry() {
    const div = document.createElement("div");
    div.className = "sub-entry";
    div.innerHTML = `
      <button class="remove-sub" title="حذف">✕</button>
      <div class="form-row">
        <div class="form-group"><label>سفید</label><input type="text" class="game-white" placeholder="نام بازیکن سفید" /></div>
        <div class="form-group"><label>سیاه</label><input type="text" class="game-black" placeholder="نام بازیکن سیاه" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>سال</label><input type="number" class="game-year" placeholder="مثلاً: 1972" /></div>
        <div class="form-group"><label>نتیجه</label><select class="game-result"><option value="1-0">برد سفید</option><option value="0-1">برد سیاه</option><option value="1/2-1/2">مساوی</option></select></div>
      </div>
      <div class="form-row single">
        <div class="form-group"><label>حرکات PGN</label><textarea class="game-pgn" placeholder="حرکات بازی به فرمت PGN&#10;مثلاً: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" rows="2"></textarea></div>
      </div>
    `;
    return div;
  }

  function addVariant() {
    variantCounter++;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = createVariantHTML(variantCounter - 1);
    const entry = wrapper.firstElementChild;
    variantsContainer.appendChild(entry);

    // افزودن یک زیر-ورودی پیش‌فرض
    entry
      .querySelector(".popular-moves-container")
      .appendChild(createPopularMoveEntry());
    entry.querySelector(".traps-container").appendChild(createTrapEntry());
    entry.querySelector(".games-container").appendChild(createGameEntry());

    // رویدادهای دکمه‌های داخل واریانت
    entry
      .querySelector(".remove-variant")
      .addEventListener("click", function () {
        removeVariant(this);
      });

    entry.querySelectorAll(".add-sub-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const type = this.dataset.type;
        const container = this.previousElementSibling;
        let newEntry;
        if (type === "popular") newEntry = createPopularMoveEntry();
        else if (type === "trap") newEntry = createTrapEntry();
        else if (type === "game") newEntry = createGameEntry();
        if (newEntry) {
          container.appendChild(newEntry);
          showToast("✅ آیتم جدید اضافه شد", "success");
        }
      });
    });

    entry.querySelectorAll(".remove-sub").forEach((btn) => {
      btn.addEventListener("click", function () {
        removeSubEntry(this);
      });
    });

    showToast("✅ واریانت جدید اضافه شد", "success");
  }

  function removeVariant(btn) {
    if (variantsContainer.children.length <= 1) {
      showToast("❌ حداقل یک واریانت باید وجود داشته باشد", "error");
      return;
    }
    btn.closest(".variant-entry").remove();
    variantsContainer.querySelectorAll(".variant-entry").forEach((el, i) => {
      el.querySelector(".num-badge").textContent = i + 1;
      el.querySelector(".variant-header .title").textContent =
        `واریانت ${i + 1}`;
      el.dataset.index = i;
    });
    showToast("🗑️ واریانت حذف شد", "warning");
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
      .querySelectorAll("#coopForm input, #coopForm textarea, #coopForm select")
      .forEach((el) => {
        if (el.type === "checkbox" || el.type === "radio") el.checked = false;
        else if (el.tagName === "SELECT") el.selectedIndex = 0;
        else el.value = "";
      });
    variantsContainer.innerHTML = "";
    variantCounter = 0;
    addVariant();
    showToast("🔄 فرم پاک شد", "warning");
  }

  function exportJSON() {
    const openingName = document.getElementById("openingName").value.trim();
    const categoryCode = document.getElementById("categoryCode").value;
    let categoryName = document.getElementById("categoryName").value.trim();
    const openingMoves = document.getElementById("openingMoves").value.trim();

    if (!openingName)
      return showToast("❌ لطفاً نام گشایش را وارد کنید", "error");
    if (!openingMoves)
      return showToast("❌ لطفاً حرکات اصلی گشایش را وارد کنید", "error");

    if (!categoryName) {
      const names = {
        e4: "گشایش‌های 1.e4",
        d4: "گشایش‌های 1.d4",
        c4: "گشایش‌های 1.c4",
        Nf3: "گشایش‌های 1.Nf3",
        other: "سایر گشایش‌ها",
      };
      categoryName = names[categoryCode] || "سایر گشایش‌ها";
    }

    const variants = [];
    const variantElements = document.querySelectorAll(".variant-entry");

    for (const el of variantElements) {
      const name = el.querySelector(".variant-name").value.trim();
      const moves = el.querySelector(".variant-moves").value.trim();
      if (!name || !moves)
        return showToast(
          "❌ لطفاً نام و حرکات همه واریانت‌ها را کامل کنید",
          "error",
        );

      const whiteWins =
        parseInt(el.querySelector(".variant-white-wins").value) || 0;
      const blackWins =
        parseInt(el.querySelector(".variant-black-wins").value) || 0;
      const draws = parseInt(el.querySelector(".variant-draws").value) || 0;
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
        },
      );

      const score = el.querySelector(".variant-score").value.trim() || "0.0";
      const summary = el.querySelector(".variant-summary").value.trim() || "";
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
        if (nameTrap && movesTrap)
          traps.push({ name: nameTrap, moves: movesTrap.split(/\s+/) });
      });

      const sampleGames = [];
      el.querySelectorAll(".games-container .sub-entry").forEach((sub) => {
        const white = sub.querySelector(".game-white").value.trim();
        const black = sub.querySelector(".game-black").value.trim();
        if (white && black) {
          const year = parseInt(sub.querySelector(".game-year").value) || 0;
          const result = sub.querySelector(".game-result").value;
          const pgn = sub.querySelector(".game-pgn").value.trim();
          const gameObj = { white, black, year, result };
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

    if (variants.length === 0)
      return showToast("❌ حداقل یک واریانت معتبر وارد کنید", "error");

    const output = {
      categories: [
        {
          name: categoryName,
          code: categoryCode,
          openings: [
            {
              name: openingName,
              moves: openingMoves.split(/\s+/),
              thumbIcon: "fas fa-chess-queen",
              color: "#2c7da0",
              variants: variants,
            },
          ],
        },
      ],
    };

    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opening_${openingName.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(
      `✅ فایل JSON با موفقیت دانلود شد! (${variants.length} واریانت)`,
      "success",
    );
  }

  // راه‌اندازی
  document.addEventListener("DOMContentLoaded", function () {
    variantsContainer.innerHTML = "";
    variantCounter = 0;
    addVariant();

    document
      .getElementById("addVariantBtn")
      .addEventListener("click", addVariant);
    document.getElementById("resetBtn").addEventListener("click", resetForm);
    document.getElementById("exportBtn").addEventListener("click", exportJSON);
  });
})();
