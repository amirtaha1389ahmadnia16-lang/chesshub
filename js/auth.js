/* ============================================
   🔐 ChessHub | سیستم حساب کاربری امن (v8.2)
   --------------------------------------------
   «کاربر عزیز لطفاً به منظور امنیت بیشتر یک نام
   کاربری و یک رمز عبور و یک پروفایل انتخاب کنید
   و ورود و ثبت‌نام را بزن» — این پیام برای همه
   نمایش داده می‌شود، حتی بدون پاک کردن کش.

   چه کسانی چه می‌بینند:
     • پروفایل قدیمی دارد ولی حساب ندارد
       → پنجره‌ی «انتخاب رمز عبور» (اجباری، غیرقابل بستن)
     • حساب دارد → پنجره‌ی «ورود» (اجباری تا ورود)
     • هیچ پروفایلی ندارد → پنجره‌ی «ثبت‌نام»
       (بدون رمز عبور، ثبت‌نام ممکن نیست)

   امنیت:
     • رمزها با scrypt روی سرور هش می‌شوند (هرگز ارسال‌شده
       نگه‌داری نمی‌شوند)؛ توکن نشست امضاشده با انقضای ۳۰ روزه
     • نام نویسنده‌ی محتوا از «نشست سرور» می‌آید نه از
       مرورگر — دیگر نام هیچ‌کس اشتباه ثبت نمی‌شود
     • بعد از ورود، محتوای ذخیره‌شده‌ی محلی کاربر که هنوز
       منتشر نشده، خودکار برای همه منتشر می‌شود (بازیابی)

   API سراسری:
     window.ChessHubAuth.current()      → {name, avatar} یا null
     window.ChessHubAuth.token()        → توکن نشست یا ""
     window.ChessHubAuth.isLoggedIn()   → true/false
     window.ChessHubAuth.requireAuth(p) → باز کردن پنجره‌ی ورود
     window.ChessHubAuth.logout()       → خروج
     window.ChessHubAuth.onChange(cb)   → رویداد تغییر حساب
     window.ChessHubAuth.onUnauthorized() → نمایش پنجره (۴۰۱)
   ============================================ */
