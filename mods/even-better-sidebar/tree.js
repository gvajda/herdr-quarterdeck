// Pure tree logic for agent-tree (no herdr imports, so node can test it).

export const QUIET_MS = 5 * 60 * 1000; // no transcript write for this long: quiet, not running

// Subagents into a tree. A node is active if it or anything under it isn't finished:
// a lead waiting on its workers writes nothing, but it's still running.
export function build(list, now) {
  const byId = new Map(list.map((a) => [a.id, { ...a, kids: [] }]));
  const roots = [];
  for (const a of byId.values()) (a.parent && byId.get(a.parent) ? byId.get(a.parent).kids : roots).push(a);
  const mark = (a) => {
    a.kids.sort((x, y) => x.start - y.start);
    a.kids.forEach(mark);
    // waiting: parked on a wait (or silent) while subagents under it work.
    // ponytail: a subagent silent past QUIET_MS (a long bash, or the session died) folds away;
    // a smarter "done" would read the parent transcript's task notices, as herdr-over9k does.
    const busyKids = a.kids.some((k) => k.active);
    a.state = a.done ? "done"
      : busyKids && a.act === "wait" ? "waiting"
      : now - a.last < QUIET_MS ? "working"
      : busyKids ? "waiting" : "quiet";
    a.active = a.state === "working" || a.state === "waiting";
  };
  roots.sort((x, y) => x.start - y.start).forEach(mark);
  return roots;
}

// Rows under a parent, depth first, with their guide columns. Open: every subagent in
// start order, after an "N done" header when 2+ have finished. Folded: the header (if
// any), then the active ones; a lone finished one has no header and just hides.
// "│" passes through, "├" passes and branches, "└" ends here, "" is blank.
export function rows(key, kids, open, lead = []) {
  const done = kids.filter((k) => !k.active);
  const active = kids.filter((k) => k.active);
  const unfold = open.has(key);
  const shown = unfold ? kids : active;
  const items = done.length >= 2 ? [{ fold: done, key, opened: unfold }, ...shown] : shown;
  return items.flatMap((k, i) => {
    const last = i === items.length - 1;
    const lines = [...lead, last ? "└" : "├"];
    if (k.fold) return [{ ...k, lines }];
    return [{ agent: k, lines }, ...rows(k.id, k.kids, open, [...lead, last ? "" : "│"])];
  });
}
