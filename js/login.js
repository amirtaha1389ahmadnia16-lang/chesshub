/* ============================================
   🔐 ChessHub | منطق صفحه ورود/ثبت‌نام (login.html)
   --------------------------------------------
   • دو فرم: ورود (ایمیل یا نام کاربری + رمز) و ثبت‌نام
     (ایمیل + نام کاربری + رمز + تکرار رمز)
   • اعتبارسنجی محلی کوتاه + پیام خطای سرور
   • کاربر قدیمی (بدون رمز) → حالت «انتخاب رمز» (upgrade)
   • بعد از موفقیت: ذخیره نشست و انتقال به صفحه مقصد
   ============================================ */
(function () {
  "use strict";

  const AUTH = window.ChessHubAuth;
  if (!AUTH) return;

  const $ = function (id) { return document.getElementById(id); };

  const el = {
    tabs: $("tabs"),
    tabLogin: $("tabLogin"),
    tabRegister: $("tabRegister"),
    msg: $("msg"),
    msgIcon: $("msgIcon"),
    msgText: $("msgText"),
    loginForm: $("loginForm"),
    registerForm: $("registerForm"),
    upgradePane: $("upgradePane"),
    upgradeForm: $("upgradeForm"),
    loginId: $("loginId"),
    loginPw: $("loginPw"),
    loginBtn: $("loginBtn"),
    regEmail: $("regEmail"),
    regName: $("regName"),
    regPw: $("regPw"),
    regPw2: $("regPw2"),
    regBtn: $("regBtn"),
    goRegister: $("goRegister"),
    goLogin: $("goLogin"),
    upAvatar: $("upAvatar"),
    upName: $("upName"),
    upPw: $("upPw"),
    upPw2: $("upPw2"),
    upBtn: $("upBtn"),
    upBack: $("upBack"),
  };

  let mode = "login"; // login | register | upgrade
  let upgradeName = "";

  /* ---------------- پیام‌ها ---------------- */
  function showMsg(text, icon) {
    el.msgIcon.className = "fas " + (icon || "fa-circle-info");
    el.msgText.textContent = text;
    el.msg.classList.add("show");
  }
  function hideMsg() { el.msg.classList.remove("show"); }

  function setErr(id, text) {
    const box = $("err-" + id);
    const input = $(id);
    if (!box || !input) return;
    if (text) {
      box.innerHTML = '<i class="fas fa-circle-exclamation"></i> ' + text;
      box.classList.add("show");
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
    } else {
      box.textContent = "";
      box.classList.remove("show");
      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    }
  }
  function clearErrors(form) {
    form.querySelectorAll(".err").forEach(function (b) { b.classList.remove("show"); b.textContent = ""; });
    form.querySelectorAll("input").forEach(function (i) {
      i.classList.remove("invalid");
      i.removeAttribute("aria-invalid");
    });
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) {
      btn._old = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' + label;
    } else {
      btn.innerHTML = btn._old || btn.innerHTML;
    }
  }

  /* ---------------- تب‌ها ---------------- */
  function setMode(m) {
    mode = m;
    hideMsg();
    el.tabLogin.classList.toggle("active", m === "login");
    el.tabRegister.classList.toggle("active", m === "register");
    el.loginForm.hidden = m !== "login";
    el.registerForm.hidden = m !== "register";
    el.upgradePane.hidden = m !== "upgrade";
    el.tabs.hidden = m === "upgrade";
    const first =
      m === "login" ? el.loginId : m === "register" ? el.regEmail : el.upPw;
    if (first) first.focus();
  }

  el.tabLogin.addEventListener("click", function () { setMode("login"); });
  el.tabRegister.addEventListener("click", function () { setMode("register"); });
  el.goRegister.addEventListener("click", function () { setMode("register"); });
  el.goLogin.addEventListener("click", function () { setMode("login"); });
  el.upBack.addEventListener("click", function () {
    el.loginId.value = "";
    setMode("login");
  });

  /* نمایش/پنهان رمز */
  document.querySelectorAll(".eye").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = $(this.getAttribute("data-for"));
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      this.innerHTML =
        input.type === "password"
          ? '<i class="fas fa-eye"></i>'
          : '<i class="fas fa-eye-slash"></i>';
    });
  });

  /* ---------------- اعتبارسنجی ---------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const NAME_BAD = /[<>"'\\/{}$`]/;

  function validEmail(v) {
    return EMAIL_RE.test(String(v || "").trim());
  }
  function validName(v) {
    const s = String(v || "").trim().replace(/\s+/g, " ");
    if (s.length < 2 || s.length > 16) return false;
    if (NAME_BAD.test(s)) return false;
    return true;
  }
  function passwordError(pw, name) {
    const p = String(pw || "");
    if (p.length < 6) return "رمز باید حداقل ۶ کاراکتر باشد";
    if (!/[a-zA-Z\u0600-\u06FF]/.test(p) || !/[0-9]/.test(p)) {
      return "رمز باید شامل حرف و رقم باشد";
    }
    if (name && p.trim().toLowerCase() === String(name).trim().toLowerCase()) {
      return "رمز نمی‌تواند همان نام کاربری باشد";
    }
    return "";
  }

  /* ---------------- API ---------------- */
  function postJSON(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () { return null; })
          .then(function (j) { return { status: r.status, body: j }; });
      })
      .catch(function () { throw new Error("network"); });
  }

  function finish(j) {
    AUTH._applyLogin(j);
    showMsg(
      mode === "register" ? "حساب ساخته شد — در حال انتقال…" : "ورود موفق — در حال انتقال…",
      "fa-circle-check"
    );
    setTimeout(function () { location.replace(AUTH.safeNext()); }, 650);
  }

  /* ---------------- ورود ---------------- */
  el.loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (el.loginBtn.disabled) return;
    clearErrors(el.loginForm);
    hideMsg();
    const idv = String(el.loginId.value || "").trim();
    const pw = el.loginPw.value;
    let bad = false;
    if (!idv) { setErr("loginId", "این فیلد الزامی است"); bad = true; }
    if (!pw) { setErr("loginPw", "این فیلد الزامی است"); bad = true; }
    if (bad) return;

    busy(el.loginBtn, true, "در حال ورود…");
    postJSON("api/auth/login", { name: idv, password: pw })
      .then(function (r) {
        const j = r.body;
        if (r.status === 200 && j && j.ok) return finish(j);
        busy(el.loginBtn, false);
        // حساب قدیمی بدون رمز؟ (فقط برای نام — ایمیل ارتقا ندارد)
        if (r.status === 401 && idv.indexOf("@") < 0) {
          fetch("api/auth/status?name=" + encodeURIComponent(idv), { cache: "no-store" })
            .then(function (x) { return x.json(); })
            .then(function (s) {
              if (s && s.ok && !s.hasAccount && s.legacy) {
                openUpgrade(idv, s.avatar);
                return;
              }
              showMsg((j && j.error) || "ورود ناموفق بود", "fa-circle-exclamation");
            })
            .catch(function () {
              showMsg((j && j.error) || "ورود ناموفق بود", "fa-circle-exclamation");
            });
          return;
        }
        showMsg((j && j.error) || "ورود ناموفق بود — دوباره تلاش کن", "fa-circle-exclamation");
      })
      .catch(function () {
        busy(el.loginBtn, false);
        showMsg("ارتباط با سرور برقرار نشد — دوباره تلاش کن", "fa-circle-exclamation");
      });
  });

  /* ---------------- ثبت‌نام ---------------- */
  el.registerForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (el.regBtn.disabled) return;
    clearErrors(el.registerForm);
    hideMsg();

    const email = String(el.regEmail.value || "").trim();
    const name = String(el.regName.value || "").trim().replace(/\s+/g, " ");
    const pw = el.regPw.value;
    const pw2 = el.regPw2.value;

    let bad = false;
    if (!email) { setErr("regEmail", "این فیلد الزامی است"); bad = true; }
    else if (!validEmail(email)) { setErr("regEmail", "ایمیل معتبر نیست"); bad = true; }
    if (!name) { setErr("regName", "این فیلد الزامی است"); bad = true; }
    else if (!validName(name)) { setErr("regName", "نام کاربری باید ۲ تا ۱۶ کاراکتر مجاز باشد"); bad = true; }
    const perr = passwordError(pw, name);
    if (perr) { setErr("regPw", perr); bad = true; }
    if (pw !== pw2) { setErr("regPw2", "رمزها یکسان نیستند"); bad = true; }
    if (bad) {
      const firstBad = el.registerForm.querySelector("input.invalid");
      if (firstBad) firstBad.focus();
      return;
    }

    busy(el.regBtn, true, "در حال ثبت‌نام…");
    postJSON("api/auth/register", { name: name, email: email, password: pw })
      .then(function (r) {
        const j = r.body;
        if (r.status === 200 && j && j.ok) return finish(j);
        busy(el.regBtn, false);
        if (j && j.needUpgrade) return openUpgrade(name, "");
        showMsg((j && j.error) || "ثبت‌نام ناموفق بود — دوباره تلاش کن", "fa-circle-exclamation");
      })
      .catch(function () {
        busy(el.regBtn, false);
        showMsg("ارتباط با سرور برقرار نشد — دوباره تلاش کن", "fa-circle-exclamation");
      });
  });

  /* ---------------- ارتقای حساب قدیمی ---------------- */
  function openUpgrade(name, avatar) {
    upgradeName = name;
    el.upName.textContent = name;
    if (avatar) {
      el.upAvatar.src = avatar;
      el.upAvatar.hidden = false;
      el.upAvatar.onerror = function () { this.hidden = true; };
    } else {
      el.upAvatar.hidden = true;
    }
    setMode("upgrade");
    setTimeout(function () { el.upPw.focus(); }, 120);
  }

  if (el.upgradeForm) {
    el.upgradeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (el.upBtn.disabled) return;
      clearErrors(el.upgradeForm);
      hideMsg();
      const pw = el.upPw.value;
      const pw2 = el.upPw2.value;
      let bad = false;
      const perr = passwordError(pw, upgradeName);
      if (perr) { setErr("upPw", perr); bad = true; }
      if (pw !== pw2) { setErr("upPw2", "رمزها یکسان نیستند"); bad = true; }
      if (bad) return;

      busy(el.upBtn, true, "در حال ذخیره…");
      postJSON("api/auth/upgrade", { name: upgradeName, password: pw })
        .then(function (r) {
          const j = r.body;
          if (r.status === 200 && j && j.ok) return finish(j);
          busy(el.upBtn, false);
          showMsg((j && j.error) || "ذخیره رمز ناموفق بود", "fa-circle-exclamation");
        })
        .catch(function () {
          busy(el.upBtn, false);
          showMsg("ارتباط با سرور برقرار نشد — دوباره تلاش کن", "fa-circle-exclamation");
        });
    });
  }

  /* شروع — تب از هش URL */
  if (location.hash === "#register") setMode("register");
  else setMode("login");
})();
