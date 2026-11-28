// Cmd-F in a viewer: a find bar over the file. It searches what the view shows (the preview's
// Markdown pieces, the file's lines, or the editor's text), marks every match and steps
// through them with Enter / Shift-Enter. Esc closes it.
import { div } from "gpui-kit";
import { h_flex, InputState } from "gpui-base";
import { focused, nextCommand, panes, theme } from "herdr";
import { IconButton, TEXT, TextField } from "./ui.js";
const MAX_MATCHES = 2000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every [start, end) of `query` in `text` that ends by `limit`, ignoring case. UTF-16
// offsets, what TextView's highlight_range and the editor's selection take.
// ponytail: searches the Markdown source, so a phrase split by markup (**bold** text) isn't found.
export function findIn(text, query, limit = text.length) {
  const out = [];
  const re = new RegExp(escapeRe(query), "giu");
  for (let m; out.length < MAX_MATCHES && (m = re.exec(text)) && m.index + m[0].length <= limit; )
    out.push([m.index, m.index + m[0].length]);
  return out;
}

export const findMethods = {
  initFind(cx) {
    this.findFocus = cx.focus_handle();
    this.findAt = 0;
    this.findState = InputState.new({ placeholder: "Find in file" });
    this.findState.on("change", (_e, cx) => {
      this.findAt = 0;
      this.revealFind(cx);
    });
    this.findState.on("submit", (_e, cx) => {
      // Shift-Enter steps back in on_key_down; its submit mustn't step forward again.
      if (this.findBack) this.findBack = false;
      else this.findStep(1, cx);
    });
    this.findState.on("focus", () => (this.findTyping = true));
    this.findState.on("blur", () => (this.findTyping = false));
    cx.spawn(async (cx) => {
      for (;;) if ((await nextCommand()) === "find" && this.hasKeyboard()) this.openFind(cx);
    });
  },

  // Which copy the key meant: the one holding the keyboard (the viewer, its find box or editor),
  // else the focused pane when it's the only viewer in its tab (a pane focused by a key or a
  // command leaves the viewer's own handle unfocused, and panes() can't tell two viewers apart).
  hasKeyboard() {
    if (this.findFocus?.is_focused() || this.findTyping || this.editFocused || this.codeFocused) return true;
    const pane = panes().find((p) => p.pane === focused()?.pane);
    const tab = this.viewerEntry()?.tab;
    return Boolean(
      pane?.mod === "better-files" && tab && pane.tab === tab &&
        panes().filter((p) => p.mod === "better-files" && p.tab === tab).length === 1,
    );
  },

  openFind(cx) {
    const input = this.findState;
    this.finding = true;
    input.focus();
    input.set_selected_range({ start: 0, end: input.value().length });
    this.revealFind(cx);
  },

  closeFind(cx) {
    this.finding = false;
    this.findFocus.focus();
    cx.notify();
  },

  // What's on screen to search: the preview, the line view, or an editor's text.
  findMode() {
    if (this.editing && this.edit) return "edit";
    if (this.showsPreview()) return "preview";
    return this.gutterOn ? "lines" : "code";
  },

  // The matches, worked out once per query, view and text. Each knows where it is drawn
  // (`at`) and its place in the list; `byAt` groups them per drawn piece.
  findMatches() {
    const query = this.finding ? this.findState.value() : "";
    const mode = query ? this.findMode() : "none";
    const source = mode === "edit" ? this.edit.value() : this.text;
    const key = `${mode}\0${query}\0${this.file?.path}`;
    if (this.found?.key === key && this.found.source === source) return this.found;
    const list = [];
    const add = (at, ranges) => {
      for (const [start, end] of ranges) if (list.length < MAX_MATCHES) list.push({ at, start, end, index: list.length });
    };
    if (mode === "preview")
      this.previewBlocks().forEach((block, i) => {
        if (block.type === "text") add(`b${i}`, findIn(block.text, query, block.end));
        else if (block.type === "tasks") block.items.forEach((item) => add(`b${i}t${item.line}`, findIn(item.text, query, item.end)));
        else if (block.type === "code") block.text.split("\n").forEach((line, l) => add(`b${i}l${l}`, findIn(line, query)));
      });
    else if (mode === "lines") this.fileLines().forEach((line, n) => add(`l${n + 1}`, findIn(line, query)));
    else if (mode === "code" || mode === "edit") add("text", findIn(source ?? "", query));
    const byAt = new Map();
    for (const hit of list) byAt.set(hit.at, [...(byAt.get(hit.at) ?? []), hit]);
    this.found = { key, source, list, byAt, mode };
    if (this.findAt >= list.length) this.findAt = 0;
    return this.found;
  },

  findHits(at) {
    return this.finding ? this.findMatches().byAt.get(at) : undefined;
  },

  findColor(hit) {
    const t = theme();
    return `${t.ansi3.slice(0, 7)}${hit.index === this.findAt ? "B3" : "4D"}`;
  },

  findStep(by, cx) {
    const { list } = this.findMatches();
    if (!list.length) return;
    this.findAt = (this.findAt + by + list.length) % list.length;
    this.revealFind(cx);
  },

  // Scrolls the current match into view.
  revealFind(cx) {
    const { list, mode } = this.findMatches();
    const hit = list[this.findAt];
    if (hit && mode === "preview") this.previewScroll.scroll_to_item(Number(/^b(\d+)/.exec(hit.at)[1]));
    else if (hit && mode === "lines") {
      const number = Number(hit.at.slice(1));
      const row = (this.rowsShown ?? []).findIndex((r) => r.number === number && r.type !== "old" && r.type !== "removed");
      if (row >= 0) this.linesScroll.scroll_to_item(row, "center");
    } else if (hit) (mode === "edit" ? this.edit : this.code)?.set_selected_range({ start: hit.start, end: hit.end });
    cx.notify();
  },

  findBar() {
    const t = theme();
    const { list } = this.findMatches();
    const query = this.findState.value();
    const count = !query ? "" : list.length ? `${this.findAt + 1} of ${list.length}${list.length >= MAX_MATCHES ? "+" : ""}` : "No matches";
    return h_flex()
      .id("viewer-find")
      .flex_none()
      .px(10)
      .py(6)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .on_key_down((event, cx) => {
        if (event.keystroke === "escape") this.closeFind(cx);
        else if (event.keystroke === "shift-enter") {
          this.findBack = true;
          this.findStep(-1, cx);
        } else return;
        cx.stop_propagation();
      })
      .child(TextField({ id: "viewer-find-input", state: this.findState }))
      .child(div().flex_none().min_w(64).text_right().text_size(TEXT.small).text_color(list.length || !query ? t.dim : t.blocked).child(count))
      .child(IconButton({ id: "viewer-find-prev", icon: "chevron-up", label: "Previous match (Shift-Enter)", small: true, disabled: !list.length, onClick: (cx) => this.findStep(-1, cx) }))
      .child(IconButton({ id: "viewer-find-next", icon: "chevron-down", label: "Next match (Enter)", small: true, disabled: !list.length, onClick: (cx) => this.findStep(1, cx) }))
      .child(IconButton({ id: "viewer-find-close", icon: "close", label: "Close (Esc)", small: true, onClick: (cx) => this.closeFind(cx) }));
  },
};
