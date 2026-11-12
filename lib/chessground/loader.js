/* Chessground (کتابخانهٔ رسمی لایچز) — لودر ES Module
   این فایل Chessground را روی window می‌گذارد تا اسکریپت‌های
   کلاسیک صفحهٔ آنالیز بتوانند از آن استفاده کنند. */
import { Chessground } from "./chessground.min.js";

window.Chessground = Chessground;
document.dispatchEvent(new CustomEvent("chessgroundReady"));
