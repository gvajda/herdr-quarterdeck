// A space's avatar: its colour, and its letter, an emoji or an icon. Both are picked
// in the style popup (right-click the avatar) and kept per space in shared state:
// "space.colors" (a palette name or #hex, as Better Sidebar always kept them) and
// "space.icons" ({ emoji } or { icon }; none means the letter).
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared } from "herdr";
import { TEXT } from "./ui.js";

export const AVATAR_COLORS = {
  ansi6: "#22a99a",
  ansi3: "#e3814f",
  ansi4: "#5b8def",
  ansi5: "#8b7cf6",
  ansi2: "#3fae6a",
  ansi1: "#d9649a",
};

// The six automatic colours first, then more to pick from.
export const SWATCHES = [
  "ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1",
  "#e5484d", "#f5a524", "#30a46c", "#0ea5e9", "#6e56cf", "#d6409f", "#a18072", "#8b8d98",
];

// Lucide icons in icons/space/ (ISC License), by category; the picker also searches by name.
export const ICON_GROUPS = [ { "name": "Dev", "icon": "code", "items": [ "code", "code-xml", "terminal", "square-terminal", "server", "database", "cloud", "globe", "cpu", "hard-drive", "monitor", "laptop", "smartphone", "tablet", "keyboard", "mouse", "wifi", "router", "git-branch", "git-merge", "git-pull-request", "container", "box", "boxes", "package", "puzzle", "blocks", "bot", "brain", "braces", "binary", "bug", "network", "workflow", "layers", "plug", "settings", "cog", "wrench", "hammer" ] }, { "name": "Science", "icon": "flask-conical", "items": [ "flask-conical", "test-tube", "microscope", "atom", "dna", "zap", "battery", "rocket", "satellite", "radar", "lightbulb", "sparkles", "wand-sparkles", "gem", "infinity" ] }, { "name": "Data & time", "icon": "chart-line", "items": [ "layout-dashboard", "chart-line", "chart-bar", "chart-pie", "trending-up", "activity", "gauge", "timer", "clock", "calendar", "alarm-clock", "calculator", "kanban", "list-todo", "clipboard-list" ] }, { "name": "Work & docs", "icon": "briefcase", "items": [ "briefcase", "building", "landmark", "store", "shopping-cart", "credit-card", "wallet", "dollar-sign", "euro", "banknote", "receipt", "file", "file-text", "folder", "archive", "book", "book-open", "notebook", "notebook-pen", "library", "graduation-cap", "sticky-note", "bookmark", "tag", "pen", "pencil", "scale", "gavel", "newspaper", "megaphone", "mail", "message-circle", "phone", "bell", "at-sign", "hash" ] }, { "name": "Media & fun", "icon": "palette", "items": [ "brush", "palette", "image", "camera", "film", "video", "headphones", "mic", "radio", "tv", "gamepad-2", "dice-5", "trophy", "medal", "award", "target", "flag", "gift", "crown", "ghost", "skull" ] }, { "name": "Places", "icon": "map-pin", "items": [ "map", "map-pin", "compass", "navigation", "plane", "car", "bike", "train-front", "ship", "truck", "anchor", "house", "hotel", "tent", "mountain", "life-buoy" ] }, { "name": "Nature", "icon": "leaf", "items": [ "trees", "tree-pine", "leaf", "sprout", "flower", "sun", "moon", "star", "cloud-rain", "snowflake", "flame", "droplet", "umbrella", "recycle" ] }, { "name": "Food & health", "icon": "coffee", "items": [ "coffee", "pizza", "apple", "cake", "beer", "wine", "heart", "heart-pulse", "stethoscope", "pill", "hospital", "hand-heart" ] }, { "name": "People & safety", "icon": "users", "items": [ "users", "user", "baby", "handshake", "glasses", "eye", "shield", "shield-check", "lock", "key", "dog", "cat", "bird", "fish", "rabbit", "paw-print" ] } ];
export const SPACE_ICONS = ICON_GROUPS.flatMap((g) => g.items);

export const fillOf = (color, t) => (color.startsWith("#") ? color : (AVATAR_COLORS[color] ?? t[color]));
export const lookOf = (id) => (shared("space.icons") ?? {})[id] ?? null;
export const colorOf = (id) => (shared("space.colors") ?? {})[id] ?? "ansi6";

// `style`: a closed place's own colour and look, its space id being gone.
export function spaceAvatar(w, t, size = 18, style = { color: colorOf(w.id), look: lookOf(w.id) }) {
  const look = style.look;
  const box = h_flex().size(size).flex_none().rounded(size * 0.28).bg(fillOf(style.color ?? "ansi6", t))
    .items_center().justify_center().overflow_hidden();
  if (look?.icon) return box.child(svg(`mods/even-better-sidebar/icons/space/${look.icon}.svg`).size(size * 0.66).text_color("#ffffff"));
  if (look?.emoji) return box.text_size(size * 0.62).child(look.emoji);
  return box.text_size(size === 18 ? TEXT.avatar : size * 0.58).font_bold().text_color("#ffffff")
    .child([...w.name][0]?.toUpperCase() ?? "?");
}
