/* ============================================
   👤 ChessHub | سیستم سراسری پروفایل
   --------------------------------------------
   هر بازدیدکننده فقط «یک بار» در ابتدای ورود:
     ۱) یک نام کاربری یکتا انتخاب می‌کند
     ۲) یک پروفایل (آواتار) از گزینه‌ها برمی‌دارد

   همین یک نام در «کل سایت» استفاده می‌شود:
     • نام بازیکن در بازی آنلاین (با ریتینگ)
     • نام نویسنده در مقالات
     • نام نویسنده در دروس
     • نام نویسنده در گشایش‌ها

   🔒 نام کاربری برای همیشه قفل است؛ اما آواتار
      هر زمان از مودال پروفایل قابل تغییر است:
     POST /api/username/avatar   {name, avatar}

   یکتایی نام روی سرور تضمین می‌شود:
     GET  /api/username/check?name=...   → آزاد بودن
     POST /api/username/register         → ثبت دائمی
   (دو نفر نمی‌توانند نام یکسان انتخاب کنند؛
    حتی با حروف بزرگ/کوچک متفاوت)

   ذخیره‌سازی:
     localStorage["chesshub_profile"]      = {name, avatar, pendingSync?}
     localStorage["chesshub_author_name"]  = name  ← سازگار با js/author.js

   رویدادها:
     "chesshub:profile-changed"  detail:{name, avatar}
     "chesshub:author-changed"   (توسط author.js)

   API سراسری:
     window.ChessHubProfile.name / .avatar / .has()
     window.ChessHubProfile.openOnboarding(opts)
     window.ChessHubProfile.openAvatarChange()
     window.ChessHubProfile.onChange(cb)
   ============================================ */
