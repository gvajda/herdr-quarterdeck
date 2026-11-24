// Finding the file a bit of terminal text names, on the machine that text came from. Shared by
// main.js (cmd-o: the clipboard) and link.js (a Cmd-click on a path).

// $@: candidate paths. Prints the first that is a file, then its Git root (else its folder).
// A leading ~/ is that machine's home, so it's expanded here, where the check runs.
export const FIND = `for p; do case $p in "~/"*) p="$HOME/\${p#??}";; esac; [ -f "$p" ] || continue; d=$(dirname -- "$p"); printf '%s\\n' "$p"; git -C "$d" rev-parse --show-toplevel 2>/dev/null || printf '%s\\n' "$d"; exit 0; done; exit 1`;

// What in the text could be a path: the whole of it (names with spaces), then each word,
// without quotes, brackets, a file:// prefix or a trailing :line:col / #L12. Relative ones are
// taken from `cwd`; ~/ is left for FIND.
export function candidates(text, cwd) {
  const clean = (s) =>
    s
      .trim()
      .replace(/^file:\/\/[^/]*/, "")
      .replace(/^[\s"'`(<[]+|[\s"'`)>\],;.]+$/g, "")
      .replace(/#L\d+(-L?\d+)?$/, "")
      .replace(/(:\d+(-\d+)?){1,2}$/, "");
  const words = [text, ...text.split(/[\s"'`()<>[\]]+/)].map(clean).filter((w) => w && /[/.]/.test(w) && !w.includes("://"));
  const full = (p) => (p.startsWith("~/") || p.startsWith("/") ? p : cwd ? `${cwd}/${p}` : null);
  return [...new Set(words.map(full).filter(Boolean))].map((p) => p.replace(/\/\.\//g, "/"));
}