window.ChessHubAuth = (function () {
  "use strict";

  const SESSION_KEY = "chesshub_session";
  const PROFILE_KEY = "chesshub_profile";
  const AUTHOR_KEY = "chesshub_author_name";
  const SKIP_KEY = "chesshub_auth_skip"; // فقط وقتی سرور از دسترس خارج است

  /* ---------------- ذخیره‌سازی ---------------- */
  function readSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      return s && s.token && s.name ? s : null;
    } catch (e) {
      return null;
    }
  }
  function storeSession(s) {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function readProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      return p && p.name ? p : null;
    } catch (e) {
      return null;
    }
  }
  function storeProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
    try { localStorage.setItem(AUTHOR_KEY, p.name); } catch (e) {}
    // سازگاری با js/author.js
    if (window.ChessHubAuthor && typeof window.ChessHubAuthor.set === "function") {
      window.ChessHubAuthor.set(p.name);
    }
    document.dispatchEvent(new CustomEvent("chesshub:profile-changed", { detail: { name: p.name, avatar: p.avatar } }));
  }

  let session = readSession();

  /* ---------------- ابزار ---------------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fetchJSON(url, opts, timeoutMs) {
    opts = opts || {};
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 9000);
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts)
      .then(function (r) {
        clearTimeout(t);
        return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, body: j }; });
      })
      .catch(function (e) {
        clearTimeout(t);
        throw e;
      });
  }

  /* ---------------- استایل ---------------- */
  const CSS =
    ".cha-overlay{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;" +
    "background:linear-gradient(135deg,#141c33 0%,#241b52 55%,#372568 100%);padding:1rem;overflow-y:auto;font-family:inherit}" +
    ".cha-overlay.open{display:flex}" +
    ".cha-card{background:#fff;border-radius:22px;max-width:460px;width:100%;padding:1.6rem 1.5rem 1.4rem;" +
    "box-shadow:0 30px 80px rgba(0,0,0,.45);max-height:94vh;overflow-y:auto;scrollbar-width:none;box-sizing:border-box}" +
    ".cha-card::-webkit-scrollbar{display:none}" +
    ".cha-logo{width:60px;height:60px;border-radius:17px;margin:0 auto .6rem;display:flex;align-items:center;justify-content:center;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;font-size:1.7rem;box-shadow:0 10px 24px rgba(109,91,208,.35)}" +
    ".cha-card h2{margin:0 0 .5rem;color:#17203a;font-size:1.18rem;font-weight:800;text-align:center}" +
    ".cha-msg{background:#fff8e8;border:1px solid #f5e3b8;border-radius:14px;padding:.8rem 1rem;color:#7a5a12;" +
    "font-size:.83rem;line-height:2;margin:0 0 1rem;text-align:right}" +
    ".cha-msg b{color:#5c430b}" +
    ".cha-tabs{display:flex;background:#f1f0fa;border-radius:13px;padding:4px;margin-bottom:1.1rem}" +
    ".cha-tab{flex:1;padding:.6rem;border:none;background:transparent;border-radius:10px;cursor:pointer;" +
    "font-family:inherit;font-size:.88rem;font-weight:700;color:#6b7590;transition:all .15s}" +
    ".cha-tab.active{background:#fff;color:#4c3f9e;box-shadow:0 2px 8px rgba(76,63,158,.15)}" +
    ".cha-field{text-align:right;margin-bottom:.85rem}" +
    ".cha-field label{display:block;font-size:.78rem;font-weight:700;color:#17203a;margin-bottom:.35rem}" +
    ".cha-inputwrap{position:relative}" +
    ".cha-input{width:100%;box-sizing:border-box;padding:.68rem .9rem;border:1.5px solid #e3e7f0;border-radius:12px;" +
    "font-size:.92rem;font-family:inherit;outline:none;transition:border .15s;background:#fafbfe;color:#17203a}" +
    ".cha-input:focus{border-color:#6d5bd0;background:#fff}" +
    ".cha-input[readonly]{background:#efecfd;color:#4c3f9e;font-weight:700}" +
    ".cha-eye{position:absolute;left:.5rem;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;" +
    "color:#9aa3b8;font-size:.9rem;padding:.3rem}" +
    ".cha-eye:hover{color:#4c3f9e}" +
    ".cha-status{font-size:.74rem;margin-top:.3rem;min-height:1.1em;line-height:1.7;text-align:right}" +
    ".cha-status.free{color:#2f9e6e}.cha-status.bad{color:#e05252}.cha-status.busy{color:#6b7590}" +
    ".cha-status.off{color:#c07d1a}" +
    ".cha-hint{font-size:.7rem;color:#9aa3b8;margin-top:.25rem;line-height:1.7}" +
    ".cha-avatars{display:grid;grid-template-columns:repeat(4,1fr);gap:.55rem}" +
    ".cha-avatars img{width:100%;aspect-ratio:1;border-radius:13px;cursor:pointer;border:2.5px solid transparent;" +
    "background:#efecfd;transition:transform .12s,border-color .12s;object-fit:cover;padding:2px;box-sizing:border-box}" +
    ".cha-avatars img:hover{transform:translateY(-2px)}" +
    ".cha-avatars img.active{border-color:#6d5bd0;box-shadow:0 4px 14px rgba(109,91,208,.35)}" +
    ".cha-av-preview{display:flex;align-items:center;gap:.7rem;background:#f6f5fd;border-radius:14px;padding:.6rem .8rem;margin-bottom:.9rem}" +
    ".cha-av-preview img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #dcd4f7;background:#fff}" +
    ".cha-av-preview span{font-weight:800;color:#4c3f9e;font-size:.95rem}" +
    ".cha-btn{width:100%;margin-top:.5rem;padding:.85rem;border:none;border-radius:14px;cursor:pointer;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;font-size:.98rem;font-weight:800;font-family:inherit;" +
    "transition:opacity .15s,transform .12s}" +
    ".cha-btn:hover:not(:disabled){transform:translateY(-1px)}" +
    ".cha-btn:disabled{opacity:.45;cursor:not-allowed}" +
    ".cha-btn.sec{background:#fff;color:#4c3f9e;border:1.5px solid #dcd4f7;margin-top:.55rem}" +
    ".cha-error{background:#fdecec;border:1px solid #f6c9c9;color:#b3282d;border-radius:12px;padding:.6rem .8rem;" +
    "font-size:.78rem;line-height:1.9;margin:.2rem 0 .6rem;display:none;text-align:right}" +
    ".cha-error.show{display:block}" +
    ".cha-note{font-size:.7rem;color:#9aa3b8;margin-top:.8rem;line-height:1.9;text-align:center}" +
    ".cha-note a{color:#6d5bd0;cursor:pointer;text-decoration:underline;font-weight:700}" +
    ".cha-shield{display:inline-flex;align-items:center;gap:.3rem;background:#eef8f2;color:#23684a;border-radius:999px;" +
    "padding:.2rem .7rem;font-size:.68rem;font-weight:700;margin-bottom:.5rem}" +
    /* توست سراسری */
    ".cha-toast{position:fixed;bottom:1.2rem;right:50%;transform:translateX(50%);z-index:100001;background:#17203a;color:#fff;" +
    "padding:.75rem 1.3rem;border-radius:14px;font-size:.85rem;font-family:inherit;box-shadow:0 12px 34px rgba(0,0,0,.35);" +
    "opacity:0;transition:opacity .25s;max-width:92vw;text-align:center;pointer-events:none}" +
    ".cha-toast.show{opacity:1}" +
    "@media(max-width:480px){.cha-card{padding:1.2rem 1rem}.cha-avatars{grid-template-columns:repeat(4,1fr);gap:.4rem}}";

  function injectCSS() {
    if (document.getElementById("cha-style")) return;
    const st = document.createElement("style");
    st.id = "cha-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- توست سراسری ---------------- */
  let toastEl = null;
  function toast(msg, ms) {
    injectCSS();
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "cha-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3200);
  }

  /* ---------------- پنجره‌ی گیت امنیتی ---------------- */
  let gateEl = null;
  let gateMode = "register"; // register | login | upgrade
  let pickedAvatar = "";
  let checkTimer = null;
  let lastCheck = null;

  function buildGate() {
    if (gateEl) return;
    injectCSS();
    gateEl = document.createElement("div");
    gateEl.className = "cha-overlay";
    gateEl.id = "chaGate";
    gateEl.innerHTML =
      '<div class="cha-card" role="dialog" aria-modal="true" aria-label="امنیت حساب کاربری">' +
      '<div class="cha-logo"><i class="fas fa-chess-king"></i></div>' +
      '<div style="text-align:center"><span class="cha-shield"><i class="fas fa-lock"></i> امنیت حساب کاربری</span></div>' +
      '<h2 id="chaTitle">سلام کاربر عزیز 👋</h2>' +
      '<div class="cha-msg">کاربر عزیز، لطفاً <b>به منظور امنیت بیشتر</b> یک <b>نام کاربری</b> و یک <b>رمز عبور</b> و یک <b>پروفایل</b> انتخاب کنید و «ورود» و «ثبت‌نام» را بزن.' +
      "<br>💾 همین حالا از اطلاعات فعلی سایت نسخه‌ی پشتیبان گرفته می‌شود — هیچ داده‌ای از دست نمی‌رود.</div>" +
      '<div class="cha-tabs" id="chaTabs">' +
      '<button class="cha-tab" id="chaTabLogin" type="button">🔑 ورود</button>' +
      '<button class="cha-tab" id="chaTabRegister" type="button">📝 ثبت‌نام</button>' +
      "</div>" +
      '<div class="cha-error" id="chaError"></div>' +
      '<div id="chaUpgradeBox" style="display:none">' +
      '<div class="cha-av-preview"><img id="chaUpAv" alt=""><span id="chaUpName"></span></div>' +
      "</div>" +
      '<div id="chaRegFields">' +
      '<div class="cha-field"><label>نام کاربری تو</label>' +
      '<input type="text" class="cha-input" id="chaName" maxlength="16" placeholder="مثلاً: آرش، شاهین‌برنده…" autocomplete="username" spellcheck="false">' +
      '<div class="cha-status" id="chaNameStatus"></div></div>' +
      '<div class="cha-field" id="chaAvField"><label>پروفایلت را انتخاب کن</label>' +
      '<div class="cha-avatars" id="chaAvatars"></div></div>' +
      "</div>" +
      '<div class="cha-field"><label id="chaPwLabel">رمز عبور</label>' +
      '<div class="cha-inputwrap">' +
      '<input type="password" class="cha-input" id="chaPw" placeholder="حداقل ۶ حرف — حرف + رقم" autocomplete="current-password" style="padding-left:2.4rem">' +
      '<button class="cha-eye" id="chaEye" type="button" title="نمایش/پنهان"><i class="fas fa-eye"></i></button>' +
      "</div>" +
      '<div class="cha-hint" id="chaPwHint"></div></div>' +
      '<div class="cha-field" id="chaPw2Field"><label>تکرار رمز عبور</label>' +
      '<input type="password" class="cha-input" id="chaPw2" placeholder="همان رمز را دوباره بنویس" autocomplete="new-password"></div>' +
      '<button class="cha-btn" id="chaSubmit" type="button">🛡️ ثبت‌نام و ورود</button>' +
      '<button class="cha-btn sec" id="chaSkip" type="button" style="display:none">فعلاً به‌صورت مهمان ادامه بده</button>' +
      '<div class="cha-note" id="chaNote">🔒 رمز عبورت فقط هش‌شده ذخیره می‌شود؛ حتی ما هم نمی‌توانیم آن را ببینیم.' +
      '<br id="chaNoteBr"><a id="chaSwitch">این پروفایل مال من نیست — با حساب دیگری وارد شوم</a></div>' +
      "</div>";
    document.body.appendChild(gateEl);

    gateEl.querySelector("#chaEye").addEventListener("click", function () {
      const pw = gateEl.querySelector("#chaPw");
      pw.type = pw.type === "password" ? "text" : "password";
      this.innerHTML = pw.type === "password" ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });
    gateEl.querySelector("#chaTabLogin").addEventListener("click", function () { setMode("login"); });
    gateEl.querySelector("#chaTabRegister").addEventListener("click", function () { setMode("register"); });
    gateEl.querySelector("#chaSubmit").addEventListener("click", submitGate);
    gateEl.querySelector("#chaPw").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !gateEl.querySelector("#chaSubmit").disabled) submitGate();
    });
    gateEl.querySelector("#chaPw").addEventListener("input", pwHint);
    gateEl.querySelector("#chaName").addEventListener("input", onNameInput);
    gateEl.querySelector("#chaSwitch").addEventListener("click", function () {
      setMode("login");
      gateEl.querySelector("#chaName").value = "";
      gateEl.querySelector("#chaName").removeAttribute("readonly");
    });
    gateEl.querySelector("#chaSkip").addEventListener("click", function () {
      try { sessionStorage.setItem(SKIP_KEY, "1"); } catch (e) {}
      closeGate();
      toast("⚠️ برای انتشار محتوا و بازی آنلاین باید وارد حسابت شوی");
    });
  }

  function showErr(m) {
    const el = gateEl.querySelector("#chaError");
    if (m) { el.textContent = m; el.classList.add("show"); }
    else { el.textContent = ""; el.classList.remove("show"); }
  }

  function pwHint() {
    const pw = gateEl.querySelector("#chaPw").value;
    const hint = gateEl.querySelector("#chaPwHint");
    if (!pw) { hint.textContent = ""; return; }
    const hasDigit = /[0-9]/.test(pw);
    const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(pw);
    if (pw.length < 6) { hint.textContent = "⚠️ کمتر از ۶ حرف است"; hint.style.color = "#e05252"; }
    else if (!hasDigit || !hasLetter) { hint.textContent = "⚠️ باید هم حرف داشته باشد هم رقم"; hint.style.color = "#c07d1a"; }
    else if (pw.length >= 8) { hint.textContent = "✅ رمز خوبی است"; hint.style.color = "#2f9e6e"; }
    else { hint.textContent = "رمز قابل قبول — کمی طولانی‌تر بهتر است"; hint.style.color = "#2f9e6e"; }
  }

  function setMode(mode) {
    gateMode = mode;
    const tabLogin = gateEl.querySelector("#chaTabLogin");
    const tabReg = gateEl.querySelector("#chaTabRegister");
    tabLogin.classList.toggle("active", mode === "login");
    tabReg.classList.toggle("active", mode !== "login");
    showErr("");
    const title = gateEl.querySelector("#chaTitle");
    const submit = gateEl.querySelector("#chaSubmit");
    const pw2 = gateEl.querySelector("#chaPw2Field");
    const upBox = gateEl.querySelector("#chaUpgradeBox");
    const regFields = gateEl.querySelector("#chaRegFields");
    const avField = gateEl.querySelector("#chaAvField");
    const note = gateEl.querySelector("#chaNote");

    if (mode === "upgrade") {
      tabsHidden(true);
      upBox.style.display = "block";
      regFields.style.display = "block";
      avField.style.display = "none";
      pw2.style.display = "block";
      title.textContent = "انتخاب رمز عبور برای حسابت";
      submit.innerHTML = "🛡️ انتخاب رمز عبور و ورود";
      submit.disabled = false;
      note.innerHTML = "🔒 نام و پروفایلت عیناً حفظ می‌شود — فقط یک رمز عبور اضافه می‌شود.";
    } else if (mode === "login") {
      tabsHidden(false);
      upBox.style.display = "none";
      regFields.style.display = "block";
      avField.style.display = "none";
      pw2.style.display = "none";
      title.textContent = "ورود به ChessHub";
      submit.innerHTML = "🔑 ورود";
      submit.disabled = false;
      note.innerHTML = "حساب نداری؟ <a id=\"chaGoReg\">ثبت‌نام کن</a> — ثبت‌نام فقط با رمز عبور انجام می‌شود.";
      const go = note.querySelector("#chaGoReg");
      if (go) go.addEventListener("click", function () { setMode("register"); });
    } else {
      tabsHidden(false);
      upBox.style.display = "none";
      regFields.style.display = "block";
      avField.style.display = "block";
      pw2.style.display = "block";
      title.textContent = "به ChessHub خوش آمدی!";
      submit.innerHTML = "🛡️ ثبت‌نام و ورود";
      submit.disabled = false;
      note.innerHTML = "🔒 این پروفایل و رمز، حساب امن تو در کل سایت می‌شود." +
        '<br><a id="chaHaveAcc">قبلاً حساب ساخته‌ام — وارد شوم</a>';
      const go2 = note.querySelector("#chaHaveAcc");
      if (go2) go2.addEventListener("click", function () { setMode("login"); });
      buildAvatarGrid();
    }
  }
  function tabsHidden(hidden) {
    gateEl.querySelector("#chaTabs").style.display = hidden ? "none" : "flex";
  }

  function buildAvatarGrid() {
    const box = gateEl.querySelector("#chaAvatars");
    if (!box) return;
    box.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
      const img = document.createElement("img");
      const src = "images/avatars/" + i + ".png";
      img.src = src;
      img.alt = "آواتار " + i;
      img.onerror = function () { this.style.opacity = ".3"; };
      if (pickedAvatar === src) img.classList.add("active");
      img.addEventListener("click", function () {
        box.querySelectorAll("img").forEach(function (x) { x.classList.remove("active"); });
        this.classList.add("active");
        pickedAvatar = this.getAttribute("src");
      });
      box.appendChild(img);
    }
  }

  function onNameInput() {
    lastCheck = null;
    clearTimeout(checkTimer);
    const el = gateEl.querySelector("#chaName");
    const st = gateEl.querySelector("#chaNameStatus");
    const v = String(el.value || "").trim().replace(/\s+/g, " ");
    if (el.getAttribute("readonly")) return;
    if (v.length < 2) { st.className = "cha-status"; st.textContent = v ? "⚠️ حداقل ۲ حرف" : ""; return; }
    if (v.length > 16) { st.className = "cha-status bad"; st.textContent = "⚠️ حداکثر ۱۶ حرف"; return; }
    if (/[<>"'\\/{}$`]/.test(v)) { st.className = "cha-status bad"; st.textContent = "⚠️ کاراکتر خاص مجاز نیست"; return; }
    st.className = "cha-status busy";
    st.textContent = "… در حال بررسی آزاد بودن نام";
    checkTimer = setTimeout(function () { checkName(v); }, 420);
  }

  function checkName(name) {
    fetchJSON("api/username/check?name=" + encodeURIComponent(name), { cache: "no-store" })
      .then(function (r) {
        if (!gateEl || gateMode !== "register") return;
        const cur = gateEl.querySelector("#chaName").value.trim().replace(/\s+/g, " ");
        if (cur !== name) return;
        const st = gateEl.querySelector("#chaNameStatus");
        const j = r.body;
        if (j && j.ok) {
          if (j.available) { st.className = "cha-status free"; st.textContent = "✅ «" + esc(name) + "» آزاد است"; }
          else if (j.hasAccount === false && j.error === undefined && j.avatar !== undefined) {
            // نام در رجیستری قدیمی هست ولی حساب ندارد → ارتقا
            st.className = "cha-status off";
            st.textContent = "ℹ️ این نام از قبل متعلق به توست — رمز عبور برایش انتخاب می‌کنیم";
            setTimeout(function () { if (gateEl) prepareUpgrade(name, j.avatar); }, 700);
          } else {
            st.className = "cha-status bad";
            st.textContent = "❌ " + (j.error || "این نام قبلاً گرفته شده — نام دیگری برگزین");
          }
        } else {
          st.className = "cha-status off";
          st.textContent = "🟠 سرور در دسترس نیست — با همین نام ادامه بده";
        }
      })
      .catch(function () {
        if (!gateEl) return;
        const st = gateEl.querySelector("#chaNameStatus");
        st.className = "cha-status off";
        st.textContent = "🟠 سرور در دسترس نیست — با همین نام ادامه بده";
      });
  }

  function prepareUpgrade(name, avatar) {
    gateMode = "upgrade";
    tabsHidden(true);
    gateEl.querySelector("#chaUpgradeBox").style.display = "block";
    gateEl.querySelector("#chaUpName").textContent = name;
    const av = gateEl.querySelector("#chaUpAv");
    if (avatar) { av.src = avatar; av.onerror = function () { this.style.visibility = "hidden"; }; }
    else av.style.visibility = "hidden";
    const nameInput = gateEl.querySelector("#chaName");
    nameInput.value = name;
    nameInput.setAttribute("readonly", "readonly");
    gateEl.querySelector("#chaAvField").style.display = "none";
    gateEl.querySelector("#chaPw2Field").style.display = "block";
    gateEl.querySelector("#chaTitle").textContent = "سلام " + name + " 👋";
    gateEl.querySelector("#chaSubmit").innerHTML = "🛡️ انتخاب رمز عبور و ورود";
    gateEl.querySelector("#chaNote").innerHTML =
      "🔒 نام و پروفایلت عیناً حفظ می‌شود — فقط یک رمز عبور اضافه می‌شود." +
      '<br><a id="chaNotMe">این پروفایل مال من نیست — با حساب دیگری وارد شوم</a>';
    const nm = gateEl.querySelector("#chaNotMe");
    if (nm) nm.addEventListener("click", function () {
      nameInput.removeAttribute("readonly");
      nameInput.value = "";
      setMode("login");
    });
    setTimeout(function () { gateEl.querySelector("#chaPw").focus(); }, 120);
  }

  function submitGate() {
    const btn = gateEl.querySelector("#chaSubmit");
    if (btn._busy) return;
    showErr("");
    const nameEl = gateEl.querySelector("#chaName");
    const name = String(nameEl.value || "").trim().replace(/\s+/g, " ");
    const pw = gateEl.querySelector("#chaPw").value;
    const pw2El = gateEl.querySelector("#chaPw2");

    if (gateMode === "login") {
      if (!name || !pw) return showErr("نام کاربری و رمز عبور را وارد کن");
      busy(btn, true, "🔑 در حال ورود…");
      fetchJSON("api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, password: pw }),
      })
        .then(function (r) {
          const j = r.body;
          if (r.status === 200 && j && j.ok) return succeed(j);
          busy(btn, false);
          if (j && j.error) showErr("❌ " + j.error);
          else showErr("❌ ورود ناموفق بود — دوباره تلاش کن");
        })
        .catch(function () {
          busy(btn, false);
          showErr("🟠 سرور در دسترس نیست — اتصال اینترنت را چک کن و دوباره تلاش کن");
        });
      return;
    }

    // register / upgrade
    if (!name || name.length < 2) return showErr("نام کاربری باید حداقل ۲ حرف باشد");
    if (!pw) return showErr(gateMode === "upgrade" ? "انتخاب رمز عبور برای این مرحله «اجباری» است" : "رمز عبور الزامی است — بدون رمز عبور نمی‌توانی ثبت‌نام کنی");
    if (pw.length < 6) return showErr("رمز عبور باید حداقل ۶ حرف باشد");
    if (!/[0-9]/.test(pw) || !/[a-zA-Z\u0600-\u06FF]/.test(pw)) return showErr("رمز عبور باید هم حرف داشته باشد هم رقم");
    if (pw2El && pw2El.offsetParent !== null && pw !== pw2El.value) return showErr("تکرار رمز عبور با رمز یکسان نیست");
    if (gateMode === "register" && !pickedAvatar) return showErr("یک پروفایل انتخاب کن");
    if (norm(name) === pw.toLowerCase()) return showErr("رمز عبور نمی‌تواند همان نام کاربری باشد");

    const endpoint = gateMode === "upgrade" ? "api/auth/upgrade" : "api/auth/register";
    const payload =
      gateMode === "upgrade"
        ? { name: name, password: pw }
        : { name: name, password: pw, avatar: pickedAvatar };
    busy(btn, true, "🛡️ در حال ساخت حساب…");
    fetchJSON(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        const j = r.body;
        if (r.status === 200 && j && j.ok) return succeed(j);
        busy(btn, false);
        if (j && j.needUpgrade) {
          prepareUpgrade(name, "");
          return;
        }
        showErr("❌ " + ((j && j.error) || "ثبت‌نام ناموفق بود — دوباره تلاش کن"));
      })
      .catch(function () {
        busy(btn, false);
        showErr("🟠 سرور در دسترس نیست — اتصال اینترنت را چک کن و دوباره تلاش کن");
      });
  }

  function busy(btn, on, label) {
    btn._busy = on;
    btn.disabled = on;
    if (on) {
      btn._old = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' + (label || "…");
    } else {
      btn.innerHTML = btn._old || btn.innerHTML;
    }
  }
  function norm(v) { return String(v || "").trim().replace(/\s+/g, " ").toLowerCase(); }

  function openGate(mode) {
    buildGate();
    const p = readProfile();
    pickedAvatar = "";
    gateEl.querySelector("#chaPw").value = "";
    gateEl.querySelector("#chaPw2").value = "";
    gateEl.querySelector("#chaPwHint").textContent = "";
    gateEl.querySelector("#chaNameStatus").textContent = "";
    const nameInput = gateEl.querySelector("#chaName");
    nameInput.removeAttribute("readonly");
    gateEl.querySelector("#chaSkip").style.display = "none";
    gateEl.classList.add("open");
    document.body.style.overflow = "hidden";

    if (mode === "upgrade" && p && p.name) {
      prepareUpgrade(p.name, p.avatar);
      nameInput.value = p.name;
    } else {
      setMode(mode || (p ? "login" : "register"));
      if (mode === "upgrade" && !p) setMode("register");
    }
    setTimeout(function () {
      const target = gateMode === "upgrade" ? gateEl.querySelector("#chaPw") : nameInput;
      if (target && !target.getAttribute("readonly")) target.focus();
    }, 160);
  }
  function closeGate() {
    if (gateEl) gateEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------------- موفقیت ورود/ثبت‌نام ---------------- */
  function succeed(j) {
    session = { token: j.token, name: j.profile.name, avatar: j.profile.avatar || "" };
    storeSession(session);
    storeProfile({ name: j.profile.name, avatar: j.profile.avatar || "" });
    closeGate();
    toast("✅ خوش آمدی، " + j.profile.name + "! حسابت امن شد");
    document.dispatchEvent(new CustomEvent("chesshub:auth-changed", { detail: { name: j.profile.name, avatar: j.profile.avatar } }));
    renderChipSync();
    // 🔄 بازیابی محتوای محلی که هنوز منتشر نشده — یک بار برای هر نشست
    try {
      if (!sessionStorage.getItem("chesshub_recovered_" + norm(j.profile.name))) {
        sessionStorage.setItem("chesshub_recovered_" + norm(j.profile.name), "1");
        recoverLocalContent(j.profile.name);
      }
    } catch (e) {}
  }

  function renderChipSync() {
    // چیپ هدر را از طریق رویداد profile-changed به‌روز می‌کنیم (profile.js گوش می‌دهد)
  }

  /* ---------------- بازیابی محتوای محلی ---------------- */
  function readList(key) {
    try {
      const l = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(l) ? l : [];
    } catch (e) {
      return [];
    }
  }
  function markServerId(key, localId, serverId) {
    const list = readList(key);
    const it = list.find(function (x) { return String(x.id) === String(localId); });
    if (it) {
      it.serverId = serverId;
      try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
    }
  }

  function recoverLocalContent(profileName) {
    if (!window.CommunityHub || typeof window.CommunityHub.save !== "function") return;
    const jobs = [];
    let recovered = 0;

    readList("chesshub_user_lessons").forEach(function (l) {
      if (!l || !l.title) return;
      if (l.serverId || String(l.id || "").indexOf("srv_") === 0) return;
      if (l.author && norm(l.author) !== norm(profileName)) return; // مال کاربر دیگری است
      jobs.push(
        window.CommunityHub.save("lessons", "publish", l.id, {
          title: l.title, category: l.category, level: l.level, duration: l.duration,
          description: l.description, thumbIcon: l.thumbIcon, color: l.color,
          content: l.content, author: profileName,
        })
          .then(function (j) {
            if (j.item && j.item.id) { markServerId("chesshub_user_lessons", l.id, j.item.id); recovered++; }
          })
          .catch(function () {})
      );
    });

    readList("chesshub_user_openings").forEach(function (o) {
      if (!o || !o.name) return;
      if (o.serverId || String(o.id || "").indexOf("srv_") === 0) return;
      if (o.author && norm(o.author) !== norm(profileName)) return;
      jobs.push(
        window.CommunityHub.save("openings", "publish", o.id, {
          name: o.name, moves: o.moves, categoryCode: o.categoryCode,
          categoryName: o.categoryName, thumbIcon: o.thumbIcon, color: o.color,
          variants: o.variants, author: profileName,
        })
          .then(function (j) {
            if (j.item && j.item.id) { markServerId("chesshub_user_openings", o.id, j.item.id); recovered++; }
          })
          .catch(function () {})
      );
    });

    if (jobs.length) {
      Promise.all(jobs).then(function () {
        if (recovered > 0) {
          toast("🔄 " + toFa(recovered) + " محتوای ذخیره‌شده‌ی قبلی تو برای همه منتشر شد ✅", 4200);
        }
      });
    }
  }
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[+d]; }); }

  /* ---------------- دکمه‌ی خروج در مودال پروفایل ---------------- */
  function watchProfileModal() {
    if (typeof MutationObserver === "undefined") return;
    const obs = new MutationObserver(function () {
      const ov = document.querySelector(".chp-info-overlay.open");
      if (!ov || ov.querySelector("#chaLogoutBtn")) return;
      const actions = ov.querySelector(".chp-info-actions");
      if (!actions) return;
      if (!session) return;
      const b = document.createElement("button");
      b.id = "chaLogoutBtn";
      b.className = "chp-info-change";
      b.innerHTML = '<i class="fas fa-right-from-bracket"></i> خروج از حساب';
      b.addEventListener("click", function () { api.logout(); ov.remove(); });
      actions.appendChild(b);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- راه‌اندازی ---------------- */
  function decideAndOpen(offlineFallback) {
    const p = readProfile();
    if (p && p.name) {
      if (offlineFallback) {
        // سرور از دسترس خارج — اجازه‌ی ادامه‌ی موقت (تا_SESSION)
        gateSkipVisible();
        openGate("upgrade");
        gateEl.querySelector("#chaSkip").style.display = "block";
        showErr("🟠 سرور فعلاً در دسترس نیست — می‌توانی فعلاً مهمان ادامه بدهی");
        return;
      }
      // آیا این نام حساب دارد؟
      fetchJSON("api/auth/status?name=" + encodeURIComponent(p.name), { cache: "no-store" }, 8000)
        .then(function (r) {
          const j = r.body;
          if (j && j.ok) {
            openGate(j.hasAccount ? "login" : "upgrade");
          } else {
            openGate("upgrade");
          }
        })
        .catch(function () {
          openGate("upgrade");
          gateSkipVisible();
        });
    } else {
      openGate("register");
    }
  }
  function gateSkipVisible() {
    if (gateEl) gateEl.querySelector("#chaSkip").style.display = "block";
  }

  function boot() {
    injectCSS();
    let skipped = false;
    try { skipped = !!sessionStorage.getItem(SKIP_KEY); } catch (e) {}

    // 🎮 v8.3 — وسط بازی (مثلاً رفرش در صفحه‌ی بازی آنلاین) پنجره‌ی
    // تمام‌صفحه خودکار باز نمی‌شود تا بازی به‌هم نخورد؛ فقط یک توست
    // راهنما + دکمه‌ی «ورود / ثبت‌نام» در هدر در دسترس است.
    let ingame = false;
    try { ingame = sessionStorage.getItem("chesshub_ingame") === "1"; } catch (e) {}

    if (session) {
      // اعتبارسنجی توکن با سرور
      fetchJSON("api/auth/me", { cache: "no-store", headers: { "X-Session-Token": session.token } }, 9000)
        .then(function (r) {
          const j = r.body;
          if (r.status === 200 && j && j.ok) {
            session = { token: session.token, name: j.profile.name, avatar: j.profile.avatar || session.avatar || "" };
            storeSession(session);
            // همگام‌سازی پروفایل محلی با حساب
            const p = readProfile();
            if (!p || p.name !== session.name || (session.avatar && p.avatar !== session.avatar)) {
              storeProfile({ name: session.name, avatar: session.avatar || (p && p.avatar) || "" });
            }
          } else if (r.status === 401) {
            storeSession(null);
            session = null;
            if (ingame) {
              toast("⚠️ نشستت منقضی شده — بعد از بازی با دکمه‌ی «ورود / ثبت‌نام» وارد شو", 5000);
            } else if (!skipped) {
              decideAndOpen(false);
            }
          } else {
            // خطای سرور — نشست محلی معتبر بماند
          }
        })
        .catch(function () {
          /* آفلاین — نشست محلی بماند */
        });
    } else if (!skipped) {
      // کمی صبر تا صفحه آماده شود (هدر و پروفایل)
      setTimeout(function () {
        if (ingame) {
          // 🎮 در بازی هستی — پنجره‌ی مسدودکننده باز نمی‌شود
          toast("👋 برای امنیت بیشتر و ذخیره‌ی بازی‌ها، با دکمه‌ی «ورود / ثبت‌نام» حسابت بساز", 5200);
        } else {
          decideAndOpen(false);
        }
      }, 450);
    }

    watchProfileModal();
  }

  /* ---------------- API سراسری ---------------- */
  const api = {
    KEY: SESSION_KEY,
    current: function () { return session ? { name: session.name, avatar: session.avatar } : null; },
    token: function () { return session ? session.token : ""; },
    isLoggedIn: function () { return !!session; },
    logout: function () {
      try {
        const t = session && session.token;
        session = null;
        storeSession(null);
        if (t) fetch("api/auth/logout", { method: "POST", headers: { "X-Session-Token": t } }).catch(function () {});
        try { sessionStorage.removeItem(SKIP_KEY); } catch (e) {}
        try { sessionStorage.removeItem("chesshub_ingame"); } catch (e) {}
        try { sessionStorage.removeItem("chesshub_last_game"); } catch (e) {}
        toast("🚪 از حساب خارج شدی — برای انتشار محتوا دوباره وارد شو");
        document.dispatchEvent(new CustomEvent("chesshub:auth-changed", { detail: { name: null } }));
        // 🎯 v8.3 — دیگر پنجره خودکار باز نمی‌شود؛ در هدر به‌جای پروفایل
        // دکمه‌ی «ورود / ثبت‌نام» می‌آید و با کلیک، پنل باز می‌شود
      } catch (e) {}
    },
    requireAuth: function (reason) {
      if (session) return true;
      openGate(readProfile() && readProfile().name ? "login" : "register");
      if (reason) toast(reason, 3600);
      return false;
    },
    // 🚪 v8.3 — باز کردن دستی پنجره‌ی ورود/ثبت‌نام (دکمه‌ی هدر بعد از خروج)
    openPanel: function () {
      decideAndOpen(false);
      return true;
    },
    onUnauthorized: function () {
      session = null;
      storeSession(null);
      // 🎮 v8.3 — وسط بازی، پنجره‌ی تمام‌صفحه بازی را خراب نمی‌کند
      let ingame = false;
      try { ingame = sessionStorage.getItem("chesshub_ingame") === "1"; } catch (e) {}
      if (ingame) {
        toast("⚠️ نشستت منقضی شده — بعد از بازی از دکمه‌ی «ورود / ثبت‌نام» وارد شو", 5000);
        return;
      }
      openGate(readProfile() && readProfile().name ? "login" : "register");
      if (gateEl) showErr("نشستت منقضی شده — دوباره وارد شو");
    },
    onChange: function (cb) {
      if (typeof cb !== "function") return;
      document.addEventListener("chesshub:auth-changed", function (e) { cb(e.detail); });
    },
    _toast: toast,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }

  return api;
})();
