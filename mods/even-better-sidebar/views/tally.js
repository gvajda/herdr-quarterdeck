// One line over the lists: every open agent counted by the state its circle shows, the
// ones needing you as an "N" in the Needs-you badge's colors, then their Claude subagents
// as running/all. Zero counts stay, faded, so the line doesn't shift.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { allAgents, sessionFor, stateCircle } from "./claude.js";
import { build } from "../tree.js";
import { TEXT, Icon, mono } from "./ui.js";

const TIPS = { blocked: "need you", working: "working", waiting: "waiting on subagents", done: "done, unread", idle: "idle" };

export function statusTally(agents, t) {
  const n = { blocked: 0, working: 0, waiting: 0, done: 0, idle: 0 };
  let running = 0, all = 0;
  const walk = (k) => [k, ...k.kids.flatMap(walk)];
  for (const a of allAgents()) {
    const s = agents.shownState(a);
    if (s in n) n[s]++;
    const cs = sessionFor(a.address);
    for (const k of cs ? build(cs.s.agents, cs.now).flatMap(walk) : []) {
      all++;
      if (k.active) running++;
    }
  }
  const badge = div().px(4).h(16).rounded(5).bg(t.blocked + "26").text_size(TEXT.avatar).font_semibold()
    .text_color(t.blocked).flex().items_center().child("N");
  const item = (s) => h_flex().id(`tally-${s}`).gap(4).items_center().when(!n[s], (el) => el.opacity(0.4))
    .tooltip(`${n[s]} ${TIPS[s]}`)
    .child(s === "blocked" ? badge : stateCircle(t, s, 9))
    .child(div().text_color(t.foreground).child(String(n[s])));
  const subs = h_flex().id("tally-subs").gap(3).items_center().text_color(t.dim).when(!all, (el) => el.opacity(0.4))
    .tooltip(`subagents: ${running} running of ${all}`)
    .child(Icon("bot", 11)).child(`${running}/${all}`);
  // " · " between the parts, as on an agent's detail line.
  const parts = [...Object.keys(n).map(item), subs];
  return h_flex().flex_none().h(30).px(14).mb(4).gap(6).border_b(1).border_color(t.border).items_center().justify_center().text_size(TEXT.caption).font_family(mono())
    .children(parts.flatMap((p, i) => (i ? [div().text_color(t.dim).child("·"), p] : [p])));
}
