// Places a space can come back to: pinned ones, which stay in the sidebar after their
// space closes, and recently closed ones. A space's id dies with it, so a place is its
// machine and folder (where its first terminal was), plus its name if someone named it,
// and its avatar, carried to the space that reopens it. Kept in shared state, so every
// copy and every layout sees the same lists and they survive restarts.
import { shared, setShared, run } from "herdr";
import { spaceFolder } from "../git/checkouts.js";
import { lookOf, colorOf } from "./avatar.js";

const PINNED = "even-better-sidebar.pinned";
const RECENT = "even-better-sidebar.recent";
const ORDER = "even-better-sidebar.order";
const RECENT_MAX = 10;

export const pinned = () => shared(PINNED) ?? [];
export const recent = () => shared(RECENT) ?? [];
export const placeKey = (p) => JSON.stringify([p.machine ?? null, p.folder]);

export function placeOf(space, paneList) {
  return {
    machine: space.machine ?? null,
    folder: spaceFolder(space, paneList),
    name: space.name,
    named: Boolean(space.named),
    color: colorOf(space.id),
    look: lookOf(space.id),
  };
}

// A place is open when a space on its machine is in its folder, or carries its given name.
export const sameSpot = (p, q) =>
  (p.machine ?? null) === (q.machine ?? null) && (p.folder === q.folder || (p.named && q.named && p.name === q.name));

export const isPinned = (p) => pinned().some((q) => sameSpot(p, q));
// The key a pinned place holds in the order, or null.
export function pinKeyOf(p) {
  const e = pinned().find((q) => sameSpot(p, q));
  return e ? placeKey(e) : null;
}

// Each machine's saved order (see order.js), keyed "" for this computer.
export const savedOrder = (m) => (shared(ORDER) ?? {})[m ?? ""] ?? [];
export function saveOrder(m, list) {
  const all = shared(ORDER) ?? {};
  if (JSON.stringify(all[m ?? ""] ?? []) === JSON.stringify(list)) return;
  setShared(ORDER, { ...all, [m ?? ""]: list });
}
const rekey = (m, from, to) => saveOrder(m, savedOrder(m).map((k) => (k === from ? to : k)));

const without = (list, p) => list.filter((q) => !sameSpot(p, q));

// `id`: the open space being pinned, whose slot in the order the place takes over.
export function pin(p, id) {
  setShared(PINNED, [...without(pinned(), p), p]);
  forget(p);
  if (id) rekey(p.machine, id, placeKey(p));
}

// Unpinning a closed place doesn't lose it: it goes to recently closed. An open one (`id`)
// keeps its slot under its id again.
export function unpin(p, closed, id) {
  const key = pinKeyOf(p);
  setShared(PINNED, without(pinned(), p));
  if (id && key) rekey(p.machine, key, id);
  if (closed) remember(p);
}

// A pinned space closed: keep its latest name and look, but not its folder, which is its key.
export function refreshPin(p) {
  setShared(PINNED, pinned().map((q) => (sameSpot(p, q) ? { ...q, name: p.name, named: p.named, color: p.color, look: p.look } : q)));
}

export function remember(p) {
  setShared(RECENT, [{ ...p, at: Date.now() }, ...without(recent(), p)].slice(0, RECENT_MAX));
}

export function forget(p) {
  const list = recent();
  const kept = without(list, p);
  if (kept.length !== list.length) setShared(RECENT, kept);
}

// A new space there; the closed list drops it once the space shows (see Spaces.trackPlaces),
// so a failed start (an unreachable machine) leaves it to try again.
export function reopen(p) {
  run("space.new", { folder: p.folder, machine: p.machine ?? "", ...(p.named ? { name: p.name } : {}) });
}
