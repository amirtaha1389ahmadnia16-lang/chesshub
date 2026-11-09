/* ============================================
   🔐 ChessHub | سیستم حساب کاربری (v9 — نسخه سبک)
   --------------------------------------------
   معماری جدید:
     صفحه ورود/ثبت‌نام = login.html (صفحه مستقل و سبک)
     این فایل دیگر هیچ UI ندارد — فقط منطق نشست:
       • هر بازدید بدون نشست از هر صفحه → انتقال مستقیم به login.html?next=…
         (بدون صفحهٔ واسط، بدون پیام اضافه)
       • خروج از حساب → انتقال مستقیم به login.html (بدون پیام اضافه)
       • کاربر واردشده → اعتبارسنجی توکن + همگام‌سازی پروفایل
     یعنی کد UI از این فایل (که روی همه صفحات لود می‌شود)
     حذف شده و سایت روی همه صفحات سبک‌تر و سریع‌تر است.

   API سراسری (بدون تغییر — سازگار با همه صفحات):
     window.ChessHubAuth.current()      → {name, avatar} یا null
     window.ChessHubAuth.token()        → توکن نشست یا ""
     window.ChessHubAuth.isLoggedIn()   → true/false
     window.ChessHubAuth.requireAuth(p) → انتقال به صفحه ورود
     window.ChessHubAuth.logout()       → خروج + انتقال مستقیم به صفحه ورود
     window.ChessHubAuth.openPanel()    → انتقال به صفحه ورود
     window.ChessHubAuth.onChange(cb)   → رویداد تغییر حساب
     window.ChessHubAuth.onUnauthorized() → خروج اجباری (۴۰۱)
   ============================================ */
