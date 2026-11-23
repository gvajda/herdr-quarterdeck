// Live Claude Code sessions on this machine, with every subagent and who started it.
// Run by the even-better-sidebar mod as `node -e <this file>`, locally or on a remote machine.
// Prints JSON: [{ pid, id, cwd, status, terminal, title, agents: [...] }].
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const HOME = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const CACHE = path.join(os.tmpdir(), `herdr-ebs-${process.getuid?.() ?? "u"}.json`);
const TAIL = 512 * 1024;
const now = Date.now();
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const cache = json(CACHE) ?? {};
const fresh = { subs: {} };

// The Herdr terminal a Claude process runs in: herdr-core puts HC_TERMINAL_ID in its env.
function terminalOf(pid) {
  try {
    if (process.platform === "linux") {
      const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      return env.find((l) => l.startsWith("HC_TERMINAL_ID="))?.slice(15) || null;
    }
    const out = cp.execFileSync("ps", ["-E", "-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return out.match(/(?:^|\s)HC_TERMINAL_ID=(\S+)/)?.[1] ?? null;
  } catch { return null; }
}

// Last match of a title entry in a chunk of transcript text.
function lastTitle(text) {
  let found = null;
  for (const m of text.matchAll(/"(customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"/g)) {
    if (m[1] === "customTitle" || !found?.custom) {
      try { found = { title: JSON.parse(`"${m[2]}"`), custom: m[1] === "customTitle" }; } catch {}
    }
  }
  return found;
}

// Claude appends its title entries every turn, so the tail usually has the latest.
// ponytail: a custom title set long ago and never repeated only shows once the tail
// holds it or the first full read (files under 64 MB) found it.
function titleOf(file, size, prev) {
  try {
    const fd = fs.openSync(file, "r");
    const len = Math.min(size, prev?.full ? TAIL : size < 64 * 2 ** 20 ? size : TAIL);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const t = lastTitle(buf.toString("utf8"));
    if (prev?.custom && !t?.custom) return prev;
    return t ? { ...t, full: true } : prev ?? { title: null, full: true };
  } catch { return prev ?? null; }
}

function transcript(id, prev) {
  if (prev && fs.existsSync(prev)) return prev;
  const dir = path.join(HOME, "projects");
  for (const p of fs.readdirSync(dir)) {
    const f = path.join(dir, p, `${id}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function tail(file, size, want) {
  const len = Math.min(size, want), buf = Buffer.alloc(len), fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
  return buf.toString("utf8");
}

// The last model call in a transcript tail: tokens in the context window after it (read
// fresh, cache written, cache read), its model, when it ran, and how long its prompt
// cache lives (1 h when it wrote to the 1-hour cache, else 5 min; a call that only read
// the cache keeps the lifetime it had). Zeroed usage entries (bookkeeping) don't count.
function lastTurn(text) {
  let out = null;
  for (const line of text.split("\n")) {
    if (!line.includes('"usage"') || !line.includes('"type":"assistant"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const u = e.message?.usage;
    const used = (u?.input_tokens || 0) + (u?.cache_creation_input_tokens || 0) + (u?.cache_read_input_tokens || 0);
    if (!used) continue;
    const cc = u.cache_creation || {};
    const ttl = (cc.ephemeral_1h_input_tokens || 0) > 0 ? 3600 : (cc.ephemeral_5m_input_tokens || 0) > 0 ? 300 : out?.ttl ?? 300;
    out = { ctx: used, model: e.message.model ?? out?.model ?? null, at: Date.parse(e.timestamp) || null, ttl };
  }
  return out;
}

// The latest main-thread API request in a tail: its effort and the model asked for
// (which names [1m] when the 1M window was requested).
function lastRequest(text) {
  let out = null;
  for (const line of text.split("\n")) {
    if (!line.includes('"type":"api-request"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "api-request" || (e.querySource && e.querySource !== "repl_main_thread")) continue;
    const p = e.params ?? {};
    const effort = p.output_config?.effort ?? p.effort?.effort;
    out = { effort: typeof effort === "string" ? effort : null, model: typeof p.model === "string" ? p.model : null };
  }
  return out;
}

// Time spent working: the sum of Claude's turn_duration entries, and when the current
// turn began (the last prompt: a user entry that isn't a tool result), read once and then
// only the bytes added since (kept in the cache). Whole lines only, in 8 MB slices; a
// file that got shorter was rewritten and is read anew.
function workTime(file, size, prev) {
  let { off, sum, turns, promptAt } = prev && prev.off <= size ? prev : { off: 0, sum: 0, turns: 0, promptAt: null };
  try {
    const fd = fs.openSync(file, "r");
    try {
      while (off < size) {
        const len = Math.min(size - off, 8 * 2 ** 20), buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, off);
        const end = buf.lastIndexOf(10);
        if (end < 0) break;
        for (const line of buf.toString("utf8", 0, end).split("\n")) {
          const d = line.includes('"turn_duration"') && /"subtype":"turn_duration","durationMs":(\d+)/.exec(line);
          if (d) { sum += Number(d[1]); turns++; continue; }
          if (!line.includes('"type":"user"') || line.includes('"tool_result"') || line.includes('"isMeta":true') || line.includes('"isSidechain":true')) continue;
          try { const e = JSON.parse(line); if (e.type === "user") promptAt = Date.parse(e.timestamp) || promptAt; } catch {}
        }
        off += end + 1;
      }
    } finally { fs.closeSync(fd); }
  } catch {}
  return { off, sum, turns, promptAt };
}

// What an agent is doing at the end of its transcript: "wait" when its last unanswered
// tool call is a wait (Poll in code mode, a foreground Agent/Task, TaskOutput) or its
// turn ended (background subagents wake it later); "busy" otherwise (a model call or
// another tool). The tail's first line may be cut, so it's skipped unless whole.
const WAITS = new Set(["Poll", "Agent", "Task", "TaskOutput"]);
function activity(text, whole) {
  const pending = new Map();
  let ended = false;
  for (const line of text.split("\n").slice(whole ? 0 : 1)) {
    if (!line.includes('"type":"assistant"') && !line.includes('"type":"user"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "assistant" && e.type !== "user") continue;
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
    if (e.type === "assistant") {
      const uses = blocks.filter((b) => b.type === "tool_use");
      for (const b of uses) pending.set(b.id, b.name);
      ended = !uses.length && e.message?.stop_reason === "end_turn";
    } else {
      for (const b of blocks) if (b.type === "tool_result") pending.delete(b.tool_use_id);
      if (!blocks.some((b) => b.type === "tool_result")) pending.clear(); // a new prompt
      ended = false;
    }
  }
  const last = [...pending.values()].pop();
  return ended || WAITS.has(last) ? "wait" : "busy";
}

// For one still unfinished, mtime lies when something touches the folder (a copy, a
// backup): its last written entry's timestamp says when it last did anything.
function lastStamp(text) {
  const all = [...text.matchAll(/"timestamp":"([^"]+)"/g)];
  return all.length ? Date.parse(all[all.length - 1][1]) || null : null;
}

function subagents(file) {
  const dir = path.join(file.slice(0, -".jsonl".length), "subagents");
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".meta.json")); } catch { return []; }
  return names.map((n) => {
    const id = n.slice("agent-".length, -".meta.json".length);
    const meta = json(path.join(dir, n)) ?? {};
    const f = path.join(dir, `agent-${id}.jsonl`);
    let st = null;
    try { st = fs.statSync(f); } catch {}
    // ponytail: a 256 KB tail; a last turn buried under a bigger tool result shows no ctx.
    const seen = cache.subs?.[f];
    let info = seen && st && seen.size === st.size ? seen : null;
    if (!info && st) {
      let text = "";
      try { text = tail(f, st.size, 256 * 1024); } catch {}
      const turn = lastTurn(text);
      info = { size: st.size, ctx: turn?.ctx ?? null, model: turn?.model ?? null, stamp: lastStamp(text), act: activity(text, st.size <= 256 * 1024) };
    }
    if (info) fresh.subs[f] = info;
    // Its last entry's own timestamp, not mtime: a copy or backup touches every file.
    const last = info?.stamp ?? st?.mtimeMs ?? 0;
    return {
      id, parent: meta.parentAgentId ?? null, depth: meta.spawnDepth ?? 1,
      desc: meta.description ?? "", type: meta.agentType ?? "agent", model: meta.model ?? null,
      done: meta.finished === true, ctx: info?.ctx ?? null, act: info?.act ?? "busy", llm: info?.model ?? null,
      start: Math.round(st?.birthtimeMs || st?.ctimeMs || 0), last: Math.round(last),
    };
  });
}

const out = [];
let files = [];
try { files = fs.readdirSync(path.join(HOME, "sessions")).filter((n) => /^\d+\.json$/.test(n)); } catch {}
for (const n of files) {
  const s = json(path.join(HOME, "sessions", n));
  if (!s?.pid || !s.sessionId) continue;
  try { process.kill(s.pid, 0); } catch (e) { if (e.code !== "EPERM") continue; }
  const key = `${s.pid}:${s.sessionId}`;
  // Entries from an older scan.cjs lack fields: read such a session anew.
  const c = cache[key]?.v === 3 ? cache[key] : {};
  const terminal = "terminal" in c ? c.terminal : terminalOf(s.pid);
  const file = transcript(s.sessionId, c.file);
  let size = 0;
  try { size = file ? fs.statSync(file).size : 0; } catch {}
  const grew = file && size !== c.size;
  const t = grew ? titleOf(file, size, c.t) : c.t;
  let turn = c.turn ?? null, act = c.act ?? "busy", req = c.req ?? null, work = c.work ?? null;
  if (grew) {
    try {
      const text = tail(file, size, 256 * 1024);
      turn = lastTurn(text) ?? turn;
      act = activity(text, size <= 256 * 1024);
      req = lastRequest(text) ?? req;
      work = workTime(file, size, c.work);
    } catch {}
  }
  fresh[key] = { v: 3, terminal, file, size, t, turn, act, req, work };
  out.push({
    pid: s.pid, id: s.sessionId, cwd: s.cwd, status: s.status ?? null, terminal,
    title: t?.title || s.name || null, started: s.startedAt ?? null, act, ctx: turn?.ctx ?? null, model: turn?.model ?? null,
    lastReply: turn?.at ?? null, cacheTtl: turn?.ttl ?? null,
    effort: req?.effort ?? null, reqModel: req?.model ?? null, promptAt: work?.promptAt ?? null,
    worked: work?.sum ?? 0, turns: work?.turns ?? 0,
    agents: file ? subagents(file) : [],
  });
}
try { fs.writeFileSync(CACHE, JSON.stringify(fresh)); } catch {}
process.stdout.write(JSON.stringify({ now, sessions: out }));
