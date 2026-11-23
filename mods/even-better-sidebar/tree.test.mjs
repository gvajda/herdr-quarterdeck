// node mods/even-better-sidebar/tree.test.mjs: checks build()/rows() on a small fixture.
import assert from "node:assert";
import { build, rows } from "./tree.js";
const now = 1_000_000_000;
const a = (id, parent, done, start, last = now, act = "busy") => ({ id, parent, done, start, last, act });
const roots = build([
  a("lead", null, false, 1, now - 3_600_000), // silent itself, but a worker runs
  a("w1", "lead", true, 2),
  a("w2", "lead", false, 3),
  a("dead", "lead", false, 4, now - 3_600_000), // never finished, silent: folds
  a("old", null, true, 0), // the lone finished one at the top
  a("boss", null, false, 5, now, "wait"), // just polled, its worker runs
  a("bw", "boss", false, 6),
], now);
assert.deepEqual(roots.map((r) => r.id), ["old", "lead", "boss"]);
assert.equal(roots[1].state, "waiting");
assert.equal(roots[2].state, "waiting");
assert.equal(roots[2].kids[0].state, "working");
const label = (x) => (x.fold ? `fold:${x.fold.length}` : x.agent.id);
// open (the default): everything in start order, a header only over 2+ finished
const open = { has: () => true };
assert.deepEqual(rows("s", roots, open, [""]).map(label), ["old", "lead", "fold:2", "w1", "w2", "dead", "boss", "bw"]);
// folded: lone finished "old" hides, lead's two finished fold behind their header
const r = rows("s", roots, new Set(), [""]);
assert.deepEqual(r.map(label), ["lead", "fold:2", "w2", "boss", "bw"]);
assert.deepEqual(r.map((x) => x.lines.join(",")), [",├", ",│,├", ",│,└", ",└", ",,└"]);
console.log("ok");
