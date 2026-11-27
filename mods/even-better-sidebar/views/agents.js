// Adapted from Herdr's shipped agents mod, with grouping by main space and by
// name prefix. Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  agents,
  terminals,
  panes,
  focused,
  spaces,
  run,
  theme,
  shared,
  setShared,
  setAgentOrder,
  window,
  layout,
} from "herdr";
import { findNode } from "./find-node.js";
import { loadSettings } from "../settings.js";
import { DEFAULT_SETTINGS } from "../defaults.js";
import { TEXT, mono, Icon, IconButton, GroupHeader, Menu, MenuLabel, MenuOption } from "./ui.js";
import { watchClaude, sessionFor, allAgents, claudeStatus, contextPercent, modelName, ago, percentChip, replyAge, stateDot, stateCircle, guides } from "./claude.js";
import { build, rows as subRows } from "../tree.js";

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (findNode(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = findNode(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", {
    id: "sidebar",
    px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44,
  });
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function lead(tab, all = panes()) {
  const mine = all.filter((p) => p.tab === tab.id && p.terminal);
  return mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0];
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling =
    live &&
    live !== prog &&
    !/^[~/]|^[A-Za-z]:\\/.test(live) &&
    !live.includes("@") &&
    live.toLowerCase() !== l?.program?.key;
  return tab.name === prog && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
  { id: "parent", label: "Grouped by main space", icon: "git-branch" },
  { id: "prefix", label: "Grouped by prefix", icon: "tag" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

// PR-12, INS-4 and PLAT-work, also after a folder such as feature/INS-4: capitals
// need nothing more, while lower case needs a number so herdr-mods is no prefix.
const PREFIX = /(?:^|\/)(?:([A-Z][A-Z0-9]*)-\S|([A-Za-z][A-Za-z0-9]*)-\d)/;
export function namePrefix(...names) {
  for (const name of names) {
    const match = PREFIX.exec(name ?? "");
    if (match) return (match[1] ?? match[2]).toUpperCase();
  }
  return null;
}

// How `sort` gathers agents: a group's key and heading. Null keeps priority's sections.
function grouping(sort, tabName) {
  if (sort === "grouped") return (a) => ({ id: `sp-${a.space}`, label: a.space_name || "" });
  if (sort === "parent") {
    const parents = shared("even-better-sidebar.space-parents") ?? {};
    return (a) => {
      const parent = parents[a.space];
      return parent
        ? { id: `repo-${parent.key}`, label: parent.label }
        : { id: `sp-${a.space}`, label: a.space_name || "" };
    };
  }
  if (sort === "prefix")
    return (a) => {
      const prefix = namePrefix(a.space_name, tabName(a));
      return prefix
        ? { id: `prefix-${prefix}`, label: `${prefix}-` }
        : { id: "prefix-none", label: "No prefix" };
    };
  return null;
}

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint
    ? svg(p.icon).size(size).flex_none().text_color(color)
    : image(p.icon).w(size).h(size).flex_none();
}

// What a row calls an agent: its tab's title, or failing that its own.
function agentLabel() {
  const tabs = spaces().flatMap((s) => s.tabs);
  return (a) => {
    const tab = tabs.find((candidate) => candidate.id === a.tab);
    return tab ? title(tab, lead(tab)) : a.title || a.program?.name || "";
  };
}

// Same group next to each other, so the list reads, and next-agent keys move, in order.
function gatherGroups(list, groupOf, sortId) {
  const gathered = new Map();
  for (const a of list) {
    const { id } = groupOf(a);
    gathered.set(id, [...(gathered.get(id) ?? []), a]);
  }
  const ids = [...gathered.keys()];
  if (sortId === "prefix")
    ids.sort((x, y) => (x === "prefix-none") - (y === "prefix-none") || x.localeCompare(y));
  return ids.flatMap((id) => gathered.get(id));
}

export class Agents {
  init(_props, cx) {
    this.sortOpen = false;
    this.sortFocus = cx.focus_handle();
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    this.nameBy = DEFAULT_SETTINGS.agent_name;
    cx.timer.every(30000, (cx) => cx.notify());
    // Claude's subagents: finished ones fold per parent; subAll folds them all.
    this.subAll = false;
    this.subFlip = new Set();
    this.subsHidden = localStorage.getItem("subs.hidden") === "1";
    // Agents marked unread, like an email: they show blue until opened again.
    this.unread = new Set(JSON.parse(localStorage.getItem("unread") ?? "[]"));
    this.lastFocus = undefined;
    watchClaude(cx);
    // The spaces view reports problems with the settings; this one only needs the name.
    cx.spawn(async (cx) => {
      const { settings } = await loadSettings("even-better-sidebar", DEFAULT_SETTINGS);
      this.nameBy = settings.agent_name;
      cx.notify();
    });
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed))
      if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  // Drops pins of agents that ended. Only for machines the list has heard from:
  // right after a start, or while a machine connects, its agents aren't listed yet.
  prunePins(all) {
    const machine = (addr) => (addr.includes("/") ? addr.split("/")[0] : "");
    const heard = new Set(all.map((k) => machine(k.address)));
    const live = new Set(all.filter((k) => k.state === "live").map((k) => k.address));
    const kept = this.pins.filter((p) => !heard.has(machine(p)) || live.has(p));
    if (kept.length !== this.pins.length) this.setPins(kept);
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle")
      this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone =
      a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : (RANK[a.status] ?? 0);
  }

  // Sort menu for the lists view's tab bar.
  sortMenu() {
    return this.renderSortMenu(sortOf());
  }

  sortOptions() {
    const on = sortOf().id;
    return SORTS.map((s) =>
      MenuOption({
        id: `sort-${s.id}`,
        icon: s.icon,
        label: s.label,
        selected: s.id === on,
        onClick: (cx) => {
          setShared("agents.sort", s.id);
          this.sortOpen = false;
          cx.notify();
        },
      }),
    );
  }

  renderSortMenu(sort) {
    return Menu({
      id: "ag-sort-menu",
      open: this.sortOpen,
      focus: this.sortFocus,
      onOpenChange: (open, cx) => {
        this.sortOpen = open;
        cx.notify();
      },
      trigger: IconButton({
        id: "ag-sort",
        icon: sort.icon,
        label: `Sort agents: ${sort.label}`,
        iconSize: 14,
        muted: true,
      }),
      children: [MenuLabel("Sort agents"), ...this.sortOptions()],
    });
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(
        s.lines.map((l) =>
          div()
            .self_start()
            .mt(-4)
            .w(9)
            .h(17)
            .mr(4)
            .flex_none()
            .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input))
            .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6)),
        ),
      )
      .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
      .child(
        div()
          .flex_1()
          .truncate()
          .text_color(on ? t.foreground : t.muted)
          .child(k.name || k.template || k.program?.name || k.address),
      )
      .child(this.status(t, { status: st }, compact, 6));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false, size = 9) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working" || a.status === "waiting") return stateDot(t, a.status, size);
    if (size < 9 || a.status === "idle" || a.status === "done") return stateCircle(t, a.status, size);
    if (a.status === "blocked" && compact)
      return div()
        .size(14)
        .flex_none()
        .rounded(4)
        .bg(t.blocked + "26")
        .text_size(TEXT.avatar)
        .font_bold()
        .text_color(t.blocked)
        .flex()
        .items_center()
        .justify_center()
        .child("!");
    if (a.status === "blocked")
      return div()
        .flex_none()
        .px(6)
        .h(18)
        .rounded(5)
        .bg(t.blocked + "26")
        .text_size(TEXT.avatar)
        .font_semibold()
        .text_color(t.blocked)
        .flex()
        .items_center()
        .child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle")
      return div()
        .size(7)
        .mx(3)
        .flex_none()
        .rounded(4)
        .border(1.5)
        .border_color(t.idle ?? t.dim);
    return div()
      .size(7)
      .mx(3)
      .flex_none()
      .rounded(4)
      .bg(a.status === "done" ? color : t.dim + "00");
  }

  // opts, from the lists view: `view` already read, `heading: false` under its tabs.
  render(opts = {}) {
    const t = theme();
    const view = opts.view ?? this.readView();
    setAgentOrder(view.list.map((a) => a.address));
    const rows = view.collapsed
      ? view.list.flatMap((a, i) => this.agentWithSubs(a, i, view, t))
      : view.groups.flatMap((group, index) => this.groupRows(group, index, view, t));

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      // Under the lists view's tabs, the tab bar's space divides it instead.
      .when(opts.heading !== false, (el) => el.border_t(1).border_color(t.border))
      .text_size(TEXT.body)
      .when(!view.collapsed && opts.heading !== false, (el) => el.child(this.heading(view.sort, t)))
      .when(view.list.length === 0 && !view.collapsed, (el) => el.child(this.emptyMessage(t)))
      .child(
        v_flex()
          .id("ag-list")
          .flex_1()
          .min_h(0)
          .px(view.collapsed ? 0 : 8)
          .overflow_y_scrollbar()
          .mode("always")
          .children(rows),
      )
      .when(view.collapsed, (el) => el.child(this.expandRow(t)));
  }

  // ── What to show ──────────────────────────────────────────────────────────

  // Everything one render needs: the agents in order, in their groups.
  readView() {
    const sort = sortOf();
    const all = terminals();
    const now = Date.now();
    const unordered = allAgents();
    const shownNow = unordered.find((a) => a.focused)?.address ?? null;
    if (shownNow !== this.lastFocus) {
      if (shownNow && this.unread.has(shownNow)) this.setUnread(shownNow, false);
      this.lastFocus = shownNow;
    }
    this.listed = new Map(unordered.map((a) => [a.address, a.status]));
    this.track(unordered, now);
    this.hold(unordered);
    this.prunePins(all);

    const byPriority = sort.id === "priority";
    const urgency = this.urgencies(unordered, all);
    const ordered = byPriority ? this.byUrgency(unordered, urgency) : unordered;
    const pinned = this.pins.map((p) => ordered.find((a) => a.address === p)).filter(Boolean);
    const unpinned = ordered.filter((a) => !this.pins.includes(a.address));

    const label = agentLabel();
    const groupOf = grouping(sort.id, label);
    const rest = groupOf ? gatherGroups(unpinned, groupOf, sort.id) : unpinned;
    const list = [...pinned, ...rest];
    return {
      sort,
      count: unordered.length,
      all,
      now,
      byPriority,
      collapsed: narrow(),
      shown: focused()?.agent,
      list,
      label,
      groups: this.makeGroups(pinned, rest, groupOf, byPriority, urgency),
    };
  }

  // An agent's urgency is its own or its most urgent sub-agent's.
  urgencies(list, all) {
    const kids = (a) =>
      this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0);
    return new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...kids(a))]));
  }

  byUrgency(list, urgency) {
    const rankOf = (a) => urgency.get(a.address);
    return [...list].sort(
      (x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq,
    );
  }

  // Groups in list order: spaces (grouped) or priority sections. Agents of a
  // space are next to each other in agents(), so neighbours make a group.
  makeGroups(pinned, rest, groupOf, byPriority, urgency) {
    const groups = pinned.length
      ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }]
      : [];
    for (const a of rest) {
      const rank = urgency.get(a.address) || RANK.idle;
      const group = groupOf ? groupOf(a) : { id: `sec-${rank}`, label: SECTION[rank] };
      if (groups.at(-1)?.id === group.id) groups.at(-1).members.push(a);
      else
        groups.push({ ...group, status: byPriority ? SECTION_STATUS[rank] : null, members: [a] });
    }
    return groups;
  }

  toggleFold(id, cx) {
    if (!this.folded.delete(id)) this.folded.add(id);
    cx.notify();
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  heading(sort, t) {
    return h_flex()
      .px(16)
      .h(41)
      .pt(14)
      .pb(5)
      .flex_none()
      .items_center()
      .justify_between()
      .child(div().text_size(TEXT.label).font_medium().text_color(t.dim).child("Agents"))
      .child(this.renderSortMenu(sort));
  }

  emptyMessage(t) {
    return div()
      .px(12)
      .text_size(TEXT.small)
      .text_color(t.dim)
      .child(
        "No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.",
      );
  }

  // Under the compact rail, the way back to the full sidebar.
  expandRow(t) {
    return h_flex()
      .h(28)
      .items_center()
      .justify_center()
      .child(
        div()
          .id("collapse")
          .text_size(TEXT.body)
          .text_color(t.dim)
          .hover((s) => s.text_color(t.foreground))
          .on_click(toggleSidebar)
          .child("»"),
      );
  }

  groupRows(group, index, view, t) {
    const members = this.folded.has(group.id)
      ? []
      : group.members.flatMap((a, i) => this.agentWithSubs(a, i, view, t));
    return [this.groupHeader(group, index, view, t), ...members];
  }

  // Folded, a group's header also says its most urgent state.
  groupHeader(group, index, view, t) {
    const folded = this.folded.has(group.id);
    const top = group.members.reduce(
      (most, a) => ((RANK[a.status] ?? 0) > (RANK[most] ?? 0) ? a.status : most),
      null,
    );
    const showTop = folded && !view.byPriority && top && top !== "idle";
    return GroupHeader({
      id: group.id,
      label: group.label,
      count: group.members.length,
      labelColor: t[group.status],
      folded,
      divided: index > 0,
      action: showTop ? this.status(t, { status: top }, true) : null,
      onClick: (cx) => this.toggleFold(group.id, cx),
    });
  }

  agentWithSubs(a, i, view, t) {
    if (view.collapsed) return [this.railRow(a, i, t)];
    const subs = this.tree(view.all, a.address);
    const cs = sessionFor(a.address);
    const roots = cs ? build(cs.s.agents, cs.now) : [];
    const row = this.agentRow(a, subs, view, t, cs, roots);
    if (this.folded.has(a.address)) return [row];
    return [
      row,
      ...subs.map((s) => this.subRow(t, s, view.shown, view.byPriority)),
      ...(cs && !this.subsHidden ? this.claudeRows(a, cs, roots, t) : []),
    ];
  }

  railRow(a, i, t) {
    return h_flex()
      .id(`ag-${a.address}`)
      .h(26)
      .px(8)
      .flex_none()
      .items_center()
      .gap(4)
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .whitespace_nowrap()
          .text_right()
          .text_color(t.muted)
          .child(String(i + 1)),
      )
      .child(
        h_flex()
          .w(14)
          .flex_none()
          .items_center()
          .justify_center()
          .child(this.status(t, a, true)),
      );
  }

  // One line: icon, name, controls, status circle. A Claude agent gets a second line
  // under its name, like a prompt's status line: model and effort, context, the last
  // reply against the prompt cache, subagents running/all, and time spent working.
  agentRow(a, subs, view, t, cs = null, roots = []) {
    const pic = icon(a.program, 16, t.foreground);
    const hovered = this.hovered === a.address;
    const when = this.since(a);
    const shownStatus = cs ? { ...a, status: claudeStatus(a, cs, roots) } : a;
    const kids = subs.length + (cs && !this.subsHidden ? cs.s.agents.length : 0);
    const age = cs ? replyAge(t, cs, TEXT.caption, a.status === "working", Icon) : null;
    // Under its machine's heading the machine goes without saying; flat lists name it.
    const machine = !view.nested && a.address.includes("/") ? a.address.split("/")[0] : null;
    const line = h_flex()
      .h(22)
      .w_full()
      .min_w(0)
      .items_center()
      .gap(9)
      .when(Boolean(pic), (el) => el.child(this.agentIcon(a, pic, subs)))
      .child(this.agentName(a, view, t))
      .when(Boolean(machine), (el) =>
        el.child(div().text_size(TEXT.badge).text_color(t.dim).child(machine)),
      )
      // A Claude agent folds its subagents from its second line; others from here.
      .when(!cs && kids > 0, (el) => el.child(this.foldButton(a, subs, t, roots)))
      .when(hovered, (el) => el.child(this.pinButton(a, t)))
      // Claude: time since its last reply, with the prompt cache's flame or snowflake.
      .when(Boolean(age), (el) => el.child(age))
      // Not Claude: Better Sidebar's time in the current state.
      .when(!cs && Boolean(when), (el) =>
        el.child(
          div()
            .flex_none()
            .font_family(mono())
            .text_size(TEXT.caption)
            .text_color(t.dim)
            .tooltip("time in this state")
            .child(duration(view.now - when)),
        ),
      )
      .child(this.statusToggle(a, shownStatus, t, view.byPriority && !this.pins.includes(a.address)));
    return v_flex()
      .id(`ag-${a.address}`)
      .px(8)
      .py(4)
      .flex_none()
      .w_full()
      .min_w(0)
      .rounded(8)
      // Under its space, the row the focused tab lights; in the flat list, the focused agent.
      .when(view.nested ? view.lit?.agent === a.address : a.focused, (el) => el.bg(t.selected))
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((on, cx) => {
        if (on) this.hovered = a.address;
        else if (hovered) this.hovered = null;
        cx.notify();
      })
      .on_click(() => {
        // Clicking an unread agent reads it.
        if (this.unread.has(a.address)) this.setUnread(a.address, false);
        run("pane.focus", { pane: a.pane });
      })
      .child(line)
      .when(Boolean(cs), (el) =>
        el.child(this.detailLine(a, cs, roots, t, kids > 0 ? this.foldButton(a, subs, t, roots) : null)),
      );
  }

  // Under the icon, the subagents' fold chevron (only when it has any); then the
  // details, " • " between them: model and effort, context, subagents running/all,
  // time spent working.
  detailLine(a, cs, roots, t, fold) {
    const s = cs.s;
    const walk = (n) => [n, ...n.kids.flatMap(walk)];
    const all = roots.flatMap(walk);
    const running = all.filter((n) => n.active).length;
    const working = a.status === "working";
    const pct = contextPercent(s.reqModel ?? s.model, s.ctx);
    const model = [modelName(s.reqModel ?? s.model), s.effort].filter(Boolean).join(" ");
    const turn = working && s.promptAt ? Math.max(0, cs.now - s.promptAt) : 0;
    const worked = (s.worked ?? 0) + turn;
    // `w`: a fixed width for a value that ticks, so what follows it stays put.
    const chip = (iconName, text, tip, w = null) =>
      h_flex().flex_none().gap(3).items_center().tooltip(tip).child(Icon(iconName, 11))
        .child(div().font_family(mono()).whitespace_nowrap().when(w !== null, (el) => el.w(w).max_w(w).overflow_hidden()).child(text));
    const parts = [
      // The model shortens first when the line runs out of room.
      model && div().min_w(0).truncate().tooltip(s.reqModel ?? s.model ?? "").child(model),
      pct !== null &&
        h_flex().flex_none().gap(3).items_center().tooltip(`${Math.round(s.ctx / 1000)}k tokens`)
          .child("Ctx:").child(percentChip(t, pct, TEXT.caption, s.ctx)),
      all.length > 0 && chip("bot", `${running}/${all.length}`, `subagents: ${running} running of ${all.length}`),
      worked >= 1000 &&
        chip(
          "timer",
          ago(worked),
          `time spent working: ${ago(worked)} over ${s.turns + (turn ? 1 : 0)} turns${turn ? ` (this one ${ago(turn)} so far)` : ""}`,
          // Six mono characters at caption size: "59m59s", "99d23h".
          41,
        ),
    ].filter(Boolean);
    const dot = () => div().flex_none().child("•");
    return h_flex()
      .h(16)
      .w_full()
      .min_w(0)
      .items_center()
      .gap(9)
      // The icon's column (16px), so the chevron sits right under it.
      .child(h_flex().min_w(16).flex_none().justify_center().when(Boolean(fold), (el) => el.child(fold)))
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .items_center()
          .gap(5)
          .text_size(TEXT.caption)
          .text_color(t.dim)
          .children(parts.flatMap((p, i) => (i ? [dot(), p] : [p]))),
      );
  }

  // Claude's subagents under an agent, as a tree: open, finished ones behind an
  // "N done" row per parent that folds them (here or all at once from the tab bar).
  claudeRows(a, cs, roots, t) {
    const open = { has: (k) => this.subAll === this.subFlip.has(k) };
    const pic = () => icon(a.program, 12, t.muted);
    return subRows(`s:${a.address}`, roots, open, []).map((r) => (r.fold ? this.subFoldRow(r, t) : this.subAgentRow(r, cs, t, pic)));
  }

  subFoldRow({ key, fold, opened, lines }, t) {
    const quiet = fold.filter((k) => !k.done).length, done = fold.length - quiet;
    return h_flex().id(`cfold-${key}`).h(24).pl(10).pr(8).flex_none().w_full().min_w(0).items_center().rounded(6)
      .text_size(TEXT.caption).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.muted))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        if (!this.subFlip.delete(key)) this.subFlip.add(key);
        cx.notify();
      })
      .children(guides(t, lines, 24))
      .child(Icon(`chevron-${opened ? "down" : "right"}`, 11).mr(5))
      .child([done ? `${done} done` : null, quiet ? `${quiet} quiet` : null].filter(Boolean).join(" · "));
  }

  subAgentRow({ agent: s, lines }, cs, t, pic = () => null) {
    // Running (or waiting): so far; finished or gone quiet: until its last write.
    const took = s.active ? cs.now - s.start : s.last - s.start;
    const pct = contextPercent(s.llm, s.ctx);
    const tip = [s.desc, `${s.type}${s.model ? ` · ${s.model}` : ""}`,
      s.state === "quiet" ? `no output for ${ago(cs.now - s.last)}` : s.state === "waiting" ? "waiting for its subagents" : null]
      .filter(Boolean).join("\n");
    const icon12 = pic();
    return h_flex().id(`csub-${s.id}`).h(24).pl(10).pr(8).flex_none().w_full().min_w(0).items_center().gap(6).rounded(6)
      .text_size(TEXT.small).hover((st) => st.bg(t.hover)).tooltip(tip)
      .child(h_flex().h_full().flex_none().children(guides(t, lines, 24)))
      .when(Boolean(icon12), (el) => el.child(icon12))
      .child(div().flex_1().min_w(0).truncate().text_color(s.state === "done" ? t.muted : t.foreground).child(s.desc || s.type))
      // Fixed, right-aligned columns like the cache time's: "100%" and "99d23h" fit.
      .child(div().w(30).max_w(30).flex_none().overflow_hidden().flex().justify_end()
        .when(pct !== null, (el) => el.child(percentChip(t, pct, TEXT.badge, s.ctx).whitespace_nowrap())))
      .child(div().w(44).max_w(44).flex_none().overflow_hidden().text_right().whitespace_nowrap().font_family(mono()).text_size(TEXT.badge)
        .text_color(t.dim).tooltip(s.active ? "running for" : "ran for").child(ago(took)))
      // The same column as the main agent's circle (mx centers the smaller one under it).
      .child(div().w(9).flex().justify_center().child(stateCircle(t, s.state === "done" ? "finished" : s.state, 6)));
  }

  // The state an agent's circle shows, without hovering it: Claude's own (waiting on its
  // subagents too), and a resting agent marked unread shows done.
  shownState(a) {
    const cs = sessionFor(a.address);
    const s = cs ? claudeStatus(a, cs, build(cs.s.agents, cs.now)) : a.status;
    if (s !== "idle" && s !== "done") return s;
    return s === "done" || this.unread.has(a.address) ? "done" : "idle";
  }

  setUnread(address, on) {
    if (on) this.unread.add(address);
    else this.unread.delete(address);
    localStorage.setItem("unread", JSON.stringify([...this.unread]));
  }

  // The status circle. Marked unread (and resting: idle or done), it shows done's blue.
  // On the active agent only, hovering previews the flip (grey shows blue, blue shows
  // grey) and clicking makes it: mark unread, or read again.
  statusToggle(a, shown, t, compact) {
    const resting = shown.status === "idle" || shown.status === "done";
    const marked = resting && (this.unread.has(a.address) || shown.status === "done");
    const base = resting ? (marked ? "done" : "idle") : shown.status;
    const can = a.focused && resting;
    const hover = can && this.circleHover === a.address;
    const status = hover ? (base === "done" ? "idle" : "done") : base;
    return div()
      .id(`st-${a.address}`)
      .flex_none()
      .when(can, (el) =>
        el
          .cursor_pointer()
          .tooltip(base === "done" ? "Mark as read" : "Mark as unread")
          .on_hover((on, cx) => {
            this.circleHover = on ? a.address : this.circleHover === a.address ? null : this.circleHover;
            cx.notify();
          })
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.setUnread(a.address, base !== "done");
            cx.notify();
          }),
      )
      .child(this.status(t, { ...shown, status }, compact));
  }

  // The tab bar's eye: show or hide Claude's subagents under every agent.
  subsVisibleButton() {
    return IconButton({
      id: "subs-visible",
      icon: this.subsHidden ? "eye-off" : "eye",
      label: this.subsHidden ? "Show subagents" : "Hide subagents",
      iconSize: 14,
      muted: true,
      onClick: (cx) => {
        this.subsHidden = !this.subsHidden;
        localStorage.setItem("subs.hidden", this.subsHidden ? "1" : "0");
        cx.notify();
      },
    });
  }

  // The tab bar's switch: fold every agent's finished subagents, or open them all.
  foldDoneButton() {
    return IconButton({
      id: "sub-fold-all",
      icon: this.subAll ? "chevron-right" : "chevron-down",
      label: this.subAll ? "Expand finished subagents" : "Collapse finished subagents",
      iconSize: 14,
      muted: true,
      onClick: (cx) => {
        this.subAll = !this.subAll;
        this.subFlip.clear();
        cx.notify();
      },
    });
  }

  // A tab with no agent, under its space in the lists view: its program and its name.
  tabRow(w, tab, lit, t) {
    const all = panes();
    const l = lead(tab, all);
    // The tab's title, as Herdr's tab bar shows it.
    const name = tab.name;
    const prog = l?.program?.name;
    // A mod's pane runs no program, but any of them may publish its own icon in
    // shared("pane-heads"), as a file tab does, else the mod may publish one, as Better Tabs reads them.
    const mods = all.filter((p) => p.tab === tab.id && p.mod);
    const heads = shared("pane-heads") ?? {};
    const head = heads[mods.find((p) => heads[p.pane]?.icon)?.pane];
    const pub = head
      ? { icon: head.icon, tint: !head.color }
      : { icon: shared("mod-icons")?.[mods[0]?.mod], tint: true };
    const pic = icon(l?.program, 16, t.dim) ?? icon(pub, 16, t.dim);
    return h_flex()
      .id(`tab-${tab.id}`)
      .px(8)
      .h(30)
      .flex_none()
      .rounded(8)
      .items_center()
      .gap(9)
      .when(lit, (el) => el.bg(t.selected))
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        run("space.select", { id: w.id });
        run("tab.select", { id: tab.id });
      })
      .child(pic ?? div().w(16).flex_none())
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .gap(5)
          .items_center()
          .child(div().min_w(0).truncate().text_color(lit ? t.foreground : t.muted).child(name))
          .when(Boolean(prog) && prog !== name, (el) => el.child(this.programName(prog, t))),
      );
  }

  // The program, quietly after a row's name under its space.
  programName(prog, t) {
    return div().flex_1().min_w(0).truncate().text_size(TEXT.caption).text_color(t.dim).child(prog);
  }

  // With sub-agents, clicking the icon folds them.
  agentIcon(a, pic, subs) {
    return div()
      .id(`agent-fold-${a.address}`)
      .when(subs.length > 0, (el) =>
        el.on_click((_e, cx) => {
          cx.stop_propagation();
          this.toggleFold(a.address, cx);
        }),
      )
      .child(pic);
  }

  // What a row is called: its tab's title, as Herdr's tab bar shows it, or with
  // `agent_name: "title"` the terminal's live title, what the agent says it's doing.
  // Either falls back to the other. The icon says which agent it is.
  rowName(a, label) {
    const tab = a.tab_name || label;
    return this.nameBy === "title" ? clean(a.title) || tab : tab;
  }

  // The row's name, then quietly its space; nested under its space's row, its program.
  agentName(a, view, t) {
    const label = view.label(a);
    const namesSpace = !view.nested;
    const name = this.rowName(a, label);
    const prog = a.program?.name;
    const idle = a.status === "idle" && !(view.nested ? view.lit?.agent === a.address : a.focused);
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .items_center()
      .child(
        div()
          .min_w(0)
          .max_w(namesSpace ? 140 : 200)
          .truncate()
          .text_color(idle ? t.muted : t.foreground)
          .child(name),
      )
      // The space, quietly after the name.
      .when(namesSpace && Boolean(a.space_name), (el) =>
        el.child(div().flex_1().min_w(0).truncate().text_size(TEXT.caption).text_color(t.dim).child(a.space_name)),
      );
      // Under its space nothing more: the icon already says which program it is.
  }

  // The fold chevron in a fixed 16px box, so lines stay aligned: open, a plain chevron;
  // folded, a bordered button tinted by the most urgent subagent it hides.
  foldButton(a, subs, t, roots = []) {
    const walk = (n) => [n, ...n.kids.flatMap(walk)];
    const statuses = [
      ...subs.map((s) => kidStatus(s.t, this.listed)),
      ...roots.flatMap(walk).filter((n) => n.active).map(() => "working"),
    ];
    const top = statuses.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
    const open = !this.folded.has(a.address);
    return div()
      .id(`fold-${a.address}`)
      .size(16)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(4)
      .text_color(open ? t.dim : (t[top] ?? t.muted))
      .cursor_pointer()
      .tooltip(open ? "Fold subagents" : "Show subagents")
      .when(!open, (el) => el.border(1).border_color(t.input).bg(t.raised))
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.toggleFold(a.address, cx);
      })
      .child(Icon(`chevron-${open ? "down" : "right"}`, 11));
  }

  pinButton(a, t) {
    const pinned = this.pins.includes(a.address);
    return div()
      .id(`pin-${a.address}`)
      .flex_none()
      .p(2)
      .rounded(4)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(pinned ? "Unpin" : "Pin to the top of its space")
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.setPins(pinned ? this.pins.filter((p) => p !== a.address) : [...this.pins, a.address]);
        // The row moves away from under the pointer, and no hover-out comes.
        this.hovered = null;
        cx.notify();
      })
      .child(Icon(pinned ? "pin-off" : "pin", 13));
  }
}
