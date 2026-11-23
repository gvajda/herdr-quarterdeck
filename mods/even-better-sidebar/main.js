// Better Sidebar: spaces, agents, both in one block (lists), a footer and a right
// panel toggle. A layout puts one copy per block, and `view` in its props picks which part.
import { View } from "gpui-kit";
import { props } from "herdr";
import { Spaces } from "./views/spaces.js";
import { Agents } from "./views/agents.js";
import { Lists } from "./views/lists.js";
import { Footer } from "./views/footer.js";
import { PanelToggle } from "./views/panel-toggle.js";
import { Help } from "./views/help.js";
import { Style } from "./views/style.js";

const PARTS = { lists: Lists, agents: Agents, footer: Footer, "panel-toggle": PanelToggle, help: Help, style: Style };

export default class BetterSidebar extends View {
  init(given, cx) {
    // Opened as an overlay (mod.open, or the footer's ?): the help.
    const Part = PARTS[props()?.view] ?? (props()?.overlay ? Help : Spaces);
    this.part = new Part();
    this.part.init(given, cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}
