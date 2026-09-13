/* ============================================
   📖 ChessHub | راهنمای همکاری (دروس/گشایش‌ها/مقالات)
   --------------------------------------------
   دکمه‌ی «راهنما» در هر بخش، این پنجره را باز می‌کند و
   به همکاران توضیح می‌دهد چه‌طور محتوای خود را بنویسند و منتشر کنند.

   API سراسری:
     window.ContribGuide.open("openings")   → راهنمای گشایش‌ها
     window.ContribGuide.open("lessons")    → راهنمای دروس
     window.ContribGuide.open("articles")   → راهنمای مقالات

   استفاده در HTML:
     <button onclick="ContribGuide.open('openings')">راهنما</button>
   ============================================ */
window.ContribGuide = (function () {
  "use strict";

  /* ---------------- استایل ---------------- */
  const CSS =
    ".cgu-overlay{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;" +
    "background:rgba(16,26,48,.62);padding:1rem;font-family:inherit}" +
    ".cgu-overlay.open{display:flex}" +
    ".cgu-card{background:#fff;border-radius:20px;max-width:680px;width:100%;max-height:88vh;display:flex;flex-direction:column;" +
    "box-shadow:0 30px 80px rgba(0,0,0,.4);overflow:hidden}" +
    ".cgu-head{display:flex;align-items:center;gap:.6rem;padding:1rem 1.3rem;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff}" +
    ".cgu-head i{font-size:1.2rem}" +
    ".cgu-head h3{margin:0;font-size:1rem;font-weight:800;flex:1}" +
    ".cgu-close{background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:10px;" +
    "cursor:pointer;font-size:1rem;flex-shrink:0}" +
    ".cgu-close:hover{background:rgba(255,255,255,.32)}" +
    ".cgu-body{padding:1.2rem 1.4rem 1.4rem;overflow-y:auto;text-align:right;color:#17203a;line-height:2.1;font-size:.85rem}" +
    ".cgu-sec{margin-bottom:1.15rem}" +
    ".cgu-sec:last-child{margin-bottom:0}" +
    ".cgu-sec h4{margin:0 0 .45rem;font-size:.92rem;font-weight:800;color:#4c3f9e;display:flex;align-items:center;gap:.4rem}" +
    ".cgu-sec h4 i{font-size:.85rem}" +
    ".cgu-sec p{margin:0 0 .4rem;color:#3c465e}" +
    ".cgu-sec ul{margin:.2rem 0 .4rem;padding-right:1.2rem;color:#3c465e}" +
    ".cgu-sec li{margin-bottom:.3rem}" +
    ".cgu-sec b{color:#17203a}" +
    "code.cgu-m{direction:ltr;unicode-bidi:isolate;display:inline-block;background:#efecfd;border:1px solid #ddd5f8;" +
    "color:#4c3f9e;border-radius:7px;padding:.05rem .45rem;font-weight:700;font-size:.8rem;margin:0 .15rem;font-family:monospace}" +
    ".cgu-tip{background:#eef8f2;border:1px solid #cdebdb;border-radius:12px;padding:.6rem .9rem;margin-top:.4rem;" +
    "color:#23684a;font-size:.78rem;line-height:2}" +
    ".cgu-warn{background:#fdf3ec;border:1px solid #f6d9c4;border-radius:12px;padding:.6rem .9rem;margin-top:.4rem;" +
    "color:#8a4b1f;font-size:.78rem;line-height:2}" +
    ".cgu-foot{padding:.8rem 1.3rem;border-top:1px solid #e3e7f0;text-align:left}" +
    ".cgu-ok{padding:.55rem 1.5rem;border:none;border-radius:12px;cursor:pointer;" +
    "background:linear-gradient(135deg,#6d5bd0,#4c3f9e);color:#fff;font-weight:700;font-family:inherit;font-size:.85rem}" +
    "@media(max-width:520px){.cgu-card{max-height:92vh}.cgu-body{padding:1rem;font-size:.8rem}}";

  function injectCSS() {
    if (document.getElementById("cgu-style")) return;
    const st = document.createElement("style");
    st.id = "cgu-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- محتوای راهنماها ---------------- */

  const GUIDE_OPENINGS =
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-chess-knight"></i> حرکت‌ها را چطور بنویسم؟ (نماد استاندارد شطرنج)</h4>' +
    "<p>حرکت‌ها را با <b>حروف انگلیسی</b> و به سبک استاندارد (SAN) بنویس. مهره‌ها با حرف اول انگلیسی‌شان نوشته می‌شوند:</p>" +
    "<ul>" +
    "<li><b>اسب =</b> <code class='cgu-m'>N</code> &nbsp;|&nbsp; <b>فیل =</b> <code class='cgu-m'>B</code> &nbsp;|&nbsp; <b>رخ =</b> <code class='cgu-m'>R</code> &nbsp;|&nbsp; <b>وزیر =</b> <code class='cgu-m'>Q</code> &nbsp;|&nbsp; <b>شاه =</b> <code class='cgu-m'>K</code></li>" +
    "<li><b>پیاده</b> حرف ندارد — فقط خانه‌ی مقصد: <code class='cgu-m'>e4</code> یعنی پیاده به e4</li>" +
    "<li><b>حرکت مهره:</b> حرف مهره + خانه‌ی مقصد: <code class='cgu-m'>Nf3</code> یعنی اسب به f3، <code class='cgu-m'>Bb5</code> یعنی فیل به b5</li>" +
    "<li><b>گرفتن مهره:</b> با <code class='cgu-m'>x</code>: <code class='cgu-m'>exd5</code> یعنی پیاده‌ی e4 مهره‌ی d5 را می‌گیرد، <code class='cgu-m'>Nxe5</code> یعنی اسب می‌گیرد</li>" +
    "<li><b>قلعه (روک):</b> سمت شاه <code class='cgu-m'>O-O</code> — سمت وزیر <code class='cgu-m'>O-O-O</code> (با حرف بزرگ انگلیسی O)</li>" +
    "<li><b>ترفیع پیاده:</b> با علامت = : <code class='cgu-m'>e8=Q</code> یعنی پیاده به وزیر تبدیل می‌شود</li>" +
    "<li><b>کیش:</b> علامت + بعد از حرکت: <code class='cgu-m'>Rd1+</code> &nbsp;|&nbsp; <b>مات:</b> علامت # : <code class='cgu-m'>Qh5#</code></li>" +
    "</ul>" +
    "<p><b>ترتیب حرکات:</b> شماره حرکت + حرکت سفید + حرکت سیاه، همه با فاصله:<br>" +
    "<code class='cgu-m'>1.e4 e5 2.Nf3 Nc6 3.Bb5</code> — همین گشایش معروف «اسپانیایی» است!</p>" +
    '<div class="cgu-warn">⚠️ مهم: از حروف انگلیسی استفاده کن و داخل حرکت‌ها متن فارسی یا کلمه‌ی اضافه ننویس. حرکتی که خلاف قوانین شطرنج باشد ذخیره نمی‌شود — سیستم حرکت‌ها را با موتور شطرنج واقعی چک می‌کند.</div>' +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-list"></i> چه چیزهایی بنویسم؟</h4>' +
    "<ul>" +
    "<li><b>نام گشایش و حرکات اصلی:</b> مثلاً «دفاع سیسیلی» با حرکات <code class='cgu-m'>1.e4 c5</code></li>" +
    "<li><b>واریانت‌ها:</b> هر واریانت نام و توالی حرکات خودش را دارد — مثلاً واریانت «ناژدورف» با <code class='cgu-m'>2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6</code></li>" +
    "<li><b>نقاط قوت و ضعف:</b> برای هر واریانت بنویس چه چیزی خوب است و چه چیزی خطرناک</li>" +
    "<li><b>ایده‌ها و طرح‌ها:</b> نقشه‌ی اصلی هر طرف در این واریانت چیست؟</li>" +
    "<li><b>تله‌ها:</b> اگر تله‌ای دارد، نامش و توالی حرکاتش را بنویس تا تخته‌ی تله‌ها ساخته شود</li>" +
    "<li><b>بازی نمونه:</b> یک بازی واقعی از استادان با PGN اضافه کن تا خواننده کل بازی را ببیند</li>" +
    "<li><b>آمار برد:</b> اگر آمار داری (درصد برد سفید/سیاه/مساوی) وارد کن</li>" +
    "</ul>" +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-star"></i> معیارهای انتشار</h4>' +
    "<ul>" +
    "<li>حداقل <b>یک واریانت</b> معتبر لازم است؛ حرکات اصلی هم باید قانونی باشند</li>" +
    "<li>برای هر واریانت حداقل توالی حرکات و نام را بنویس — بقیه‌ی فیلدها اختیاری‌اند ولی هرچه کامل‌تر، بهتر</li>" +
    "<li>فقط محتوای خودت را بفرست — کپی بدون اجازه ممنوع</li>" +
    "</ul>" +
    '<div class="cgu-tip">💡 بعد از انتشار، گشایش تو با نام پروفایلت برای همه‌ی کاربران سایت نمایش داده می‌شود و هر وقت بخواهی می‌توانی از همان کارت، آن را ویرایش یا حذف کنی.</div>' +
    "</div>";

  const GUIDE_LESSONS =
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-book-open"></i> ساختار یک درس خوب</h4>' +
    "<ul>" +
    "<li><b>عنوان:</b> کوتاه و گویا — مثلاً «آشنایی با کیش دوگانه» یا «اصول طلایی گشایش»</li>" +
    "<li><b>دسته‌بندی و سطح:</b> درس را در دسته‌ی درست بگذار (شروع بازی، تاکتیک، آخربازی…) و سطح مخاطب را مشخص کن</li>" +
    "<li><b>مدت مطالعه:</b> مثلاً «۱۰ دقیقه» تا خواننده بداند چقدر وقت لازم است</li>" +
    "<li><b>توضیح کوتاه:</b> در ۱ تا ۲ جمله بگو خواننده با این درس چه چیزی یاد می‌گیرد — این متن روی کارت درس نمایش داده می‌شود</li>" +
    "</ul>" +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-pen-fancy"></i> نوشتن محتوای درس</h4>' +
    "<p>از ویرایشگر حرفه‌ای بالای صفحه استفاده کن — مثل ورد، همه‌چیز را همان‌طور که می‌بینی می‌نویسی:</p>" +
    "<ul>" +
    "<li><b>تیترها (H2/H3):</b> درس را به بخش‌های کوچک تقسیم کن تا خواندنش راحت باشد</li>" +
    "<li><b>بولد و ایتالیک:</b> نکات مهم را برجسته کن</li>" +
    "<li><b>فهرست گلوله‌ای:</b> برای شمردن اصول و نکات پشت‌سرهم</li>" +
    "<li><b>جدول:</b> برای مقایسه (مثلاً مقایسه‌ی چند گشایش یا چند مهره)</li>" +
    "<li><b>حرکت‌های شطرنج:</b> مثل راهنمای گشایش‌ها با حروف انگلیسی بنویس — مثلاً <code class='cgu-m'>Nf3</code> یا <code class='cgu-m'>1.e4 e5</code></li>" +
    "</ul>" +
    '<div class="cgu-tip">💡 یک درس خوب: با یک سؤال یا موقعیت واقعی شروع می‌شود، قدم‌به‌قدم جلو می‌رود، مثال و عکس‌العمل دارد و در پایان یک جمع‌بندی کوتاه می‌گذارد.</div>' +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-palette"></i> آیکون و رنگ کارت</h4>' +
    "<p>بالای فرم می‌توانی آیکون و رنگ کارت درس را انتخاب کنی — رنگی که با موضوع درس بخواند (قرمه‌سبز برای تاکتیک، آبی برای مبانی…).</p>" +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-paper-plane"></i> انتشار و مدیریت</h4>' +
    "<ul>" +
    "<li>دکمه‌ی «انتشار در سایت» → درس تو بلافاصله با نام پروفایلت برای <b>همه‌ی کاربران</b> نمایش داده می‌شود</li>" +
    "<li>فقط خودت (صاحب اثر) می‌توانی بعداً درس را <b>ویرایش</b> یا <b>حذف</b> کنی — دکمه‌ها فقط برای تو روی کارت‌هایت دیده می‌شود</li>" +
    "<li>فقط محتوای خودت را بفرست — رعایت حقوق مؤلفین لازم است</li>" +
    "</ul>" +
    "</div>";

  const GUIDE_ARTICLES =
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-newspaper"></i> ساختار یک مقاله</h4>' +
    "<ul>" +
    "<li><b>عنوان:</b> جذاب و مشخص — مثلاً «راز حمله به شاه در پرتگاه وزیر»</li>" +
    "<li><b>دسته‌بندی:</b> مبانی، تاکتیک، آخربازی، گشایش، استراتژی، تاریخچه، پیشرفت و روانشناسی…</li>" +
    "<li><b>توضیح کوتاه:</b> ۱ تا ۲ جمله که روی کارت مقاله نمایش داده می‌شود — خواننده با همین تصمیم می‌گیرد بخواند یا نه</li>" +
    "<li><b>متن مقاله:</b> چند پاراگراف کامل بنویس؛ مقاله‌ی خیلی کوتاه منتشر نمی‌شود</li>" +
    "</ul>" +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-heading"></i> قالب‌بندی ساده متن</h4>' +
    "<p>متن مقاله با سه قانون ساده قالب‌بندی می‌شود:</p>" +
    "<ul>" +
    "<li>خطی که با <code class='cgu-m'>##</code> شروع شود → <b>تیتر فرعی</b> می‌شود: <code class='cgu-m'>## بخش دوم: تاکتیک سنجاق</code></li>" +
    "<li>خطی که با <code class='cgu-m'>-</code> شروع شود → <b>فهرست گلوله‌ای</b> می‌شود: <code class='cgu-m'>- اولین نکته مهم</code></li>" +
    "<li><b>خط خالی</b> → پاراگراف جدید؛ هر خط عادی یک پاراگراف کامل است</li>" +
    "</ul>" +
    '<div class="cgu-tip">💡 حرکت‌های شطرنج را داخل متن با حروف انگلیسی و نماد استاندارد بنویس — مثل <code class="cgu-m">1.e4 e5 2.Nf3</code> — تا برای همه خوانا باشد.</div>' +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-lightbulb"></i> چه مقاله‌ای خوب خوانده می‌شود؟</h4>' +
    "<ul>" +
    "<li>با یک داستان یا موقعیت واقعی از بازی‌های استادان شروع کن</li>" +
    "<li>هر ایده را با مثال توضیح بده، نه فقط تعریف</li>" +
    "<li>پاراگراف‌ها را کوتاه و مفید نگه دار و از تیترهای فرعی استفاده کن</li>" +
    "<li>در پایان، نتیجه‌گیری یا جمع‌بندی عملی بده</li>" +
    "</ul>" +
    "</div>" +
    '<div class="cgu-sec">' +
    '<h4><i class="fas fa-paper-plane"></i> انتشار و مدیریت</h4>' +
    "<ul>" +
    "<li>دکمه‌ی «انتشار برای همه» → مقاله‌ات بلافاصله با نام پروفایلت برای <b>همه‌ی کاربران سایت</b> منتشر می‌شود</li>" +
    "<li>فقط خودت می‌توانی بعداً مقاله‌ات را <b>ویرایش</b> یا <b>حذف</b> کنی</li>" +
    "<li>مقاله باید نوشته‌ی خودت باشد — کپی از منابع دیگر بدون اجازه ممنوع است</li>" +
    "</ul>" +
    "</div>";

  const TITLES = {
    openings: { icon: "fa-chess-board", title: "راهنمای ساخت و انتشار گشایش" },
    lessons: { icon: "fa-graduation-cap", title: "راهنمای ساخت و انتشار درس" },
    articles: { icon: "fa-feather-pointed", title: "راهنمای نوشتن و انتشار مقاله" },
  };

  const BODIES = {
    openings: GUIDE_OPENINGS,
    lessons: GUIDE_LESSONS,
    articles: GUIDE_ARTICLES,
  };

  /* ---------------- پنجره ---------------- */
  let overlayEl = null;

  function build() {
    if (overlayEl) return;
    injectCSS();
    overlayEl = document.createElement("div");
    overlayEl.className = "cgu-overlay";
    overlayEl.innerHTML =
      '<div class="cgu-card" role="dialog" aria-modal="true">' +
      '<div class="cgu-head">' +
      '<i class="fas fa-circle-question" id="cguIcon"></i>' +
      '<h3 id="cguTitle">راهنما</h3>' +
      '<button class="cgu-close" id="cguClose" aria-label="بستن"><i class="fas fa-xmark"></i></button>' +
      "</div>" +
      '<div class="cgu-body" id="cguBody"></div>' +
      '<div class="cgu-foot"><button class="cgu-ok" id="cguOk">متوجه شدم</button></div>' +
      "</div>";
    document.body.appendChild(overlayEl);
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) close();
    });
    overlayEl.querySelector("#cguClose").addEventListener("click", close);
    overlayEl.querySelector("#cguOk").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlayEl.classList.contains("open")) close();
    });
  }

  function open(type) {
    const conf = TITLES[type];
    if (!conf) return;
    build();
    overlayEl.querySelector("#cguTitle").textContent = conf.title;
    overlayEl.querySelector("#cguIcon").className = "fas " + conf.icon;
    overlayEl.querySelector("#cguBody").innerHTML = BODIES[type];
    overlayEl.querySelector("#cguBody").scrollTop = 0;
    overlayEl.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (overlayEl) overlayEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  return { open: open, close: close };
})();
