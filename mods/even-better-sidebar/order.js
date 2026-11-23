// Pure ordering for the spaces list (no herdr imports, so node can test it). Each machine
// keeps a saved list of keys: an open space's id, or a pinned place's key, which a pinned
// space keeps whether open or closed, so a closed pin holds its slot.

// The full list: saved keys in place, a new open space after its predecessor in Herdr's
// order, a new closed pin last; then unpinned open spaces fill their slots in Herdr's order
// (so moves made elsewhere show) while every other key stays put: pinned ones (`held`), open
// or closed, keep the slot the person gave them. Keys neither open nor closed stay too (a
// machine still loading); the caller drops them once it knows they're gone.
export function arrange(saved, open, closed, held = new Set()) {
  const list = [...new Set(saved)];
  const have = new Set(list);
  open.forEach((k, i) => {
    if (have.has(k)) return;
    list.splice(i ? list.indexOf(open[i - 1]) + 1 : 0, 0, k);
    have.add(k);
  });
  for (const k of closed) if (!have.has(k)) list.push(k), have.add(k);
  const flow = open.filter((k) => !held.has(k));
  const flows = new Set(flow);
  let n = 0;
  return list.map((k) => (flows.has(k) ? flow[n++] : k));
}

// `from` dropped on `to` takes its place: after it moving down, before it moving up.
export function moved(list, from, to) {
  const out = list.filter((k) => k !== from);
  out.splice(list.indexOf(to), 0, from);
  return out;
}
