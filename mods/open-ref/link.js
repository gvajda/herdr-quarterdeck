// A Cmd-click (Ctrl-click) on a file path in a terminal opens it in Better Files' viewer, the
// way cmd-o does, on whichever machine that terminal runs. A path that isn't a file there (a
// folder, a typo) passes to Herdr's usual opener.
import { exec, setShared } from "herdr";
import { FIND, candidates } from "./paths.js";

export async function handleLink({ link, source }) {
  if (link.kind !== "file") return "pass";
  const machine = source.machine ?? null;
  // link.path is set only for a local path Herdr resolved; otherwise the text as written.
  const paths = link.path ? [link.path] : candidates(link.raw, source.cwd);
  if (!paths.length) return "pass";
  const found = await exec("sh", ["-c", FIND, "find", ...paths], { on: machine }).catch(() => null);
  const [path, root] = found?.code === 0 ? found.stdout.trim().split("\n") : [];
  if (!path) return "pass";
  setShared("better-files.open-request", { file: { path, root: root || path, on: machine }, at: Date.now() });
  return "handled";
}
