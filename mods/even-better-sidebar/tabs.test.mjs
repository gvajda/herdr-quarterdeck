import assert from "node:assert/strict";
import { groupTabs, litFor } from "./tabs.js";

const a = (address, tab, pane = "p" + address) => ({ address, tab, pane });
const tabs = [{ id: "T1" }, { id: "T2" }, { id: "T3" }, { id: "T4" }];
const all = [a("x", "T1"), a("y", "T2"), a("z", "T2"), a("w", "T4")];

// Tab order kept, agentless tab (T3) dropped, agents grouped by tab.
const g = groupTabs(tabs, all, []);
assert.deepEqual(g.map((x) => [x.tab, x.agents.map((k) => k.address), x.pinned]), [["T1", ["x"], false], ["T2", ["y", "z"], false], ["T4", ["w"], false]]);
// One of two agents pinned: the whole tab goes first; the rest keep their order.
const p = groupTabs(tabs, all, ["z", "w"]);
assert.deepEqual(p.map((x) => [x.tab, x.agents.map((k) => k.address), x.pinned]), [["T2", ["y", "z"], true], ["T4", ["w"], true], ["T1", ["x"], false]]);

// Lit: agent pane focused in a 1-agent tab, then in a 2-agent tab (soft band).
assert.deepEqual(litFor({ tab: "T1", pane: "px" }, g), { tab: "T1", agent: "x", band: null });
assert.deepEqual(litFor({ tab: "T2", pane: "pz" }, g), { tab: "T2", agent: "z", band: "soft" });
// Another pane (a mod, a shell): the lone agent, or the whole band.
assert.deepEqual(litFor({ tab: "T1", pane: "files" }, g), { tab: "T1", agent: "x", band: null });
assert.deepEqual(litFor({ tab: "T2", pane: "files" }, g), { tab: "T2", agent: null, band: "full" });
// No focus, or a tab with no agent: nothing here (the space row lights).
assert.equal(litFor(null, g), null);
assert.equal(litFor({ tab: "T3", pane: "shell" }, g), null);
console.log("tabs ok");
