# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════
♛ ChessHub — نصب‌کنندهٔ v11.34
═══════════════════════════════════════════════════════════════
استفاده:
    python apply-v1134.py [مسیر پوشهٔ chesshub]

اگر مسیر داده نشود، همین پوشه‌ای که اسکریپت در آن است را پچ می‌کند.

کارها:
  ۱) جایگزینی کامل js/gamereview.js  → نسخهٔ v11.34 (موتور دومرحله‌ای
     + همهٔ اصلاحات مرور + دکمهٔ تحلیل + فونت‌ها + آواتار)
  ۲) جایگزینی کامل game-review.html  → صفحهٔ مرور v11.34
  ۳) افزودن دلتای CSS به css/gamereview.css (گزارش پهن‌تر، فونت‌ها…)
  ۴) تعمیر لودر PGN→آنالیز در js/analysis.js (تا «تحلیل بازی» واقعاً
     PGN را لود کند — با تأییدِ موفقیت و تلاش مجدد تا آماده‌شدن صفحه)
  ۵) نمایش بازی (games-database):
       • حذف نوشتهٔ راهنمای کیبورد
       • عکس بازیکنانِ هدرِ نمایش‌گر بزرگ‌تر (۴۶px)
       • اگر بازیکنی عکس نداشت → پیادهٔ شطرنجِ همان طرف
         (سیاه: آدمک سیاه/زمینهٔ سفید — سفید: آدمک سفید/زمینهٔ سیاه)
  ۶) daily-puzzle: کارت پازل دقیقاً زیر نوشتهٔ «پازل روزانه / هر روز
     یک پازل تازه» می‌نشیند (بدون بالا آمدنِ اضافی)
  ۷) script.js: آدمک پیاده (اگر نسخهٔ انسانی قدیمی بود)
  ۸) admin.html: لینک استایل اختصاصی css/admin-v1134.css
  ۹) بامپ ارجاع‌های نسخه → ?v=11.34

امنیت:
  • از هر فایل قبل از تغییر، نسخهٔ پشتیبان با پسوند .bak1134 ساخته می‌شود
  • همهٔ پچ‌ها «جُردار» (idempotent) هستند — اجرای دوباره چیزی را خراب نمی‌کند
  • اگر قلابی پیدا نشود، آن گام رد می‌شود و در گزارش می‌آید
