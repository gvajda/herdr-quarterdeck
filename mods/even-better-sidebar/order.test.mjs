import assert from "node:assert/strict";
import { arrange, moved } from "./order.js";

// A closed pin keeps its slot between open spaces.
assert.deepEqual(arrange(["A", "G", "B"], ["A", "B"], ["G"]), ["A", "G", "B"]);
// Herdr reordered A and B elsewhere: they swap slots, G stays.
assert.deepEqual(arrange(["A", "G", "B"], ["B", "A"], ["G"]), ["B", "G", "A"]);
// New space goes after its Herdr predecessor; new closed pin goes last.
assert.deepEqual(arrange(["A", "G"], ["A", "C"], ["G", "H"]), ["A", "C", "G", "H"]);
// First new space goes first.
assert.deepEqual(arrange(["G"], ["A"], ["G"]), ["A", "G"]);
// A reopened pin keeps its slot though Herdr put it last.
assert.deepEqual(arrange(["A", "P", "B"], ["A", "B", "P"], [], new Set(["P"])), ["A", "P", "B"]);
// Unpinned spaces still follow Herdr around a held pin.
assert.deepEqual(arrange(["A", "P", "B"], ["B", "A", "P"], [], new Set(["P"])), ["B", "P", "A"]);
// Unknown keys (a machine still loading) stay in place.
assert.deepEqual(arrange(["A", "G", "B"], [], ["G"]), ["A", "G", "B"]);
// Dropped on a row: after it moving down, before it moving up.
assert.deepEqual(moved(["A", "B", "C"], "A", "C"), ["B", "C", "A"]);
assert.deepEqual(moved(["A", "B", "C"], "C", "A"), ["C", "A", "B"]);
console.log("order ok");
