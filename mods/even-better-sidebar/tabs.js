// Pure tab logic for the lists view (no herdr imports, so node can test it).

// A space's tabs as groups of their agents, in tab order; tabs with no agent are left out.
// A tab with a pinned agent is pinned: pinned tabs come first, each part in tab order.
export function groupTabs(tabs, agents, pins) {
  const groups = tabs
    .map((tab) => {
      const mine = agents.filter((a) => a.tab === tab.id);
      return { tab: tab.id, agents: mine, pinned: mine.some((a) => pins.includes(a.address)) };
    })
    .filter((g) => g.agents.length);
  return [...groups.filter((g) => g.pinned), ...groups.filter((g) => !g.pinned)];
}

// What lights for the focused pane: its agent; the lone agent of its tab; or, in a tab
// with several agents, the whole band ("soft" under a lit agent, "full" without one).
// null when the focused tab has no agent: then the space row lights.
export function litFor(focus, groups) {
  const g = focus && groups.find((x) => x.tab === focus.tab);
  if (!g) return null;
  const on = g.agents.find((a) => a.pane === focus.pane);
  if (on) return { tab: g.tab, agent: on.address, band: g.agents.length > 1 ? "soft" : null };
  if (g.agents.length === 1) return { tab: g.tab, agent: g.agents[0].address, band: null };
  return { tab: g.tab, agent: null, band: "full" };
}
