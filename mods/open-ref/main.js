// Open ref: the path in the clipboard (a terminal selection is copied on release) opens in
// Better Files' viewer beside the terminal. Bound to a key as mod.open:open-ref; it opens as a
// tiny popup, does its one job and closes. Better Files' sidebar does the opening, so its
// split/tab setting and its reuse of a viewer already in the tab apply.
import { View, div } from "gpui-kit";
import { checking, closeOverlay, exec, focused, notify, props, setShared, spaces } from "herdr";
import { FIND, candidates } from "./paths.js";

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
      // Launched from the app, pbpaste has no locale and turns every non-ASCII character into "?".
      const clip = (await exec("sh", ["-c", "LC_ALL=en_US.UTF-8 pbpaste"], {}).catch(() => null))?.stdout ?? "";
      const paths = candidates(clip.slice(0, 4000), cwd);
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
