// Open ref: the path in the clipboard (a terminal selection is copied on release) opens in
// Better Files' viewer beside the terminal. Bound to a key as mod.open:open-ref; it opens as a
// tiny popup, does its one job and closes. Better Files' sidebar does the opening, so its
// split/tab setting and its reuse of a viewer already in the tab apply.
import { View, div } from "gpui-kit";
import { checking, closeOverlay, exec, focused, home, notify, props, setShared, spaces } from "herdr";

// $@: candidate paths. Prints the first that is a file, then its Git root (else its folder).
const FIND = `for p; do [ -f "$p" ] || continue; d=$(dirname -- "$p"); printf '%s\\n' "$p"; git -C "$d" rev-parse --show-toplevel 2>/dev/null || printf '%s\\n' "$d"; exit 0; done; exit 1`;

// What in the text could be a path: the whole of it (names with spaces), then each word,
// without quotes, brackets, a file:// prefix or a trailing :line:col.
export function candidates(text, cwd, homeDir) {
  const clean = (s) =>
    s.trim().replace(/^file:\/\//, "").replace(/^[\s"'`(<[]+|[\s"'`)>\],;.]+$/g, "").replace(/(:\d+){1,2}$/, "");
  const words = [text, ...text.split(/[\s"'`()<>[\]]+/)].map(clean).filter((w) => w && /[/.]/.test(w) && !w.includes("://"));
  const full = (p) => (p.startsWith("~/") ? homeDir + p.slice(1) : p.startsWith("/") ? p : cwd ? `${cwd}/${p}` : null);
  return [...new Set(words.map(full).filter(Boolean))].map((p) => p.replace(/\/\.\//g, "/"));
}

export default class OpenRef extends View {
  init() {
    if (checking()) return;
    const overlay = props()?.overlay;
    const where = focused();
    const machine = spaces().find((s) => s.id === where?.space)?.machine ?? null;
    this.run(overlay, where?.cwd ?? null, machine);
  }

  async run(overlay, cwd, machine) {
    try {
      const clip = (await exec("pbpaste", [], {}).catch(() => null))?.stdout ?? "";
      const paths = candidates(clip.slice(0, 4000), cwd, machine ? "~" : home());
      const found = paths.length ? await exec("sh", ["-c", FIND, "find", ...paths], { on: machine }).catch(() => null) : null;
      const [path, root] = found?.code === 0 ? found.stdout.trim().split("\n") : [];
      if (path) setShared("better-files.open-request", { file: { path, root: root || path, on: machine }, at: Date.now() });
      else notify({ title: "No file in the selection", body: clip.trim().slice(0, 120) || "The clipboard is empty.", level: "warning" });
    } finally {
      if (overlay) closeOverlay(overlay);
    }
  }

  render() {
    return div();
  }
}
