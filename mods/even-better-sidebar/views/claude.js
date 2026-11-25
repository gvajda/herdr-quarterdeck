// Claude Code sessions on every machine with a space, read there by scan.cjs (node):
// context, last reply, prompt-cache lifetime and subagents, matched to their terminal
// by HC_TERMINAL_ID. Also the Claude terminals Herdr doesn't list as agents (a core
// that doesn't see Claude's status, as on a remote machine), so they still show.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { mono } from "./ui.js";
import { agents, panes, spaces, machines, focused, exec, readTextFile, appHome } from "herdr";

const SCAN_MS = 3000;
// Shown times step every 10 s, on that machine's clock: every redraw (a scan, any agent change)
// would otherwise move the seconds. They still show seconds, just a fresh value every 10 s.
const STEP_MS = 10000;
const data = new Map(); // machine ("" here) -> { now, sessions, fetched, error }
const busyOn = new Set();
const lastOn = new Map();
let script = null;

const machineOf = (address) => (address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : "");
const localId = (address) => address.slice(address.lastIndexOf("/") + 1);

async function scanOn(m) {
  try {
    script ??= await readTextFile(`${appHome()}/mods/even-better-sidebar/scan.cjs`);
    const r = await exec("node", ["-e", script], { on: m || null, timeout: 15000 });
    if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || `node exited ${r.code}`);
    data.set(m, { ...JSON.parse(r.stdout), fetched: Date.now(), error: null });
  } catch (e) {
    data.set(m, { ...(data.get(m) ?? { sessions: [] }), error: String(e.message ?? e) });
  }
}

// Keeps every machine's sessions fresh, each on its own so a slow one holds no other
// back, and redraws this copy as they come in. Machines Herdr can't reach are skipped.
export function watchClaude(cx) {
  const tick = (cx) => {
    const down = new Set(machines().filter((m) => m.name && m.layout === "unavailable").map((m) => m.name));
    for (const m of new Set(spaces().map((s) => s.machine ?? ""))) {
      if (down.has(m) || busyOn.has(m) || Date.now() - (lastOn.get(m) ?? 0) < SCAN_MS - 500) continue;
      busyOn.add(m);
      cx.spawn(async (cx) => {
        await scanOn(m);
        busyOn.delete(m);
        lastOn.set(m, Date.now());
        cx.notify();
      });
    }
  };
  tick(cx);
  cx.timer.every(SCAN_MS, tick);
}

// The session in a terminal, with `now` on that machine's clock (ages stay right
// when its clock differs from this one's).
export function sessionFor(address) {
  const d = data.get(machineOf(address));
  const s = d?.sessions?.find((x) => x.terminal === localId(address));
  return s ? { s, now: Math.floor((d.now + Date.now() - d.fetched) / STEP_MS) * STEP_MS } : null;
}

// Herdr's agents, plus Claude sessions in terminal panes Herdr doesn't list, shaped
// like its agents; their status is Claude's own (busy or idle).
export function allAgents() {
  const listed = agents();
  const have = new Set(listed.map((a) => a.address));
  const tabs = new Map(spaces().flatMap((s) => s.tabs.map((tab) => [tab.id, { s, tab }])));
  const shown = focused()?.pane;
  const extra = [];
  for (const p of panes()) {
    if (!p.terminal || have.has(p.terminal) || !tabs.has(p.tab)) continue;
    const cs = sessionFor(p.terminal);
    if (!cs) continue;
    const { s, tab } = tabs.get(p.tab);
    extra.push({
      address: p.terminal, pane: p.pane, space: s.id, space_name: s.name,
      tab: tab.id, tab_index: tab.index, tab_name: tab.name,
      status: cs.s.status === "busy" ? "working" : "idle", app: "claude-code",
      program: p.program, title: p.title, seq: 0, pinned: false, focused: p.pane === shown,
    });
  }
  return extra.length ? [...listed, ...extra] : listed;
}

// Herdr's status, but "waiting" while its subagents work and it only waits on them.
export function claudeStatus(a, cs, roots) {
  if (a.status === "blocked" || a.status === "done") return a.status;
  const busyKids = roots.some((r) => r.active);
  return busyKids && (a.status !== "working" || cs.s.act === "wait") ? "waiting" : a.status;
}

// The context window: 1M for [1m] models and the Claude 5 family on, 200k before
// (as Over9k reckons it); more than that in use means the bigger one.
export function contextPercent(model, used) {
  if (!used) return null;
  const n = Number(/claude-[a-z]+-(\d+)/.exec(model ?? "")?.[1] ?? 0);
  let window = /\[1m\]/.test(model ?? "") || n >= 5 ? 1_000_000 : 200_000;
  if (used > window) window = 1_000_000;
  return Math.round((used * 100) / window);
}

