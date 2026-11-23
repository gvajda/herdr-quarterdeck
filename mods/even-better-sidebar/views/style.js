// The style popup for one space (right-click its avatar): its colour (a swatch or any
// #hex) and what its avatar shows: its letter, an icon or an emoji, each picked from a
// searchable grid (emoji also by category; any emoji pasted into the search box can be
// used as it is). Every pick applies at once; Esc or a click outside closes it.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, shared, setShared, spaces, panes } from "herdr";
import { TEXT, IconButton } from "./ui.js";
import { placeOf, isPinned, pin, unpin } from "./places.js";
import { SWATCHES, SPACE_ICONS, ICON_GROUPS, fillOf, lookOf, colorOf, spaceAvatar } from "./avatar.js";

// The grid needs a definite height: in a popup a flex_1 scroll area lays out at zero.
const GRID_H = 268;
import { EMOJI } from "./emoji.js";

export class Style {
  init() {
    this.id = props()?.space;
    const color = colorOf(this.id);
    this.tab = props()?.tab ?? (lookOf(this.id)?.emoji ? "emoji" : "icon");
    this.cat = 0; // emoji category
    this.icat = 0; // icon category
    this.q = "";
    this.hex = InputState.new({ placeholder: "#rrggbb", value: color.startsWith("#") ? color : "" });
    this.hex.on("change", (_e, cx) => {
      const v = this.hex.value().trim();
      const h = v.startsWith("#") ? v : `#${v}`;
      if (/^#[0-9a-f]{6}$/i.test(h)) this.setColor(h.toLowerCase());
      cx.notify();
    });
    this.search = InputState.new({ placeholder: this.placeholder() });
    this.search.on("change", (_e, cx) => {
      this.q = this.search.value().trim();
      cx.notify();
    });
  }

  placeholder() {
    return this.tab === "icon" ? "Search icons" : "Search emoji, or paste one";
  }

  // Pinned spaces stay in the sidebar after they close, to reopen with a click.
  pinButton(w) {
    const place = placeOf(w, panes());
    const on = isPinned(place);
    return IconButton({
      id: "style-pin",
      icon: on ? "pin-off" : "pin",
      label: on ? "Unpin from sidebar" : "Pin to sidebar: stays after it closes",
      iconSize: 14,
      onClick: () => (on ? unpin(place, false, w.id) : pin(place, w.id)),
    });
  }

  setColor(c) {
    setShared("space.colors", { ...(shared("space.colors") ?? {}), [this.id]: c });
  }

  setLook(look) {
    const all = { ...(shared("space.icons") ?? {}) };
    if (look) all[this.id] = look;
    else delete all[this.id];
    setShared("space.icons", all);
  }

  // What the grid offers: icons by name; emoji by category, or by name when searching,
  // plus a pasted emoji the set doesn't have.
  choices() {
    const q = this.q.toLowerCase();
    if (this.tab === "icon") {
      if (!q) return ICON_GROUPS[this.icat].items.map((n) => ({ icon: n }));
      const words = q.split(/[\s-]+/).filter(Boolean);
      return SPACE_ICONS.filter((n) => words.every((w) => n.includes(w))).map((n) => ({ icon: n }));
    }
    if (!q) return EMOJI[this.cat].items.map(([e, name]) => ({ emoji: e, name }));
    // Each word typed starts a word of its name: "cat" is a cat, not "location".
    const words = q.split(/\s+/).filter(Boolean);
    const found = EMOJI.flatMap((c) => c.items).filter(([e, name]) =>
      e === this.q || words.every((w) => name.split(" ").some((n) => n.startsWith(w))));
    // ponytail: up to 8 code points holds any single emoji, ZWJ families included.
    const pasted = /[^\x00-\x7f]/.test(this.q) && !found.some(([e]) => e === this.q)
      ? [{ emoji: [...this.q].slice(0, 8).join(""), name: "pasted" }] : [];
    return [...pasted, ...found.map(([e, name]) => ({ emoji: e, name }))];
  }

  render() {
    const t = theme();
    const w = spaces().find((s) => s.id === this.id);
    if (!w) return div().p(12).text_size(TEXT.small).text_color(t.dim).child("That space is gone.");
    const color = colorOf(this.id);
    const look = lookOf(this.id);
    const label = (s) => div().pt(8).pb(4).text_size(TEXT.caption).text_color(t.dim).child(s);
    const field = (state) => Input.new(state).h(26).px(8).items_center().rounded(6).border(1).border_color(t.input)
      .bg(t.background).text_size(TEXT.small).text_color(t.foreground);
    const swatch = (c) => div().id(`sw-${c}`).size(22).flex_none().rounded(6).bg(fillOf(c, t)).cursor_pointer()
      .border(2).border_color(c === color ? t.foreground : fillOf(c, t))
      .on_click((_e, cx) => { this.setColor(c); this.hex.set_value(c.startsWith("#") ? c : ""); cx.notify(); });
    const cell = (id, on, child, onClick, tip) => div().id(id).size(28).flex_none().flex().items_center().justify_center()
      .rounded(6).cursor_pointer().when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover)).tooltip(tip)
      .on_click((_e, cx) => { onClick(); cx.notify(); }).child(child);
    const tab = (id, text) => div().id(`tab-${id}`).px(9).h(24).flex().items_center().rounded(6).cursor_pointer()
      .text_size(TEXT.small).text_color(this.tab === id ? t.foreground : t.dim)
      .when(this.tab === id, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        this.tab = id;
        this.q = "";
        this.search = InputState.new({ placeholder: this.placeholder() });
        this.search.on("change", (_e, cx) => { this.q = this.search.value().trim(); cx.notify(); });
        cx.notify();
      })
      .child(text);
    const letter = cell("look-letter", !look, div().text_size(TEXT.small).font_bold().text_color(t.foreground)
      .child([...w.name][0]?.toUpperCase() ?? "?"), () => this.setLook(null), "The space's first letter");
    const items = this.choices();
    const grid = items.map((c) => c.icon
      ? cell(`ic-${c.icon}`, look?.icon === c.icon, svg(`mods/even-better-sidebar/icons/space/${c.icon}.svg`).size(15)
          .text_color(t.foreground), () => this.setLook({ icon: c.icon }), c.icon)
      : cell(`em-${c.emoji}`, look?.emoji === c.emoji, div().text_size(16).child(c.emoji),
          () => this.setLook({ emoji: c.emoji }), c.name));
    return v_flex().size_full().p(12).bg(t.popover)
      .child(h_flex().gap(8).items_center()
        .child(spaceAvatar(w, t, 22))
        .child(div().min_w(0).flex_1().truncate().text_size(TEXT.body).font_semibold().text_color(t.foreground).child(w.name))
        .child(this.pinButton(w)))
      .child(label("Colour"))
      .child(h_flex().flex_wrap().gap(5).children(SWATCHES.map(swatch)))
      .child(h_flex().pt(6).gap(6).items_center()
        .child(div().text_size(TEXT.caption).text_color(t.dim).child("Hex"))
        .child(div().flex_1().child(field(this.hex))))
      .child(label("Shows"))
      .child(h_flex().gap(4).items_center().child(letter).child(tab("icon", "Icon")).child(tab("emoji", "Emoji")))
      .child(div().pt(6).child(field(this.search)))
      // Categories, while not searching: emoji by their own glyph, icons by one of theirs.
      .when(!this.q, (el) => el.child(h_flex().pt(6).gap(2).flex_wrap().children(this.tab === "emoji"
        ? EMOJI.map((c, i) => cell(`cat-${i}`, i === this.cat, div().text_size(14).child(c.icon), () => { this.cat = i; }, c.name))
        : ICON_GROUPS.map((g, i) => cell(`icat-${i}`, i === this.icat,
            svg(`mods/even-better-sidebar/icons/space/${g.icon}.svg`).size(14).text_color(i === this.icat ? t.foreground : t.dim),
            () => { this.icat = i; }, g.name)))))
      .when(!this.q, (el) => el.child(div().pt(4).text_size(TEXT.caption).text_color(t.dim)
        .child(this.tab === "emoji" ? EMOJI[this.cat].name : ICON_GROUPS[this.icat].name)))
      .child(v_flex().id("pick-grid").mt(4).h(GRID_H).flex_none().overflow_y_scrollbar()
        .child(items.length
          ? h_flex().flex_wrap().gap(2).children(grid)
          : div().p(8).text_size(TEXT.small).text_color(t.dim).child(this.tab === "icon" ? "No icon by that name." : "No emoji by that name. Paste one to use it.")));
  }
}
