import assert from "node:assert/strict";
import { summary, timePct, days } from "./pace.js";
const now = Date.parse("2026-11-23T22:00:00Z");
const claude = { id: "claude", windows: [
  { id: "seven_day", kind: "weekly", label: "week", percentUsed: 31, reservePct: 31.13 },
  { id: "model:fable", kind: "model", label: "Fable week", percentUsed: 15, reservePct: 47.13 },
] };
const s = summary([claude], now);
assert.deepEqual([s.text, s.letter, s.over, s.label, s.days], ["31%", "W", false, "wk", 7]);
claude.windows[1].reservePct = -5; // fable over pace wins
const f = summary([claude], now);
assert.deepEqual([f.text, f.letter, f.over, f.label], ["5%", "F", true, "Fable"]);
// no reserve: from resetsAt, 3.5 of 7 days gone
assert.equal(Math.round(timePct({ kind: "weekly", percentUsed: 10, resetsAt: "2026-11-27T10:00:00Z" }, now)), 50);
assert.equal(days({ kind: "session" }), 1);
assert.equal(summary([{ id: "codex", windows: [] }], now), null);
console.log("pace ok");
