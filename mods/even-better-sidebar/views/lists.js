// Spaces and agents in one block. Combined (the default): tabs for Spaces, with
// each space's tabs and agents under it, and Agents. With `combined: false` in the settings: the
// two lists one above the other, as two blocks of this mod would draw them.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { focused, spaces, theme, setAgentOrder } from "herdr";
import { groupTabs, litFor } from "../tabs.js";
import { allAgents } from "./claude.js";
import { Spaces } from "./spaces.js";
import { Agents } from "./agents.js";
import { TEXT, Badge, Rail } from "./ui.js";
import { statusTally } from "./tally.js";

const TABS = ["spaces", "agents"];

// A theme color with its alpha scaled by k (#rrggbb counts as opaque).
const fade = (c, k) => {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c ?? "");
  if (!m) return c;
  const a = Math.round((m[2] ? parseInt(m[2], 16) : 255) * k);
  return `#${m[1]}${a.toString(16).padStart(2, "0")}`;
};

export class Lists {
  init(props, cx) {
    this.spaces = new Spaces();
    this.spaces.init(props, cx);
    this.agents = new Agents();
    this.agents.init(props, cx);
    const saved = localStorage.getItem("lists.tab");
    this.tab = TABS.includes(saved) ? saved : "spaces";
  }

  pick(tab, cx) {
    this.tab = tab;
    localStorage.setItem("lists.tab", tab);
    cx.notify();
  }

  render() {
    const t = theme();
    const collapsed = this.spaces.collapsed();
    const root = v_flex()
      .id("even-better-sidebar-lists")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_size(TEXT.body)
      .on_size_change((size, cx) => this.spaces.resized(size, cx));
    this.spaces.under = null;
    this.spaces.quiet = null;
    this.spaces.above = null;
    // The rail has no room for tabs: both lists, as numbers.
    if (!this.spaces.settings.combined || collapsed)
      return root
        .child(
          v_flex()
            .flex_1()
            .min_h(0)
            .child(this.spaces.header(t, collapsed))
            .child(this.spaces.body(t, collapsed)),
        )
        .child(v_flex().flex_1().min_h(0).child(this.agents.render()));

    const view = this.agents.readView();
    root.child(this.tabBar(t, view));
    root.child(statusTally(this.agents, t));
    if (this.tab !== "spaces") return root.child(this.agents.render({ view, heading: false }));

    // Spaces, each with its agents beneath grouped by tab: pinned tabs first, then in tab
    // order, so rows don't move as their state changes; next-agent keys follow that order.
    const all = allAgents();
    const pins = this.agents.pins;
    // What the focused pane lights: its agent, its tab's lone agent, or its tab's band.
    const f = focused();
    const shownSpace = spaces().find((s) => s.active);
    const lit = shownSpace && f ? litFor({ tab: f.tab, pane: f.pane }, groupTabs(shownSpace.tabs, all, pins)) : null;
    const nested = { ...view, sort: { id: "grouped" }, byPriority: false, nested: true, lit };
    const order = [];
    const nest = (lines, row) => h_flex().children(lines.map((l) => Rail(l))).child(row.flex_1().min_w(0));
    // A space's agents hang from its line; a main space's worktrees come after them,
    // so its line carries on, and a worktree's own agents sit one step further in.
    // Only agents show under a space; tabs with none (plain terminals) don't.
    // A tab with several agents is one branch: its rows on a shaded band, no room taken.
    this.spaces.under = ({ w, tree, kids }) => {
      const groups = groupTabs(w.tabs, all, pins);
      order.push(...groups.flatMap((g) => g.agents.map((a) => a.address)));
      const before = tree ? [tree.startsWith("└") ? "" : "│"] : [];
      const firstLoose = groups.some((g) => g.pinned) ? groups.findIndex((g) => !g.pinned) : -1;
      return groups.flatMap((g, gi) => {
        const last = gi === groups.length - 1 && !kids;
        const rows = g.agents.flatMap((a, i) => this.agents.agentWithSubs(a, i, nested, t));
        const out = [];
        // Pinned tabs, then a thin line, then the rest.
        if (gi === firstLoose)
          out.push(nest([...before, "│"], h_flex().h(9).px(8).items_center().child(div().h(1).flex_1().bg(t.border))));
        if (g.agents.length === 1) {
          const [row, ...subs] = rows;
          out.push(nest([...before, last ? "└" : "├"], row), ...subs.map((s) => nest([...before, last ? "" : "│"], s)));
        } else {
          const on = lit?.tab === g.tab;
          // At rest fainter than a hover; under a lit agent, a hover; lit itself, like a lit row.
          const shade = on ? (lit.band === "full" ? t.selected : t.hover) : fade(t.hover, 0.6);
          out.push(nest([...before, last ? "└" : "├"], v_flex().rounded(8).bg(shade).children(rows)));
        }
        return out;
      });
    };
    // One row lit: a space whose focused tab shows beneath it leaves it to that row or band.
    this.spaces.quiet = (w) => lit !== null && w.tabs.some((tab) => tab.id === lit.tab);
    const body = this.spaces.body(t, false);
    setAgentOrder(order);
    return root.child(body);
  }

  // Tabs side by side from the left, the picked one filled.
  tabBar(t, view) {
    const tab = (id, label, count) =>
      h_flex()
        .id(`lists-tab-${id}`)
        .px(10)
        .h(24)
        .gap(5)
        .justify_center()
        .items_center()
        .rounded(6)
        .cursor_pointer()
        .text_size(TEXT.label)
        .font_medium()
        .text_color(this.tab === id ? t.foreground : t.dim)
        .when(this.tab === id, (el) => el.bg(t.selected))
        .when(this.tab !== id, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .on_click((_e, cx) => this.pick(id, cx))
        .child(label)
        // The count badge the group headers use.
        .when(count !== null, (el) => el.child(Badge(count)));
    return h_flex()
      .px(8)
      .pt(6)
      .pb(6)
      .mb(4)
      .border_b(1)
      .border_color(t.border)
      .flex_none()
      .gap(6)
      .items_center()
      .child(
        h_flex()
          .flex_1()
          .gap(2)
          .child(tab("spaces", "Spaces", null))
          .child(tab("agents", "Agents", view.count)),
      )
      .child(this.tab === "spaces"
        ? h_flex().gap(2).items_center().child(this.agents.subsVisibleButton()).child(this.agents.foldDoneButton()).child(this.spaces.headerButtons())
        : this.agents.sortMenu());
  }
}
