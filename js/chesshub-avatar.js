/* ============================================================
   ♛ ChessHub — chesshub-avatar.js | helpers مشترک آواتار و مهره
   ------------------------------------------------------------
   این فایل «بعد از» script.js بارگذاری می‌شود و فقط چیزهای
   غایب را اضافه می‌کند؛ رنگ آدمک‌ها همیشه با نسخهٔ اصلاح‌شدهٔ
   این فایلoverride می‌شود (سفید: آدمک تیره روی زمینهٔ روشن —
   سیاه: آدمک روشن روی زمینهٔ تیره).
   ============================================================ */
(function () {
  "use strict";
  if (!window.ChessUtils) return; // باید بعد از script.js باشد
  const U = window.ChessUtils;

  /* ---------- CSS ست مهره‌ها برای هر کلاس تختهٔ Chessground ---------- */
  if (typeof U.ensureCgPieceSetCss !== "function") {
    U._cgStyleIds = {};
    U.ensureCgPieceSetCss = function (setId, cls) {
      const clsId = cls + "-" + setId;
      if (U._cgStyleIds[clsId]) return;
      const types = ["king", "queen", "rook", "bishop", "knight", "pawn"];
      const colors = ["white", "black"];
      let css = "";
      colors.forEach(function (c) {
        types.forEach(function (t) {
          css += "." + cls + ".set-" + setId + " piece." + c + "." + t +
            "{background-image:url('pieces/" + setId + "/" + c[0] + t[0] + ".png')}\n";
        });
      });
      colors.forEach(function (c) {
        types.forEach(function (t) {
          css += "." + cls + ".cg-wrap:not([class*='set-']) piece." + c + "." + t +
            "{background-image:url('pieces/neo/" + c[0] + t[0] + ".png')}\n";
        });
      });
      const st = document.createElement("style");
      st.textContent = css;
      document.head.appendChild(st);
      U._cgStyleIds[clsId] = true;
    };
  }

  /* ---------- عکس بازیکنان شناخته‌شده (images/players/<id>.jpg) ---------- */
  if (!U._masterPhotos) {
    U._masterPhotos = [
      "alekhine", "anand", "aronian", "botvinnik", "bronstein", "capablanca",
      "carlsen", "caruana", "ding", "euwe", "firouzja", "fischer", "gukesh",
      "karpov", "kasparov", "korchnoi", "kramnik", "lasker", "marshall",
      "morphy", "nakamura", "nepomniachtchi", "nimzowitsch", "petrosian",
      "reti", "smyslov", "so", "spassky", "steinitz", "tal",
    ];
  }
  if (typeof U.masterPhoto !== "function") {
    U.masterPhoto = function (name) {
      let n = String(name || "").toLowerCase();
      try { n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
      const toks = n.split(/[^a-z]+/).filter(Boolean);
      for (let i = 0; i < toks.length; i++) {
        if (U._masterPhotos.indexOf(toks[i]) >= 0) {
          return "images/players/" + toks[i] + ".jpg";
        }
      }
      return null;
    };
  }

  /* ---------- 🎨 آدمک تولیدی — رنگ‌های اصلاح‌شده (همیشه override) ---------- */
  U.bustAvatar = function (side) {
    const bg = side === "b" ? "#22303f" : "#e8edf5";
    const fg = side === "b" ? "#f4f7fb" : "#26313d";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="' + bg + '"/>' +
      '<circle cx="32" cy="23.5" r="12.5" fill="' + fg + '"/>' +
      '<path d="M9 62c0-14.5 10.5-22 23-22s23 7.5 23 22z" fill="' + fg + '"/>' +
      "</svg>";
    return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
  };

  /* ---------- تگ تصویر آواتار ---------- */
  if (typeof U.avatarTag !== "function") {
    U.avatarTag = function (name, side, cls) {
      const photo = U.masterPhoto(name);
      const bust = U.bustAvatar(side);
      const src = photo || bust;
      const c = cls ? " " + cls : "";
      return (
        '<img class="gr-avatar-img' + c + '" src="' + src + '" alt="" draggable="false" ' +
        'onerror="this.onerror=null;this.src=\'' + bust + '\';">'
      );
    };
  }
})();
