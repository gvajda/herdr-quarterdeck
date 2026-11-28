// Rainbow brackets and rainbow indent, on the runs the syntax lexer made, for the views that
// draw their own rows (the line view and the preview's code blocks). syntax.js stays as it is:
// it's shared byte for byte with Better Changes.
//   brackets: (), [] and {} coloured by how deep they sit, the depth carried from line to line;
//             ones inside strings and comments don't count. One without a partner, or closing
//             the wrong kind, is marked as an error.
//   indent:   each step of a line's leading spaces gets a faint colour by its depth; a line
//             indented off the file's step is marked.
// No imports, so rainbow.test.mjs runs it in node.
// Pieces carry depths, not colours (`depth`, `indent`, `bad`), so a theme change needs no
// new pass; `runPaint` turns them into colours while drawing.

const OPEN = "([{";
const CLOSE = ")]}";
const SKIP = new Set(["string", "comment"]);
// Text that isn't code: brackets in prose and lists are punctuation, not nesting.
const PROSE = new Set(["md", "markdown", "mdx", "txt", "text", "plaintext", "log", "csv"]);
const WRONG = -1;

export const codeLike = (language) => Boolean(language) && !PROSE.has(language);

// The file's indent step: the most common change in indent between neighbouring lines, as
// editors detect it. Lines that hold only space are skipped.
export function indentStep(lines) {
  const counts = new Map();
  let prev = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const width = /^ */.exec(line)[0].length;
    const change = Math.abs(width - prev);
    if (change >= 2 && change <= 8) counts.set(change, (counts.get(change) ?? 0) + 1);
    prev = width;
  }
  let step = 4;
  let most = 0;
  for (const [change, n] of counts) if (n > most || (n === most && change < step)) [step, most] = [change, n];
  return step;
}

// Every line's runs, with brackets and indent steps cut out and marked. `lines` are the texts
// the runs spell out; `on` is the setting: {brackets, indent}.
export function rainbowRuns(lineRuns, lines, on) {
  let out = lineRuns;
  if (on.indent) {
    const step = indentStep(lines);
    out = out.map((runs, n) => {
      const line = lines[n] ?? "";
      if (!line.trim()) return runs;
      const width = /^ */.exec(line)[0].length;
      const steps = [];
      for (let at = 0; at + step <= width; at += step) steps.push({ start: at, end: at + step, value: steps.length });
      // Off the step, unless it's the space before a block comment's `*`.
      const rest = width % step;
      if (rest && line[width] !== "*") steps.push({ start: width - rest, end: width, value: WRONG });
      return markRuns(runs, steps, (s) => s.value, "indent");
    });
  }
  if (on.brackets) {
    const open = []; // {kind, piece}: brackets waiting for their partner.
    out = out.map((runs) =>
      runs.flatMap((run) => {
        if (SKIP.has(run.kind) || !/[()[\]{}]/.test(run.text)) return [run];
        const pieces = [];
        let from = 0;
        for (let i = 0; i < run.text.length; i++) {
          const opens = OPEN.indexOf(run.text[i]);
          const closes = CLOSE.indexOf(run.text[i]);
          if (opens < 0 && closes < 0) continue;
          if (i > from) pieces.push({ ...run, text: run.text.slice(from, i) });
          const piece = { ...run, text: run.text[i] };
          if (opens >= 0) {
            piece.depth = open.length;
            open.push({ kind: opens, piece });
          } else {
            // A closer whose opener sits deeper closes it, and the openers it skips are the
            // errors, so one typo doesn't turn the rest of the file red. One with no opener
            // anywhere is the error itself.
            const at = open.findLastIndex((o) => o.kind === closes);
            if (at < 0) piece.bad = true;
            else {
              for (const skipped of open.splice(at + 1)) {
                delete skipped.piece.depth;
                skipped.piece.bad = true;
              }
              piece.depth = open.pop().piece.depth;
            }
          }
          pieces.push(piece);
          from = i + 1;
        }
        if (from < run.text.length) pieces.push({ ...run, text: run.text.slice(from) });
        return pieces;
      }),
    );
    for (const { piece } of open) {
      delete piece.depth;
      piece.bad = true;
    }
  }
  return out;
}

// A line's coloured runs cut at the matches on it, each piece of a match carrying `prop`
// (`mark`: find's colour) set to `colorOf(hit)`.
export function markRuns(runs, hits, colorOf, prop = "mark") {
  if (!hits?.length) return runs;
  const out = [];
  let at = 0;
  for (const run of runs) {
    const end = at + run.text.length;
    let pos = at;
    for (const hit of hits) {
      const s = Math.max(hit.start, pos);
      const e = Math.min(hit.end, end);
      if (s >= e) continue;
      if (s > pos) out.push({ ...run, text: run.text.slice(pos - at, s - at) });
      out.push({ ...run, text: run.text.slice(s - at, e - at), [prop]: colorOf(hit) });
      pos = e;
    }
    if (pos < end) out.push({ ...run, text: run.text.slice(pos - at) });
    at = end;
  }
  return out;
}

const alpha = (percent) =>
  Math.round((Math.min(100, Math.max(0, Number(percent) || 0)) / 100) * 255).toString(16).padStart(2, "0");
const tint = (color, alpha) => `${color.slice(0, 7)}${alpha}`;

// A run's colours: `fg` for its text (a bracket's depth wins over its syntax colour, an
// error over both) and `bg` (find's mark, else an indent step's tint).
// `light`: the theme is a light one (file-icons.js isLight). `opacity`: the indent tint, 0-100.
export function runPaint(run, t, fg, light, opacity = 22) {
  const brackets = light ? [t.ansi5, t.ansi4, t.ansi2] : [t.ansi11, t.ansi13, t.ansi12];
  const steps = [t.ansi3, t.ansi2, t.ansi5, t.ansi6];
  const error = tint(t.ansi1, light ? "33" : "4D");
  if (run.bad) return { fg: t.ansi1, bg: run.mark ?? error };
  return {
    fg: run.depth === undefined ? fg : brackets[run.depth % brackets.length],
    bg:
      run.mark ??
      (run.indent === undefined ? null : run.indent === WRONG ? error : tint(steps[run.indent % steps.length], alpha(opacity))),
  };
}
