/** Offline mapper smoke — paste of news.js helpers inline */
function ctimeToIso(ctime) {
  if (!ctime || typeof ctime !== "string") return null;
  const s = ctime.trim();
  const withTime = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (withTime) {
    const [, d, hh, mm, ss] = withTime;
    return `${d}T${String(hh).padStart(2, "0")}:${mm}:${ss ?? "00"}+08:00`;
  }
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T12:00:00+08:00`;
  return null;
}
const t1 = ctimeToIso("2021-02-04 18:00");
const t2 = ctimeToIso("2015-07-17");
if (t1 !== "2021-02-04T18:00:00+08:00") throw new Error("t1 " + t1);
if (t2 !== "2015-07-17T12:00:00+08:00") throw new Error("t2 " + t2);
console.log("smoke-news-local ok", t1, t2);
