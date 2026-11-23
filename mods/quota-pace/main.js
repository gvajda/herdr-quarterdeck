// Agent quota in the status bar: one slim bar per limit window, from `quota-axi --json`.
// Click it for details and options. The same mod draws the popup (props().menu).
import { visibleWindows } from "./quota-windows.js";
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { runQuotaCommand } from "./quota-command.js";
import { exec, theme, settings, shared, setShared, props, openOverlay, knownAgents, nextCommand, spaces, machines } from "herdr";
import { timePct, days, summary } from "./pace.js";

const EVERY = 120000, STALE = 10 * 60000;
const DEFAULTS = { kinds: { session: true, weekly: true, monthly: true, model: false }, hidden: [], signedOut: false, names: false, remaining: false };
const ICONS = { claude: "claude", codex: "codex", grok: "grok", kimi: "kimi", copilot: "copilot", cursor: "cursor" };
const TINT = { claude: "#d97757", kimi: "#1783ff", copilot: "#8f6bf2" };
const KINDS = [["session", "5-hour limit"], ["weekly", "Weekly limit"], ["monthly", "Monthly limit"], ["model", "Model limits"]];

// Layout props set the starting options (`{"mod": "quota-pace", "props": {"hidden": ["cursor"]}}`); the popup's choices win.
function options() {
  const start = props()?.menu ? props().start ?? {} : props() ?? {}, saved = shared("quota.options") ?? {};
  return { ...DEFAULTS, ...start, ...saved, kinds: { ...DEFAULTS.kinds, ...(start.kinds ?? {}), ...(saved.kinds ?? {}) } };
}
const setOptions = change => setShared("quota.options", { ...options(), ...change });
const signedIn = p => p.windows.length > 0;
const quotaMachine = () => props()?.menu ? props().machine ?? null : spaces().find(s => s.active)?.machine ?? null;
const stateKey = (name, on = quotaMachine()) => `${name}:${JSON.stringify(on)}`;

// Calm until it matters: green, amber from 60%, orange from 80%, red from 92%.
function level(pct) {
  const dark = settings().dark !== false;
  const scale = dark ? ["#5ed49a", "#f2c14e", "#f59152", "#f2665c"] : ["#1f9d63", "#c98a0b", "#dd6b20", "#d64545"];
  return scale[pct >= 92 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0];
}

// Two windows of one kind (Cursor's monthly ones) are told apart by their own label.
function short(w, twin) {
  if (twin) return (w.label ?? w.kind).split(" ")[0].slice(0, 6);
  if (w.kind === "session") return w.windowSeconds ? `${Math.round(w.windowSeconds / 3600)}h` : "5h";
  if (w.kind === "weekly") return "wk";
  if (w.kind === "monthly") return "mo";
  return (w.label ?? "model").split(" ")[0].slice(0, 6);
}

// Share of the window already gone, 0..1; null without a reset time.
function elapsed(w, now) {
  const t = timePct(w, now);
  return t === null ? null : t / 100;
}

// ClaudeUsageBar's colors (macOS system green, orange, red): under pace green, over orange.
const paceColors = () => settings().dark !== false
  ? { green: "#30d158", orange: "#ff9f0a", red: "#ff453a" }
  : { green: "#28a745", orange: "#e68600", red: "#d70015" };