"""
import io, os, re, sys, shutil

def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    with io.open(p, "w", encoding="utf-8") as f:
        f.write(s)

REPORT = []
SKIPPED = []

def patch(path, subs, kind="auto"):
    """subs = [(old, new, label), ...] — همه یا هیچ؛ اگر هیچ قلابی نبود رد می‌شود"""
    if not os.path.exists(path):
        SKIPPED.append(path + "  (فایل نیست)")
        return False
    s = read(path)
    orig = s
    for old, new, label in subs:
        if old in s:
            s = s.replace(old, new, 1)
            REPORT.append("  ✓ " + label + "  →  " + path)
        elif new in s and label.endswith("(idempotent)"):
            REPORT.append("  ⚬ قبلاً اعمال شده: " + label + "  →  " + path)
        else:
            SKIPPED.append(path + "  ::  " + label)
    if s != orig:
        bak = path + ".bak1134"
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
        write(path, s)
        return True
    return False

def replace_file(dst, src, label):
    if not os.path.exists(src):
        SKIPPED.append(label + ": فایل جدید کنار نصب‌کننده نیست (" + src + ")")
        return
    if os.path.abspath(src) == os.path.abspath(dst):
        REPORT.append("  ⚬ همان فایل است، رد شد: " + label)
        return
    if os.path.exists(dst):
        bak = dst + ".bak1134"
        if not os.path.exists(bak):
            shutil.copy2(dst, bak)
    shutil.copy2(src, dst)
    REPORT.append("  ✓ " + label + "  →  " + dst)

def append_css(dst, block, marker, label):
    if not os.path.exists(dst):
        SKIPPED.append(label + ": " + dst + " نیست")
        return
    s = read(dst)
    if marker in s:
        REPORT.append("  ⚬ قبلاً اعمال شده: " + label)
        return
    bak = dst + ".bak1134"
    if not os.path.exists(bak):
        shutil.copy2(dst, bak)
    write(dst, s.rstrip() + "\n" + block)
    REPORT.append("  ✓ " + label + "  →  " + dst)

def bump_versions(path):
    if not os.path.exists(path):
        return
    s = read(path)
    s2 = re.sub(r"\?v=11\.3[0-3]", "?v=11.34", s)
    if s2 != s:
        write(path, s2)
        REPORT.append("  ✓ بامپ نسخه‌ها  →  " + path)

# ── مسیر هدف ──
base = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
here = os.path.dirname(os.path.abspath(__file__))
print("=" * 62)
print("♛ نصب ChessHub v11.34 روی: " + base)
print("=" * 62)

NEW = lambda n: os.path.join(here, n)

# ۱+۲) فایل‌های کاملِ جدید
replace_file(os.path.join(base, "js", "gamereview.js"), NEW("gamereview.js"),
             "موتور مرور بازی v11.34 (دومرحله‌ای + همهٔ اصلاحات)")
replace_file(os.path.join(base, "game-review.html"), NEW("game-review.html"),
             "صفحهٔ مرور بازی v11.34")

# ۳) دلتای CSS مرور
GR_DELTA = read(NEW("gamereview-delta.css")) if os.path.exists(NEW("gamereview-delta.css")) else ""
if GR_DELTA:
    append_css(os.path.join(base, "css", "gamereview.css"), "\n" + GR_DELTA,
               "ChessHub — دلتای مرور بازی v11.34", "دلتای CSS مرور (گزارش پهن‌تر، فونت‌ها، آواتارها)")

# ۴) تعمیر لودر PGN→آنالیز در analysis.js
OLD_HOOK_1 = """    /* 🔑 v11.33 — «تحلیل در آنالیز»: بازیِ رسیده از مرور بازی/پایگاه
       بازی‌ها به‌صورت خودکار با PGN کامل باز می‌شود */
    try {
      if (new URLSearchParams(location.search).get("autopgn") === "1") {
        const handed = localStorage.getItem("chesshub_analyze_pgn");
        if (handed) {
          localStorage.removeItem("chesshub_analyze_pgn");
          setTimeout(function () {
            try { loadPgnText(String(handed || "")); } catch (e) {}
          }, 450);
        }
      }
    } catch (e) {}"""
NEW_HOOK_1 = """    /* 🔑 v11.34 — «تحلیل در آنالیز»: منتظرِ آماده‌شدن کامل صفحه می‌مانَد
       و تا PGN واقعاً وارد فهرست حرکات نشود، تلاش را تکرار می‌کند */
    try {
      if (new URLSearchParams(location.search).get("autopgn") === "1") {
        const handed = localStorage.getItem("chesshub_analyze_pgn");
        if (handed) {
          (function apWait() {
            let tries = 0;
            const mlProbe = function () {
              const ml = document.querySelector("#moveList, .move-list, [id*='move']");
              return ml ? ml.textContent.replace(/\\s+/g, "").length : 0;
            };
            const beforeLen = mlProbe();
            const iv = setInterval(function () {
              tries++;
              let grew = false;
              try { loadPgnText(String(handed || "")); } catch (e) {}
              try {
                const nowLen = mlProbe();
                if (nowLen > beforeLen + 4) {
                  grew = true;
                }
              } catch (e) {}
              if (grew || tries > 40) {
                clearInterval(iv);
                try { localStorage.removeItem("chesshub_analyze_pgn"); } catch (e) {}
                try {
                  const ev = new CustomEvent("chesshub:autopgn-loaded");
                  document.dispatchEvent(ev);
                } catch (e) {}
              }
            }, 350);
          })();
        }
      }
    } catch (e) {}"""
patch(os.path.join(base, "js", "analysis.js"),
      [(OLD_HOOK_1, NEW_HOOK_1, "تعمیر لودر PGN→آنالیز (تأیید لود + تلاش مجدد)")])

# فالبک دوم: اگر بلوک قدیمی نبود، نسخهٔ فشرده را بعد از init بگذار
FALLBACK_ANCHOR = """  async function init() {
    if (typeof Chess === "undefined") return;"""
FALLBACK_HOOK = """  async function init() {
    if (typeof Chess === "undefined") return;
    /* 🔑 v11.34 — لودر PGN رسیده از مرور/پایگاه با تأییدِ موفقیت */
    try {
      if (new URLSearchParams(location.search).get("autopgn") === "1" &&
          localStorage.getItem("chesshub_analyze_pgn")) {
        (function apWait() {
          const handed = localStorage.getItem("chesshub_analyze_pgn");
          let tries = 0;
          const mlProbe = function () {
            const ml = document.querySelector("#moveList, .move-list, [id*='move']");
            return ml ? ml.textContent.replace(/\\s+/g, "").length : 0;
          };
          const beforeLen = mlProbe();
          const iv = setInterval(function () {
            tries++;
            try { loadPgnText(String(handed || "")); } catch (e) {}
            if (mlProbe() > beforeLen + 4 || tries > 40) {
              clearInterval(iv);
              try { localStorage.removeItem("chesshub_analyze_pgn"); } catch (e) {}
            }
          }, 350);
        })();
      }
    } catch (e) {}"""
patch(os.path.join(base, "js", "analysis.js"),
      [(FALLBACK_ANCHOR, FALLBACK_HOOK, "لودر PGN (فالبک) (idempotent)")])

# ۵) نمایش بازی — games-database.html
GDB = os.path.join(base, "games-database.html")
HINT_OLD = """                <div class="viewer-kbd-hint"><i class="fas fa-keyboard"></i> فلش چپ/راست = حرکت قبل/بعد &nbsp;•&nbsp; دکمهٔ فاصله = پخش کامل بازی &nbsp;•&nbsp; کلیک‌راست و کشیدن = فلش‌کشی</div>
"""
patch(GDB, [(HINT_OLD, "", "حذف نوشتهٔ راهنمای کیبورد از نمایش بازی")])

patch(GDB, [
    ("""<span class="v-player"><img src="${gdPhoto(game.white, "w")}" alt="" draggable="false">${esc(game.white)}</span>""",
     """<span class="v-player"><img src="${gdPhoto(game.white, "w")}" onerror="grPawn(this,'w')" alt="" draggable="false">${esc(game.white)}</span>""",
     "آدمک سفیدِ پیاده برای سفیدِ بی‌عکس"),
    ("""<span class="v-player"><img src="${gdPhoto(game.black, "b")}" alt="" draggable="false">${esc(game.black)}</span>""",
     """<span class="v-player"><img src="${gdPhoto(game.black, "b")}" onerror="grPawn(this,'b')" alt="" draggable="false">${esc(game.black)}</span>""",
     "آدمک سیاهِ پیاده برای سیاهِ بی‌عکس"),
])

append_css(GDB, """
        /* 🔑 v11.34 — عکس بازیکنانِ نمایش‌گر بزرگ‌تر */
        .viewer-header .v-player img { width: 46px; height: 46px; }
        .viewer-header .v-player { font-size: 0.95rem; }
""", "v11.34 — عکس بازیکنانِ نمایش‌گر", "عکس بزرگ‌تر در هدر نمایش‌گر")

PAWN_HELPER = """
  <script>
    /* 🔑 v11.34 — اگر عکس بازیکن لود نشد: پیادهٔ شطرنج با رنگ همان طرف */
    window.grPawn = function (img, side) {
      if (img.dataset.pawn) return;
      img.dataset.pawn = "1";
      try {
        img.src = (window.ChessUtils && ChessUtils.bustAvatar)
          ? ChessUtils.bustAvatar(side)
          : "";
      } catch (e) {}
    };
  </script>"""
if os.path.exists(GDB):
    s = read(GDB)
    if "window.grPawn" not in s and "</body>" in s:
        bak = GDB + ".bak1134"
        if not os.path.exists(bak):
            shutil.copy2(GDB, bak)
        write(GDB, s.replace("</body>", PAWN_HELPER + "\n</body>", 1))
        REPORT.append("  ✓ کمکیِ grPawn  →  games-database.html")

# ۶) daily-puzzle: کارت پازل دقیقاً زیر نوشتهٔ عنوان
DP_OLD_FULL = """      @media (min-width: 861px) {
        /* 🔑 v11.33 — کارت پازل هم مثل تاریخچه بالا می‌رود و دقیقاً
           زیر عنوان «پازل روزانه» می‌نشیند (هم‌ارتفاعِ تاریخچه زیر نشان) */
        .dp-main { margin-inline-start: auto; margin-top: -26px; }
      }"""
DP_NEW_FULL = """      @media (min-width: 861px) {
        /* 🔑 v11.34 — کارت پازل کاملاً «زیرِ» نوشتهٔ «پازل روزانه / هر روز
           یک پازل تازه» می‌نشیند — بدون بالا آمدنِ کنارِ عنوان */
        .dp-main { margin-inline-start: auto; margin-top: 0; }
      }"""
DP_OLD_SHORT = ".dp-main { margin-inline-start: auto; margin-top: -26px; }"
DP_NEW_SHORT = ".dp-main { margin-inline-start: auto; margin-top: 0; }"
patch(os.path.join(base, "daily-puzzle.html"), [
    (DP_OLD_FULL, DP_NEW_FULL, "کارت پازل زیر عنوان (کامل)"),
    (DP_OLD_SHORT, DP_NEW_SHORT, "کارت پازل زیر عنوان (کوتاه)"),
])

# ۷) script.js — آدمک پیاده اگر نسخهٔ انسانی بود
BUST_OLD = """    bustAvatar(side) {
      const bg = side === "b" ? "#e8edf5" : "#22303f";
      const fg = side === "b" ? "#26313d" : "#f4f7fb";
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="14" fill="' + bg + '"/>' +
        '<circle cx="32" cy="23.5" r="12.5" fill="' + fg + '"/>' +
        '<path d="M9 62c0-14.5 10.5-22 23-22s23 7.5 23 22z" fill="' + fg + '"/>' +
        "</svg>";
      return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
    },"""
BUST_NEW = """    bustAvatar(side) {
      /* 🔑 v11.34 — آدمک = سیلوئت «پیادهٔ شطرنج» با رنگ همان طرف:
         بازیکن سفید بدون عکس → پیادهٔ سفید روی زمینهٔ تیره؛
         بازیکن سیاه بدون عکس → پیادهٔ سیاه روی زمینهٔ روشن */
      const bg = side === "b" ? "#e8edf5" : "#22303f";
      const fg = side === "b" ? "#26313d" : "#f4f7fb";
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="14" fill="' + bg + '"/>' +
        '<g fill="' + fg + '">' +
        '<circle cx="32" cy="16.5" r="7.5"/>' +
        '<path d="M27.2 25.5h9.6l1.7 5.6c3.5 3.3 5.6 8.4 5.6 13.9H19.9c0-5.5 2.1-10.6 5.6-13.9z"/>' +
        '<rect x="15.5" y="46.5" width="33" height="6.5" rx="3.2"/>' +
        "</g></svg>";
      return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
    },"""
patch(os.path.join(base, "js", "script.js"),
      [(BUST_OLD, BUST_NEW, "آدمک پیادهٔ شطرنج در script.js")])

# ۸) پنل ادمین — استایل اختصاصی
if os.path.exists(NEW("admin-v1134.css")):
    shutil.copy2(NEW("admin-v1134.css"), os.path.join(base, "css", "admin-v1134.css"))
    ADMIN = os.path.join(base, "admin.html")
    if os.path.exists(ADMIN):
        s = read(ADMIN)
        if "css/admin-v1134.css" not in s:
            bak = ADMIN + ".bak1134"
            if not os.path.exists(bak):
                shutil.copy2(ADMIN, bak)
            s2 = s.replace("</head>",
                '  <link rel="stylesheet" href="css/admin-v1134.css?v=11.34" />\n</head>', 1)
            if s2 != s:
                write(ADMIN, s2)
                REPORT.append("  ✓ استایل اختصاصی ادمین  →  admin.html + css/admin-v1134.css")
        else:
            REPORT.append("  ⚬ قبلاً اعمال شده: استایل ادمین (idempotent)")

# ۹) بامپ نسخه‌ها در همهٔ صفحات
for f in sorted(os.listdir(base)):
    if f.endswith(".html"):
        bump_versions(os.path.join(base, f))

# ── گزارش ──
print("")
print("── اعمال‌شده ──")
for r in REPORT:
    print(r)
if SKIPPED:
    print("")
    print("── ردشده (قلاب در نسخهٔ شما متفاوت است — نگران نباشید) ──")
    for s in SKIPPED:
        print("  • " + s)
print("")
print("✅ تمام شد. نسخهٔ پشتیبان هر فایل با پسوند .bak1134 کنار همان فایل است.")
print("   حالا server.js را ری‌استارت کن و صفحات را با Ctrl+F5 باز کن.")
