// Pace as ClaudeUsageBar shows it: usage against how far through its window we are.
// Pure, so `node mods/quota-pace/pace.test.mjs` checks it.

const HOUR = 3600, DAY = 24 * HOUR;

// A window's length when quota-axi doesn't say: weekly and per-model weekly limits run 7 days.
export function windowSeconds(w) {
  if (w.windowSeconds) return w.windowSeconds;
  if (w.kind === "weekly" || (w.kind === "model" && /week/i.test(w.label ?? ""))) return 7 * DAY;
  if (w.kind === "session") return 5 * HOUR;
  return null;
}

// Share of the window gone, 0..100, or null. quota-axi's own reserve wins (used + reserve = time).
export function timePct(w, now) {
  if (Number.isFinite(w.reservePct)) return Math.min(100, Math.max(0, w.percentUsed + w.reservePct));
  const secs = windowSeconds(w);
  if (!w.resetsAt || !secs) return null;
  const left = (Date.parse(w.resetsAt) - now) / 1000;
  return Math.min(100, Math.max(0, (1 - left / secs) * 100));
}

// Day gaps in the bar, as ClaudeUsageBar draws them: 7 for weekly windows, else one piece.
export const days = (w) => (windowSeconds(w) === 7 * DAY ? 7 : 1);

// W, F (model:fable), S (model:sonnet)...
export const letter = (w) => (w.kind === "weekly" ? "W" : (String(w.id ?? w.label ?? "?").replace(/^model:/, "")[0] ?? "?").toUpperCase());

// The menu-bar reading: of Claude's weekly limits, the one most over (or least under) pace.
// { text: "31%", letter: "W", over, used, time, days, label, resetsAt } or null; used/time are 0..100.
export function summary(providers, now) {
  const claude = providers?.find((p) => p.id === "claude");
  const weekly = (claude?.windows ?? []).filter((w) => days(w) === 7)
    .map((w) => ({ w, t: timePct(w, now) })).filter((x) => x.t !== null);
  if (!weekly.length) return null;
  const best = weekly.reduce((a, b) => (b.w.percentUsed - b.t > a.w.percentUsed - a.t ? b : a));
  const diff = best.w.percentUsed - best.t;
  const label = best.w.kind === "weekly" ? "wk" : (best.w.label ?? "model").split(" ")[0].slice(0, 6);
  return { text: `${Math.abs(Math.round(diff))}%`, letter: letter(best.w), over: diff > 0,
    used: best.w.percentUsed, time: best.t, days: days(best.w), label, resetsAt: best.w.resetsAt ?? null };
}