window.ChessHubAuth = (function () {
  "use strict";

  const SESSION_KEY = "chesshub_session";
  const PROFILE_KEY = "chesshub_profile";
  const AUTHOR_KEY = "chesshub_author_name";
  const AUTH_PAGE = "login.html";
  const DEFAULT_AVATAR = "images/avatars/1.png";

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
    if (window.ChessHubAuthor && typeof window.ChessHubAuthor.set === "function") {
      window.ChessHubAuthor.set(p.name);
    }
    document.dispatchEvent(
      new CustomEvent("chesshub:profile-changed", { detail: { name: p.name, avatar: p.avatar } })
    );
  }

  let session = readSession();

  /* ---------------- ابزار ---------------- */
  function norm(v) { return String(v || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[+d]; }); }

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

  /* ---------------- توست ---------------- */
  const TOAST_CSS =
    ".cha-toast{position:fixed;bottom:1.2rem;right:50%;transform:translateX(50%);z-index:100001;" +
    "background:#0e2a55;color:#fff;padding:.75rem 1.3rem;border-radius:14px;font-size:.85rem;" +
    "font-family:inherit;box-shadow:0 12px 34px rgba(14,42,85,.35);opacity:0;transition:opacity .25s;" +
    "max-width:92vw;text-align:center;pointer-events:none}.cha-toast.show{opacity:1}";
  let toastEl = null;
  function toast(msg, ms) {
    try {
      if (!document.getElementById("cha-toast-style")) {
        const st = document.createElement("style");
        st.id = "cha-toast-style";
        st.textContent = TOAST_CSS;
        document.head.appendChild(st);
      }
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "cha-toast";
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3200);
    } catch (e) {}
  }

  /* ---------------- آدرس صفحه ورود ---------------- */
  function isAuthPage() {
    try { return location.pathname.split("/").pop() === AUTH_PAGE; } catch (e) { return false; }
  }

  // مقصد امن بعد از ورود — فقط مسیرهای داخلی مجازند
  function safeNext() {
    try {
      const q = new URLSearchParams(location.search);
      let n = String(q.get("next") || "").trim();
      if (!n) return "index.html";
      if (n.indexOf("..") >= 0 || n.indexOf("\\") >= 0 || n.indexOf("//") === 0) return "index.html";
      if (n.toLowerCase().indexOf("javascript") >= 0 || n.indexOf(":") >= 0) return "index.html";
      if (/^\/[A-Za-z0-9._\-\/]*$/.test(n) || /^[A-Za-z0-9._\-]+\.html$/.test(n)) {
        if (n.split("/").pop() === AUTH_PAGE) return "index.html";
        return n;
      }
      return "index.html";
    } catch (e) {
      return "index.html";
    }
  }

  function toLogin(next) {
    const target = next || (location.pathname + location.search);
    location.replace(AUTH_PAGE + "?next=" + encodeURIComponent(target));
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
      if (l.author && norm(l.author) !== norm(profileName)) return;
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
  function boot() {
    // صفحه ورود: اگر وارد شده، برو به مقصد؛ وگرنه login.js کارش را می‌کند
    if (isAuthPage()) {
      if (session) location.replace(safeNext());
      return;
    }

    // هر بازدید بدون نشست → انتقال مستقیم به صفحه ورود (بدون پیام واسط)
    if (!session) {
      toLogin();
      return;
    }

    // اعتبارسنجی توکن با سرور
    fetchJSON("api/auth/me", { cache: "no-store", headers: { "X-Session-Token": session.token } }, 9000)
      .then(function (r) {
        const j = r.body;
        if (r.status === 200 && j && j.ok) {
          session = {
            token: session.token,
            name: j.profile.name,
            avatar: j.profile.avatar || session.avatar || DEFAULT_AVATAR,
          };
          storeSession(session);
          const p = readProfile();
          if (!p || p.name !== session.name || (session.avatar && p.avatar !== session.avatar)) {
            storeProfile({ name: session.name, avatar: session.avatar || (p && p.avatar) || DEFAULT_AVATAR });
          }
          // 🔄 بازیابی محتوای محلی منتشرنشده — یک بار برای هر نشست
          try {
            if (!sessionStorage.getItem("chesshub_recovered_" + norm(j.profile.name))) {
              sessionStorage.setItem("chesshub_recovered_" + norm(j.profile.name), "1");
              recoverLocalContent(j.profile.name);
            }
          } catch (e) {}
        } else if (r.status === 401) {
          storeSession(null);
          session = null;
          toLogin();
        }
        // خطای دیگر سرور یا قطعی اینترنت → نشست محلی معتبر بماند
      })
      .catch(function () {
        /* آفلاین — نشست محلی بماند */
      });

    watchProfileModal();
  }

  /* ---------------- API سراسری ---------------- */
  const api = {
    KEY: SESSION_KEY,
    current: function () { return session ? { name: session.name, avatar: session.avatar } : null; },
    token: function () { return session ? session.token : ""; },
    isLoggedIn: function () { return !!session; },
    safeNext: safeNext,
    logout: function () {
      try {
        const t = session && session.token;
        session = null;
        storeSession(null);
        if (t) fetch("api/auth/logout", { method: "POST", headers: { "X-Session-Token": t } }).catch(function () {});
        try { sessionStorage.removeItem("chesshub_ingame"); } catch (e) {}
        try { sessionStorage.removeItem("chesshub_last_game"); } catch (e) {}
        document.dispatchEvent(new CustomEvent("chesshub:auth-changed", { detail: { name: null } }));
        // خروج → انتقال مستقیم به صفحه ورود؛ بدون پیام یا صفحهٔ واسط
        toLogin("index.html");
      } catch (e) {}
    },
    requireAuth: function () {
      if (session) return true;
      toLogin();
      return false;
    },
    openPanel: function () {
      toLogin();
      return true;
    },
    onUnauthorized: function () {
      session = null;
      storeSession(null);
      toLogin();
    },
    onChange: function (cb) {
      if (typeof cb !== "function") return;
      document.addEventListener("chesshub:auth-changed", function (e) { cb(e.detail); });
    },
    // فقط login.js استفاده می‌کند — ذخیره نشست بعد از ورود/ثبت‌نام موفق
    _applyLogin: function (j) {
      session = { token: j.token, name: j.profile.name, avatar: j.profile.avatar || DEFAULT_AVATAR };
      storeSession(session);
      storeProfile({ name: j.profile.name, avatar: session.avatar });
      document.dispatchEvent(
        new CustomEvent("chesshub:auth-changed", { detail: { name: j.profile.name, avatar: session.avatar } })
      );
      return session;
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