window.ChessHubProfile = (function () {
  "use strict";

  const PROFILE_KEY = "chesshub_profile";
  const MIN_LEN = 2;
  const MAX_LEN = 16;
  const AVATAR_COUNT = 8; // images/avatars/1.png … 8.png

  /* ---------------- ذخیره‌سازی ---------------- */
  function read() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      return p && p.name ? p : null;
    } catch (e) {
      return null;
    }
  }

  function store(p) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch (e) {
      /* حالت خصوصی مرورگر */
    }
  }

  let _profile = read();

  function writeAuthorCompat(name) {
    // همگام با js/author.js — نام نویسنده‌ی دروس/گشایش‌ها/مقالات
    try {
      localStorage.setItem("chesshub_author_name", name);
    } catch (e) {}
    if (window.ChessHubAuthor && typeof window.ChessHubAuthor.set === "function") {
      window.ChessHubAuthor.set(name);
    }
  }

  function apply(profile) {
    _profile = profile;
    store(_profile);
    writeAuthorCompat(_profile.name);
    document.dispatchEvent(
      new CustomEvent("chesshub:profile-changed", {
        detail: { name: _profile.name, avatar: _profile.avatar },
      })
    );
  }

  /* ---------------- ابزار ---------------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function avatarSrc(i) {
    return "images/avatars/" + i + ".png";
  }

  function avatarFallback(img, label) {
    img.onerror = function () {
      this.onerror = null;
      this.src =
        "https://ui-avatars.com/api/?background=6d5bd0&color=fff&name=" +
        encodeURIComponent(label || "?");
    };
  }

  /* ---------------- اعتبارسنجی محلی ---------------- */
  function validate(v) {
    const name = String(v == null ? "" : v).trim().replace(/\s+/g, " ");
    if (name.length < MIN_LEN) return "نام کاربری باید حداقل ۲ حرف باشد";
    if (name.length > MAX_LEN) return "نام کاربری حداکثر ۱۶ حرف است";
    if (/[<>"'\\/{}$`]/.test(name))
      return "کاراکترهای خاص (< > \" ' / \\ { } $ `) مجاز نیستند";
    return null;
  }

  /* ---------------- ارتباط با سرور ---------------- */
  async function serverCheck(name) {
    // خروجی: {state:"free"|"taken"|"invalid"|"offline", msg?}
    try {
      const r = await fetch(
        "api/username/check?name=" + encodeURIComponent(name),
        { cache: "no-store" }
      );
      const j = await r.json();
      if (j && j.ok) {
        if (j.available) return { state: "free" };
        return { state: j.error ? "invalid" : "taken", msg: j.error || "این نام قبلاً انتخاب شده است" };
      }
      return { state: "offline" };
    } catch (e) {
      return { state: "offline" };
    }
  }

  async function serverRegister(name, avatar) {
    const r = await fetch("api/username/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, avatar: avatar }),
    });
    return r.json();
  }

  async function serverAvatar(name, avatar) {
    try {
      const r = await fetch("api/username/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, avatar: avatar }),
      });
      return r.json();
    } catch (e) {
      return null;
    }
  }

  // پروفایل‌هایی که آفلاین ثبت شده‌اند → بعد از رسیدن سرور، خودکار ثبت می‌شوند
  async function retryPendingSync() {
    if (!_profile || !_profile.pendingSync) return;
    const res = await serverRegister(_profile.name, _profile.avatar).catch(function () {
      return null;
    });
    if (res && res.ok) {
      delete _profile.pendingSync;
      store(_profile);
    }
  }

  /* ---------------- استایل سراسری ---------------- */
  const CSS =
    ".chp-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;" +
    "background:linear-gradient(135deg,#141c33 0%,#241b52 55%,#372568 100%);padding:1rem;overflow-y:auto}" +
    ".chp-overlay.open{display:flex}" +
    ".chp-card{background:#fff;border-radius:22px;max-width:470px;width:100%;padding:1.8rem 1.6rem 1.5rem;" +
    "box-shadow:0 30px 80px rgba(0,0,0,.45);font-family:inherit;text-align:center;max-height:94vh;overflow-y:auto;" +
    "scrollbar-width:none}" +
    ".chp-card::-webkit-scrollbar{display:none}" +
    ".chp-logo{width:64px;height:64px;border-radius:18px;margin:0 auto .7rem;display:flex;align-items:center;justify-content:center;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;font-size:1.8rem;box-shadow:0 10px 24px rgba(109,91,208,.35)}" +
    ".chp-card h2{margin:0 0 .4rem;color:#17203a;font-size:1.25rem;font-weight:800}" +
    ".chp-card h2 i{color:#6d5bd0}" +
    ".chp-sub{color:#6b7590;font-size:.82rem;line-height:1.9;margin:0 0 1.1rem}" +
    ".chp-sub b{color:#4c3f9e}" +
    ".chp-field{text-align:right;margin-bottom:.9rem}" +
    ".chp-field label{display:block;font-size:.8rem;font-weight:700;color:#17203a;margin-bottom:.4rem}" +
    ".chp-input{width:100%;box-sizing:border-box;padding:.7rem .9rem;border:1.5px solid #e3e7f0;border-radius:12px;" +
    "font-size:.95rem;font-family:inherit;outline:none;transition:border .15s;background:#fafbfe;color:#17203a}" +
    ".chp-input:focus{border-color:#6d5bd0;background:#fff}" +
    ".chp-status{font-size:.75rem;margin-top:.35rem;min-height:1.2em;line-height:1.7}" +
    ".chp-status.free{color:#2f9e6e}.chp-status.taken{color:#e05252}.chp-status.invalid{color:#e05252}" +
    ".chp-status.offline{color:#c07d1a}" +
    ".chp-avatars{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}" +
    ".chp-avatars img{width:100%;aspect-ratio:1;border-radius:14px;cursor:pointer;border:2.5px solid transparent;" +
    "background:#efecfd;transition:transform .12s,border-color .12s;object-fit:cover;padding:2px;box-sizing:border-box}" +
    ".chp-avatars img:hover{transform:translateY(-2px)}" +
    ".chp-avatars img.active{border-color:#6d5bd0;box-shadow:0 4px 14px rgba(109,91,208,.35)}" +
    ".chp-btn{width:100%;margin-top:1.1rem;padding:.85rem;border:none;border-radius:14px;cursor:pointer;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;font-size:1rem;font-weight:800;font-family:inherit;" +
    "transition:opacity .15s,transform .12s}" +
    ".chp-btn:hover:not(:disabled){transform:translateY(-1px)}" +
    ".chp-btn:disabled{opacity:.45;cursor:not-allowed}" +
    ".chp-note{font-size:.7rem;color:#9aa3b8;margin-top:.7rem;line-height:1.8}" +
    /* چیپ پروفایل در هدر */
    ".chp-chip{display:flex;align-items:center;gap:.45rem;background:#efecfd;border:1px solid #e3e7f0;border-radius:999px;" +
    "padding:.25rem .8rem .25rem .45rem;cursor:pointer;font-family:inherit;transition:box-shadow .15s;align-self:center;height:40px}" +
    ".chp-chip:hover{box-shadow:0 3px 12px rgba(109,91,208,.25)}" +
    ".chp-chip img{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#dcd4f7}" +
    ".chp-chip .chp-av-empty{width:30px;height:30px;border-radius:50%;background:#dcd4f7;display:flex;align-items:center;justify-content:center;color:#6d5bd0;font-size:.8rem}" +
    ".chp-chip span{font-size:.78rem;font-weight:700;color:#4c3f9e;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}" +
    /* مودال اطلاعات پروفایل + مودال تغییر آواتار */
    ".chp-info-overlay{position:fixed;inset:0;z-index:99998;display:none;align-items:center;justify-content:center;background:rgba(16,26,48,.55);padding:1rem}" +
    ".chp-info-overlay.open{display:flex}" +
    ".chp-info-card{background:#fff;border-radius:20px;max-width:380px;width:100%;padding:1.6rem;text-align:center;font-family:inherit;" +
    "max-height:92vh;overflow-y:auto;scrollbar-width:none}" +
    ".chp-info-card::-webkit-scrollbar{display:none}" +
    ".chp-info-card img{width:76px;height:76px;border-radius:50%;object-fit:cover;border:3px solid #efecfd;margin-bottom:.6rem}" +
    ".chp-info-card h3{margin:0 0 .2rem;color:#17203a;font-size:1.05rem}" +
    ".chp-info-card p{color:#6b7590;font-size:.78rem;line-height:2;margin:.4rem 0 1rem}" +
    ".chp-info-card p b{color:#4c3f9e}" +
    ".chp-info-actions{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap}" +
    ".chp-info-close{padding:.6rem 1.6rem;border:none;border-radius:12px;background:linear-gradient(135deg,#6d5bd0,#4c3f9e);" +
    "color:#fff;font-weight:700;font-family:inherit;cursor:pointer;font-size:.85rem;transition:transform .12s}" +
    ".chp-info-close:hover{transform:translateY(-1px)}" +
    ".chp-info-close:disabled{opacity:.45;cursor:not-allowed}" +
    ".chp-info-change{padding:.6rem 1.4rem;border:1.5px solid #6d5bd0;border-radius:12px;background:#fff;color:#4c3f9e;" +
    "font-weight:700;font-family:inherit;cursor:pointer;font-size:.85rem;transition:background .12s,transform .12s}" +
    ".chp-info-change:hover{background:#f4f1fe;transform:translateY(-1px)}" +
    ".chp-av-cancel{background:none;border:none;color:#9aa3b8;font-family:inherit;font-size:.75rem;margin-top:.7rem;cursor:pointer;text-decoration:underline}" +
    "@media(max-width:480px){.chp-card{padding:1.3rem 1rem}.chp-avatars{grid-template-columns:repeat(4,1fr);gap:.45rem}" +
    ".chp-info-card{padding:1.3rem 1rem}}";

  function injectCSS() {
    if (document.getElementById("chp-style")) return;
    const st = document.createElement("style");
    st.id = "chp-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- اورلی راه‌اندازی اولیه ---------------- */
  let overlayEl = null;
  let nameInput = null;
  let statusEl = null;
  let submitBtn = null;
  let pickedAvatar = "";
  let checkTimer = null;
  let lastCheckName = null;
  let onDoneCallback = null;

  function setStatus(cls, msg) {
    statusEl.className = "chp-status " + (cls || "");
    statusEl.innerHTML = msg || "";
    refreshSubmit();
  }

  function refreshSubmit() {
    const okName = nameInput.value.trim().length >= MIN_LEN;
    const okAv = !!pickedAvatar;
    const free = statusEl.classList.contains("free");
    submitBtn.disabled = !(okName && okAv && free);
  }

  async function runCheck() {
    const v = validate(nameInput.value);
    if (v) return setStatus("invalid", "⚠️ " + v);
    const name = nameInput.value.trim().replace(/\s+/g, " ");
    if (name === lastCheckName) return;
    lastCheckName = name;
    setStatus("", "<i class='fas fa-spinner fa-pulse'></i> در حال بررسی…");
    const res = await serverCheck(name);
    // اگر کاربر در فاصله‌ی بررسی متن را عوض کرد → این نتیجه کهنه است
    if (nameInput.value.trim().replace(/\s+/g, " ") !== name) return;
    if (res.state === "free") setStatus("free", "✅ «" + esc(name) + "» آزاد است — می‌توانی برداری!");
    else if (res.state === "taken") setStatus("taken", "❌ این نام قبلاً انتخاب شده — نام دیگری برگزین");
    else if (res.state === "invalid") setStatus("invalid", "⚠️ " + (res.msg || "نام نامعتبر است"));
    else setStatus("offline", "🟠 سرور در دسترس نیست — با همین نام ادامه بده (بعداً خودکار ثبت می‌شود)");
  }

  function onNameInput() {
    lastCheckName = null;
    clearTimeout(checkTimer);
    const v = validate(nameInput.value);
    if (v) {
      setStatus(
        nameInput.value.trim() ? "invalid" : "",
        nameInput.value.trim() ? "⚠️ " + v : ""
      );
      return;
    }
    setStatus("", "");
    checkTimer = setTimeout(runCheck, 400);
  }

  function buildAvatarGrid(container, opts) {
    // opts (اختیاری): {selected, onSelect} — برای مودال تغییر آواتار
    container.innerHTML = "";
    for (let i = 1; i <= AVATAR_COUNT; i++) {
      const img = document.createElement("img");
      img.src = avatarSrc(i);
      img.alt = "آواتار " + i;
      avatarFallback(img, "P" + i);
      if (opts && opts.selected === avatarSrc(i)) img.classList.add("active");
      img.addEventListener("click", function () {
        container.querySelectorAll("img").forEach(function (x) {
          x.classList.remove("active");
        });
        this.classList.add("active");
        if (opts && opts.onSelect) opts.onSelect(this.getAttribute("src"));
        else pickedAvatar = this.getAttribute("src");
        if (!opts || !opts.onSelect) refreshSubmit();
      });
      container.appendChild(img);
    }
  }

  async function submit() {
    const name = nameInput.value.trim().replace(/\s+/g, " ");
    const err = validate(name);
    if (err) return setStatus("invalid", "⚠️ " + err);
    if (!pickedAvatar) return setStatus("invalid", "⚠️ یک پروفایل انتخاب کن");
    if (submitBtn._busy) return;
    submitBtn._busy = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<i class='fas fa-spinner fa-pulse'></i> در حال ثبت…";

    const res = await serverRegister(name, pickedAvatar).catch(function () {
      return null;
    });

    if (res && res.ok && res.profile) {
      finish({ name: res.profile.name, avatar: res.profile.avatar || pickedAvatar });
    } else if (res && res.ok === false && res.available === false) {
      // نام بین بررسی و ثبت توسط نفر دیگر برداشته شد
      submitBtn._busy = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = "<i class='fas fa-chess-king'></i> شروع می‌کنم!";
      setStatus("taken", "❌ " + (res.error || "این نام قبلاً انتخاب شده است"));
      lastCheckName = null;
    } else {
      // سرور در دسترس نیست → ثبت محلی با همگام‌سازی خودکار بعدی
      submitBtn._busy = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = "<i class='fas fa-chess-king'></i> شروع می‌کنم!";
      finish({ name: name, avatar: pickedAvatar, pendingSync: true });
    }
  }

  function finish(profile) {
    apply(profile);
    closeOverlay();
    if (typeof onDoneCallback === "function") {
      try {
        onDoneCallback(profile);
      } catch (e) {}
      onDoneCallback = null;
    }
    renderChip();
  }

  function buildOverlay() {
    if (overlayEl) return;
    injectCSS();
    overlayEl = document.createElement("div");
    overlayEl.className = "chp-overlay";
    overlayEl.id = "chpOnboarding";
    overlayEl.innerHTML =
      '<div class="chp-card" role="dialog" aria-modal="true" aria-label="راه‌اندازی پروفایل">' +
      '<div class="chp-logo"><i class="fas fa-chess-queen"></i></div>' +
      "<h2>به ChessHub خوش آمدی! <i class='fas fa-hand-sparkles'></i></h2>" +
      '<p class="chp-sub">فقط <b>یک بار</b> نام کاربری و پروفایلت را انتخاب کن — ' +
      "همین نام در <b>بازی آنلاین</b>، <b>مقالات</b>، <b>دروس</b> و <b>گشایش‌هایت</b> نمایش داده می‌شود." +
      "<br>هر نام فقط یک بار قابل انتخاب است.</p>" +
      '<div class="chp-field">' +
      "<label>نام کاربری تو</label>" +
      '<input type="text" class="chp-input" id="chpName" maxlength="' + MAX_LEN + '" placeholder="مثلاً: آرش، شاهین‌برنده…" autocomplete="off" spellcheck="false">' +
      '<div class="chp-status" id="chpStatus"></div>' +
      "</div>" +
      '<div class="chp-field">' +
      "<label>پروفایلت را انتخاب کن</label>" +
      '<div class="chp-avatars" id="chpAvatars"></div>' +
      "</div>" +
      '<button class="chp-btn" id="chpSubmit" disabled><i class="fas fa-chess-king"></i> شروع می‌کنم!</button>' +
      '<div class="chp-note">🔒 این پروفایل در کل سایت و بازی آنلاین یکسان می‌ماند.</div>' +
      "</div>";
    document.body.appendChild(overlayEl);
    nameInput = overlayEl.querySelector("#chpName");
    statusEl = overlayEl.querySelector("#chpStatus");
    submitBtn = overlayEl.querySelector("#chpSubmit");
    nameInput.addEventListener("input", onNameInput);
    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !submitBtn.disabled) submit();
    });
    submitBtn.addEventListener("click", submit);
    // کلیک روی پس‌زمینه بسته نمی‌شود — انتخاب پروفایل اجباری و یک‌بار برای همیشه است
  }

  function openOnboarding(opts) {
    opts = opts || {};
    onDoneCallback = opts.onDone || null;
    buildOverlay();
    // ریست کامل حالت در هر باز شدن
    pickedAvatar = "";
    lastCheckName = null;
    clearTimeout(checkTimer);
    nameInput.value = "";
    statusEl.className = "chp-status";
    statusEl.innerHTML = "";
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<i class='fas fa-chess-king'></i> شروع می‌کنم!";
    buildAvatarGrid(overlayEl.querySelector("#chpAvatars"));
    overlayEl.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      if (nameInput) nameInput.focus();
    }, 150);
  }

  function closeOverlay() {
    if (overlayEl) overlayEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------------- مودال تغییر آواتار (نام قفل است) ---------------- */
  function openAvatarChange() {
    if (!_profile || !_profile.name) {
      return openOnboarding();
    }
    injectCSS();
    const ov = document.createElement("div");
    ov.className = "chp-info-overlay open";
    const card = document.createElement("div");
    card.className = "chp-info-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "تغییر آواتار");
    card.innerHTML =
      "<h3>تغییر آواتار</h3>" +
      '<p>نام کاربری <b>' + esc(_profile.name) + "</b> برای همیشه ثابت است — فقط تصویر پروفایلت را می‌توانی عوض کنی.</p>" +
      '<div class="chp-avatars" id="chpAvPick"></div>' +
      '<div class="chp-info-actions" style="margin-top:1rem">' +
      '<button class="chp-info-close" id="chpAvSave" disabled>ذخیره آواتار</button>' +
      '<button class="chp-info-change" id="chpAvCancel">انصراف</button>' +
      "</div>";
    ov.appendChild(card);
    document.body.appendChild(ov);

    let picked = _profile.avatar || "";
    const saveBtn = card.querySelector("#chpAvSave");
    buildAvatarGrid(card.querySelector("#chpAvPick"), {
      selected: picked,
      onSelect: function (src) {
        picked = src;
        saveBtn.disabled = picked === _profile.avatar;
      },
    });

    function closeOv() {
      ov.remove();
    }
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.id === "chpAvCancel") closeOv();
    });
    saveBtn.addEventListener("click", async function () {
      if (!picked || saveBtn._busy) return;
      saveBtn._busy = true;
      saveBtn.disabled = true;
      saveBtn.innerHTML = "<i class='fas fa-spinner fa-pulse'></i> در حال ذخیره…";
      const res = await serverAvatar(_profile.name, picked);
      // محلی همیشه ذخیره می‌شود؛ سرور فقط همگام می‌کند
      apply({
        name: _profile.name,
        avatar: (res && res.ok && res.profile && res.profile.avatar) || picked,
        pendingSync: _profile.pendingSync,
      });
      renderChip();
      closeOv();
    });
  }

  /* ---------------- چیپ پروفایل در هدر ---------------- */
  let chipEl = null;

  function renderChip() {
    if (!chipEl) return;
    if (_profile) {
      const av = _profile.avatar
        ? '<img src="' + esc(_profile.avatar) + '" alt="">'
        : '<span class="chp-av-empty"><i class="fas fa-user"></i></span>';
      chipEl.innerHTML =
        av + "<span>" + esc(_profile.name) + "</span>";
    } else {
      chipEl.innerHTML =
        '<span class="chp-av-empty"><i class="fas fa-user-plus"></i></span><span>انتخاب پروفایل</span>';
    }
  }

  function injectChip() {
    const flex =
      document.querySelector("#header-placeholder .header-flex") ||
      document.querySelector(".header-flex");
    if (!flex) return false;
    if (!document.getElementById("chpStyle2")) {
      // اگر استایل هنوز تزریق نشده (صفحه‌ای که author.js ندارد هم هست)
      injectCSS();
    }
    chipEl = document.createElement("button");
    chipEl.type = "button";
    chipEl.id = "chpChip";
    chipEl.className = "chp-chip";
    chipEl.title = "پروفایل تو — در کل سایت یکسان است";
    chipEl.addEventListener("click", function () {
      if (window.ChessHubProfile.has()) openInfo();
      else openOnboarding();
    });
    flex.appendChild(chipEl);
    renderChip();
    return true;
  }

  /* ---------------- مودال اطلاعات پروفایل ---------------- */
  function openInfo() {
    injectCSS();
    const ov = document.createElement("div");
    ov.className = "chp-info-overlay open";
    const av = _profile.avatar
      ? '<img src="' + esc(_profile.avatar) + '" alt="">'
      : '<div class="chp-av-empty" style="width:76px;height:76px;border-radius:50%;background:#dcd4f7;display:flex;align-items:center;justify-content:center;margin:0 auto .6rem"><i class="fas fa-user" style="color:#6d5bd0;font-size:1.6rem"></i></div>';
    ov.innerHTML =
      '<div class="chp-info-card">' +
      av +
      "<h3>" + esc(_profile.name) + "</h3>" +
      "<p>این پروفایل توست — در <b>بازی آنلاین</b> (با ریتینگ)، و به‌عنوان نام نویسنده در <b>مقالات</b>، <b>دروس</b> و <b>گشایش‌ها</b> با همین نام نمایش داده می‌شود.<br>نام کاربری ثابت است؛ فقط آواتار قابل تغییر است.</p>" +
      '<div class="chp-info-actions">' +
      '<button class="chp-info-close">باشه</button>' +
      '<button class="chp-info-change" id="chpInfoAv"><i class="fas fa-sync-alt"></i> تغییر آواتار</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.classList.contains("chp-info-close")) ov.remove();
      if (e.target.id === "chpInfoAv" || (e.target.parentElement && e.target.parentElement.id === "chpInfoAv")) {
        ov.remove();
        openAvatarChange();
      }
    });
  }

  /* ---------------- API سراسری ---------------- */
  const api = {
    KEY: PROFILE_KEY,
    MIN_LEN: MIN_LEN,
    MAX_LEN: MAX_LEN,
    get name() {
      return _profile ? _profile.name : "";
    },
    get avatar() {
      return _profile ? _profile.avatar : "";
    },
    get profile() {
      return _profile;
    },
    has() {
      return !!(_profile && _profile.name && _profile.name.trim().length >= MIN_LEN);
    },
    onChange(cb) {
      if (typeof cb !== "function") return;
      document.addEventListener("chesshub:profile-changed", function (e) {
        cb(e.detail);
      });
    },
    openOnboarding: openOnboarding,
    openAvatarChange: openAvatarChange,
  };

  /* ---------------- شروع خودکار ---------------- */
  function boot() {
    injectCSS();
    if (!_profile) {
      openOnboarding();
    } else {
      retryPendingSync();
    }
    // چیپ هدر — هدر با script.js تزریق می‌شود؛ تا ظاهر شدن صبر می‌کنیم
    let tries = 0;
    const t = setInterval(function () {
      tries += 1;
      if (injectChip() || tries > 80) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }

  return api;
})();