// "claude-opus-5-5[1m]" -> "Opus 5.5"; a date suffix ("-20251001") is no version.
export function modelName(id) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(id ?? "");
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}` : null;
}

// A duration in its two largest units ("42s", "7m12s", "3h5m", "20d8h"): at most 6
// characters below 100 days, which is older than anything worth opening.
export function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d${h % 24}h` : `${d}d`;
}

const green = (t) => t.ansi2 ?? t.done;
// The warm hourglass: the orange of the spaces' avatars (Better Sidebar's ansi3 swatch).
export const ORANGE = "#e3814f";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Sat, Nov 21, 20:47" in local time, with the year when it isn't this one. By hand:
// Herdr's engine ignores toLocaleString's options.
export function calendar(ms) {
  const d = new Date(ms);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}, ${hm}`;
}

// Context used: green, yellow from 50%, red from 80%; hover for the tokens ("178k tokens").
export function percentChip(t, pct, size, used = null) {
  const color = pct >= 80 ? t.ansi1 : pct >= 50 ? t.ansi3 : green(t);
  return div().flex_none().font_family(mono()).text_size(size).text_color(color)
    .when(used !== null, (el) => el.tooltip(`${Math.round(used / 1000)}k tokens`))
    .child(`${pct}%`);
}

// Time since the last model call, and its prompt cache as an hourglass: top full and
// orange while warm, nearly run out and red in its last 10 of 60 minutes (a 5-minute
// cache scales the same), bottom full and blue once cold (the next turn re-reads the
// whole context at full price). While it works the cache keeps refreshing: no glass.
// Fixed columns (up to 6 characters right-aligned, then the glass) keep every row's
// values and glasses in one line.
export function replyAge(t, cs, size, working, iconOf) {
  const { lastReply, cacheTtl } = cs.s;
  if (!lastReply) return null;
  const ttl = (cacheTtl ?? 300) * 1000;
  const age = cs.now - lastReply;
  const left = ttl - age;
  const cold = left <= 0, ending = !cold && age >= (ttl * 50) / 60;
  // Working keeps the cache refreshed, so it counts as warm.
  const tip = `Last reply ${calendar(lastReply)} · cache ${cold && !working ? "cold" : "warm"}`;
  const color = cold ? (t.ansi4 ?? t.dim) : ending ? t.ansi1 : ORANGE;
  return h_flex().flex_none().gap(4).items_center().tooltip(tip)
    // 48px holds the widest value ("59m59s", "99d23h") right-aligned; max_w keeps it from growing.
    .child(div().w(48).max_w(48).flex_none().overflow_hidden().text_right().whitespace_nowrap().font_family(mono()).text_size(size)
      .text_color(working ? t.dim : color).child(ago(age)))
    // Then the glass, in its own column (empty while working) so every row lines up.
    .child(h_flex().w(11).flex_none().when(!working, (el) =>
      el.child(iconOf(cold ? "hourglass-empty" : ending ? "hourglass-low" : "hourglass-full", 11).text_color(color))));
}

// working: a green dot breathing slowly; waiting on subagents: a still green ring.
export function stateDot(t, state, size = 9) {
  const dot = () => div().size(size).flex_none().rounded(size / 2);
  if (state === "working") return dot().bg(green(t)).loop("opacity", { from: 0.35, to: 1, period: 1800 });
  if (state === "waiting") return dot().border(1.5).border_color(green(t));
  return null;
}

// Every state as one circle: working/waiting as above, needs-you red, done filled,
// idle or quiet a dim ring.
export function stateCircle(t, state, size = 9) {
  const dot = () => div().size(size).flex_none().rounded(size / 2);
  return stateDot(t, state, size)
    ?? (state === "blocked" ? dot().bg(t.blocked)
      : state === "done" ? dot().bg(t.done ?? t.dim)
      // A finished subagent isn't news (its parent reports it): a quiet filled dot.
      : state === "finished" ? dot().bg(t.dim)
      : dot().border(1.5).border_color(t.idle ?? t.dim));
}

// Tree guides: one fixed column per level, so levels line up down the list.
// "│" passes through, "├" passes and branches, "└" ends here, "" is blank.
export function guides(t, lines, row, indent = 14) {
  return lines.map((l) => v_flex().w(indent).h(row).flex_none()
    .child(div().ml(6).w(indent - 8).h(row / 2)
      .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
      .when(l === "├" || l === "└", (el) => el.border_b(1.5).border_color(t.input))
      .when(l === "└", (el) => el.rounded_bl(5)))
    .child(div().ml(6).h(row / 2)
      .when(l === "│" || l === "├", (el) => el.border_l(1.5).border_color(t.input))));
}
