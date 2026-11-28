import assert from "node:assert/strict";
import { codeLike, indentStep, markRuns, rainbowRuns, runPaint } from "./views/rainbow.js";

const plain = (lines) => lines.map((text) => [{ text, kind: null }]);
const on = { brackets: true, indent: true };
const marks = (runs, key) => runs.filter((r) => r[key] !== undefined).map((r) => [r.text, r[key]]);

// Depth carries across lines; a bracket in a string doesn't count.
const lines = ["f(a, {", '  b: [")"],', "})"];
const runs = plain(lines);
runs[1] = [{ text: "  b: [", kind: null }, { text: '")"', kind: "string" }, { text: "],", kind: null }];
const out = rainbowRuns(runs, lines, { brackets: true, indent: false });
assert.deepEqual(out.flatMap((l) => marks(l, "depth")), [["(", 0], ["{", 1], ["[", 2], ["]", 2], ["}", 1], [")", 0]]);
assert.equal(out.flat().map((r) => r.text).join(""), lines.join(""));

// A wrong closer and an unclosed opener are errors.
const bad = rainbowRuns(plain(["(]", "["]), ["(]", "["], { brackets: true, indent: false });
assert.deepEqual(bad.flat().filter((r) => r.bad).map((r) => r.text), ["(", "]", "["]);
// A typo inside a block doesn't spread: the block's own braces still pair.
const typo = ["f() {", "  g(a];", "}"];
const fixed = rainbowRuns(plain(typo), typo, { brackets: true, indent: false }).flat();
assert.deepEqual(fixed.filter((r) => r.bad).map((r) => r.text), ["(", "]"]);
assert.deepEqual(fixed.filter((r) => r.text === "{" || r.text === "}").map((r) => r.depth), [0, 0]);

// Indent: the file's step, a tint per step, off-step marked, block-comment star exempt.
assert.equal(indentStep(["a", "  b", "    c", "  d"]), 2);
assert.equal(indentStep(["a", "    b", "        c"]), 4);
const src = ["a", "    b", "        c", "    d", "      e", "     * doc"];
const ind = rainbowRuns(plain(src), src, { brackets: false, indent: true });
assert.deepEqual(marks(ind[2], "indent"), [["    ", 0], ["    ", 1]]);
assert.deepEqual(marks(ind[4], "indent"), [["    ", 0], ["  ", -1]]);
assert.deepEqual(marks(ind[5], "indent"), [["    ", 0]]);

// markRuns cuts across run boundaries and keeps the text whole.
const cut = markRuns([{ text: "ab", kind: "x" }, { text: "cd", kind: null }], [{ start: 1, end: 3 }], () => "m");
assert.deepEqual(cut.map((r) => [r.text, r.mark ?? null]), [["a", null], ["b", "m"], ["c", "m"], ["d", null]]);

assert.equal(codeLike("js"), true);
assert.equal(codeLike("md"), false);
assert.equal(codeLike("txt"), false);
// Both on together keep the text intact.
assert.equal(rainbowRuns(plain(src), src, on).flat().map((r) => r.text).join(""), src.join(""));
// The indent tint follows the strength setting, clamped to 0-100.
const theme = { background: "#000000", ansi1: "#ff0000", ansi2: "#00ff00", ansi3: "#ffff00", ansi5: "#ff00ff", ansi6: "#00ffff", ansi11: "#ffff80", ansi12: "#8080ff", ansi13: "#ff80ff", ansi4: "#0000ff" };
assert.equal(runPaint({ text: "  ", indent: 0 }, theme, "#fff", false, 22).bg, "#ffff0038");
assert.equal(runPaint({ text: "  ", indent: 1 }, theme, "#fff", false, 150).bg, "#00ff00ff");
console.log("rainbow ok");
