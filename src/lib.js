export const DAY = 86400000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";
export const fmtFull = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—";
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
export const e1rm = (w, r) => (!w || !r ? null : Math.round(w * (1 + r / 30)));
export const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
export const int = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};