function until(iso, now) {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ${min % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

function ago(at, now) {
  const min = Math.round((now - at) / 60000);
  return min < 1 ? "just now" : `${min}m ago`;
}

function pace(w, now) {
  const e = elapsed(w, now);
  if (e === null || e < 0.03) return null;
  const diff = Math.round(w.percentUsed - e * 100);
  return { diff, ahead: diff >= 10 && w.percentUsed >= 20 };
}

const percent = (w, remaining) => remaining && !w.shareOf ? 100 - w.percentUsed : w.percentUsed;
const percentText = (w, remaining) => `${Math.round(percent(w, remaining))}% ${remaining && !w.shareOf ? "remaining" : "used"}`;

// ClaudeUsageBar's PaceProgressBar: used in full color, the gap to pace lighter, 1 px gaps between days.
// ponytail: always drawn as used, even with "remaining" on; the percent text still follows that option.
function bar(w, width, height, now, t) {
  const u = Math.min(1, Math.max(0, w.percentUsed / 100)), e = elapsed(w, now) ?? u;
  const lo = Math.min(u, e), hi = Math.max(u, e), c = paceColors(), color = u > e ? c.orange : c.green;
  const n = days(w), seg = (width - (n - 1)) / n, r = height / 2;
  return h_flex().w(width).h(height).flex_none().gap(1).children(Array.from({ length: n }, (_, i) => {
    const fill = x => Math.max(0, Math.min(1, x * n - i)) * seg;
    const ends = el => el.when(i === 0, s => s.rounded_l(r)).when(i === n - 1, s => s.rounded_r(r));
    return ends(div().relative().w(seg).h(height).flex_none().bg(t.border))
      .child(ends(div().absolute().left(0).top(0).h(height).w(fill(hi)).bg(color).opacity(0.5)))
      .child(ends(div().absolute().left(0).top(0).h(height).w(fill(lo)).bg(color)));
  }));
}

async function load(on = null) {
  let r = await runQuotaCommand(exec, { on }).catch(e => ({ code: -1, stderr: String(e) }));
  // Apps started from the Dock miss PATH entries set in the shell's rc file (npm, nvm, mise): ask the person's own shell.
  if (r.code !== 0) r = await exec("sh", ["-c", 'exec "${SHELL:-/bin/sh}" -lic "quota-axi --json" </dev/null'], { on }).catch(e => ({ code: -1, stderr: String(e) }));
  if (r.code !== 0) throw new Error(`quota-axi failed: ${(r.stderr || "").trim().split("\n").pop() || `exit ${r.code}`}`);
  // An interactive shell can print a banner first; the report starts at the first brace.
  const data = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  return {
    at: Date.now(),
    providers: (data.providers ?? []).map(p => ({
      id: p.provider, label: p.label ?? p.provider, plan: p.plan ?? null, status: p.state?.status ?? null,
      windows: (p.windows ?? []).map(w => ({
        id: w.id, label: w.label, kind: w.kind, shareOf: w.shareOf ?? null,
        // Newer quota-axi reports remaining percentages; shares are not independent allowances.
        percentUsed: Number.isFinite(w.percentUsed) ? w.percentUsed
          : w.shareOf == null && Number.isFinite(w.percentRemaining) ? 100 - w.percentRemaining : null,
        resetsAt: w.resetsAt ?? null, windowSeconds: w.windowSeconds ?? null,
        reservePct: Number.isFinite(w.pace?.reservePercentPoints) ? w.pace.reservePercentPoints : null,
      })).filter(w => Number.isFinite(w.percentUsed)),
    })),
  };
}

export default class Quota extends View {
  init(_props, cx) {
    // The app's program table knows each agent's icon and whether it is a one-color glyph.
    this.programs = {};
    this.loading = new Set();
    cx.spawn(async cx => {
      const list = await knownAgents().catch(() => []);
      for (const a of list) this.programs[a.key] = a;
      cx.notify();
    });
    if (props()?.menu) return;
    this.machine = quotaMachine();
    this.refresh(cx);
    cx.timer.every(EVERY, cx => this.refresh(cx));
    // Key commands: "quota-pace:menu" opens the popup, "quota-pace:refresh" reads the quota now.
    cx.spawn(async cx => {
      for (;;) {
        const c = await nextCommand();
        if (c === "menu") this.openMenu();
        if (c === "refresh") this.refresh(cx);
      }
    });
  }

  glyph(p, size, t) {
    const program = this.programs[p.id], icon = program?.icon ?? (ICONS[p.id] ? `icons/${ICONS[p.id]}.svg` : null);
    if (!icon) return div().size(6).rounded(3).flex_none().bg(t.dim);
    const el = TINT[p.id] || !program || program.tint
      ? svg(icon).size(size).flex_none().text_color(TINT[p.id] ?? program?.color ?? t.foreground)
      : image(icon).size(size).flex_none().rounded(3);
    return signedIn(p) ? el : el.opacity(0.35);
  }

  // Every reachable machine, so the sidebar can show each one's pace (shared "quota.pace:<machine>").
  refresh(cx) {
    const all = [...new Set([null, quotaMachine(), ...machines().filter(m => m.layout !== "unavailable").map(m => m.name ?? null)])];
    for (const on of all) this.refreshOne(cx, on);
  }

  refreshOne(cx, on) {
    if (this.loading.has(on)) return;
    this.loading.add(on);
    cx.spawn(async cx => {
      try {
        const data = await load(on);
        setShared(stateKey("quota.data", on), data);
        setShared(stateKey("quota.error", on), null);
        setShared(stateKey("quota.pace", on), summary(data.providers, Date.now()));
      }
      catch (e) { setShared(stateKey("quota.error", on), String(e.message ?? e)); setShared(stateKey("quota.pace", on), null); }
      finally { this.loading.delete(on); cx.notify(); }
    });
  }

  openMenu() {
    const data = shared(stateKey("quota.data")), o = options();
    const all = data?.providers ?? [], shown = all.filter(p => !o.hidden.includes(p.id) && (signedIn(p) || o.signedOut));
    const details = shown.reduce((n, p) => n + 30 + p.windows.length * 56, 0);
    const toggles = (KINDS.length + all.length + 3 + (all.some(p => p.id === "agy") ? 1 : 0)) * 32;
    openOverlay({ mod: "quota-pace", kind: "popup", width: 300, height: Math.min(720, 44 + details + 40 + toggles + 77), props: { menu: true, machine: quotaMachine(), start: props() ?? {} } });
  }

  render(cx) {
    const t = theme();
    if (props()?.menu) return this.menu(t);
    // Headless (a floating block): reads quota for every machine and draws nothing; the sidebar shows it.
    if (props()?.headless) return div();
    const on = quotaMachine();
    if (on !== this.machine) { this.machine = on; this.refresh(cx); }
    const data = shared(stateKey("quota.data")), error = shared(stateKey("quota.error")), o = options(), now = Date.now();
    const stale = !data || now - data.at > STALE;
    const list = (data?.providers ?? []).filter(p => !o.hidden.includes(p.id) && (signedIn(p) || o.signedOut));
    // Narrow status bar: shorter bars and no window labels, then percents only, so every provider shows.
    const width = this.width ?? Infinity, need = list.reduce((n, p) => n + p.windows.filter(x => o.kinds[x.kind] ?? false).length, 0);
    const per = need ? (width - 24 - list.length * 46) / need : Infinity;
    const barW = per >= 96 ? 34 : per >= 60 ? 20 : 0, labels = per >= 96;
    const parts = [];
    list.forEach((p, i) => {
      if (i > 0) parts.push(div().w(1).h(12).flex_none().bg(t.border));
      const windows = visibleWindows(p, o).filter(w => o.kinds[w.kind] ?? false);
      parts.push(h_flex().id(`q-${p.id}`).gap(labels ? 9 : 6).items_center().flex_none()
        .tooltip(windows.map(w => `${p.label} ${w.label}: ${percentText(w, o.remaining)}${w.resetsAt && Date.parse(w.resetsAt) > now ? `, resets in ${until(w.resetsAt, now)}` : ""}`).join("\n") || `${p.label}: not signed in`)
        .child(h_flex().gap(5).items_center()
          .child(this.glyph(p, 12, t))
          .when(o.names || !ICONS[p.id], el => el.child(div().text_color(signedIn(p) ? t.muted : t.dim).child(p.label))))
        .when(!signedIn(p), el => el.child(div().size(6).rounded(3).border_1().border_color(t.dim)))
        .children(windows.map(w => {
          const pc = pace(w, now);
          return h_flex().gap(5).items_center()
            .when(labels, el => el.child(div().text_size(10).text_color(t.dim).child(short(w, windows.filter(x => x.kind === w.kind).length > 1))))
            .when(barW > 0, el => el.child(bar(w, barW, 4, now, t)))
            .child(div().min_w(24).text_size(11).text_color(w.percentUsed >= 60 ? level(w.percentUsed) : t.muted).child(`${Math.round(percent(w, o.remaining))}%`))
            .when(Boolean(pc?.ahead), el => el.child(div().ml(-3).text_size(8).text_color(level(Math.max(60, w.percentUsed))).child("▲")));
        })));
    });
    return h_flex().id("quota").size_full().px(labels ? 12 : 8).gap(labels ? 11 : 7).items_center().justify_end().overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.muted).cursor_pointer()
      .on_size_change((size, cx) => { const w = size.width / (settings().zoom || 1); if (w !== this.width) { this.width = w; cx.notify(); } })
      .tooltip(`Quota on ${on ?? "this computer"}`)
      .when(stale, el => el.opacity(0.6))
      .on_click(() => this.openMenu())
      .on_mouse_down("right", () => this.openMenu())
      .when(parts.length === 0, el => el.child(div().text_color(t.dim).child(error ? "Quota unavailable" : data ? "No quota to show" : "Loading quota…")))
      .children(parts);
  }

  menu(t) {
    const data = shared(stateKey("quota.data")), error = shared(stateKey("quota.error")), o = options(), now = Date.now();
    const all = data?.providers ?? [];
    const toggle = (label, on, act, id) => h_flex().id(id).h(32).px(10).gap(10).rounded(6).items_center().cursor_pointer()
      .hover(s => s.bg(t.hover)).on_click(act)
      .child(div().flex_1().text_color(on ? t.foreground : t.muted).child(label))
      .child(div().size(16).flex_none().flex().items_center().justify_center()
        .when(on, el => el.child(svg("mods/quota-pace/check.svg").size(16).text_color(t.accent))));
    const heading = text => div().px(8).pt(10).pb(4).text_size(10.5).text_color(t.dim).child(text);
    const details = all.filter(p => !o.hidden.includes(p.id) && (signedIn(p) || o.signedOut)).map(p => v_flex().px(8).py(4).gap(4)
      .child(h_flex().gap(6).items_center()
        .child(this.glyph(p, 13, t))
        .child(div().font_semibold().text_color(t.foreground).child(p.label))
        .child(div().text_size(10.5).text_color(t.dim).child(signedIn(p) ? (p.plan ?? "") : "not signed in")))
      .children(visibleWindows(p, o).map(w => {
        const e = elapsed(w, now), c = paceColors(), diff = e === null ? null : w.percentUsed - e * 100;
        const name = w.kind === "session" ? "Session (5 hour)" : w.kind === "weekly" ? "Weekly (7 day)" : days(w) === 7 ? `${w.label.replace(/ week$/i, "")} (7 day)` : w.label;
        return v_flex().gap(4).pt(4)
          .child(h_flex().items_center()
            .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(name))
            .when(Boolean(w.resetsAt && Date.parse(w.resetsAt) > now), el => el.child(div().text_size(10.5).text_color(t.dim).child(`Resets in ${until(w.resetsAt, now)}`))))
          .child(bar(w, 274, 8, now, t))
          .child(h_flex().text_size(10.5)
            .child(div().flex_1().text_color(t.dim).child(percentText(w, o.remaining)))
            .when(diff !== null, el => el.child(div().text_color(diff > 0 ? c.red : c.green).child(`${Math.abs(Math.round(diff))}% ${diff > 0 ? "over" : "under"} pace`))));
      })));
    return v_flex().id("quota-menu").w_full().p(5).bg(t.popover).text_size(12.5).overflow_y_scrollbar()
      .child(h_flex().px(8).pt(4).pb(2).items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child(data ? `Quota ${o.remaining ? "remaining" : "used"} · ${ago(data.at, now)}` : "Agent quota"))
        .child(div().id("quota-refresh").px(6).rounded(5).cursor_pointer().text_size(11).text_color(t.muted).hover(s => s.bg(t.hover))
          .on_click((_event, cx) => this.refresh(cx)).child("Refresh")))
      .child(div().px(8).py(4).text_size(11).text_color(t.muted).child(`Machine: ${quotaMachine() ?? "This computer"}`))
      .when(Boolean(error), el => el.child(div().px(8).py(4).text_size(11).text_color(level(95)).child(error)))
      .children(details)
      .child(div().mx(8).my(6).h(1).bg(t.border))
      .child(toggle("Show remaining instead of used", o.remaining, () => setOptions({ remaining: !o.remaining }), "remaining"))
      .child(heading("Limits to show in the status bar"))
      .children(KINDS.map(([kind, label]) => toggle(label, o.kinds[kind], () => setOptions({ kinds: { ...o.kinds, [kind]: !o.kinds[kind] } }), `kind-${kind}`)))
      .child(div().mx(8).my(6).h(1).bg(t.border))
      .child(heading("Providers"))
      .children(all.map(p => toggle(p.label, !o.hidden.includes(p.id),
        () => setOptions({ hidden: o.hidden.includes(p.id) ? o.hidden.filter(x => x !== p.id) : [...o.hidden, p.id] }), `prov-${p.id}`)))
      .when(all.some(p => p.id === "agy"), el => el.child(toggle("Antigravity: Claude/GPT limits", o.agyClaudeGpt !== false,
        () => setOptions({ agyClaudeGpt: o.agyClaudeGpt === false }), "agy-claude-gpt")))
      .child(toggle("Signed-out providers", o.signedOut, () => setOptions({ signedOut: !o.signedOut }), "signed-out"))
      .child(toggle("Provider names", o.names, () => setOptions({ names: !o.names }), "names"));
  }
}
