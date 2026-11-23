// What every mark in the sidebar means, drawn with the same pieces the rows use.
// Opened from the footer's ? as a dialog; Esc or Close shuts it.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay } from "herdr";
import { TEXT, Icon } from "./ui.js";
import { stateCircle, percentChip, ORANGE } from "./claude.js";

export class Help {
  init() {}

  render() {
    const t = theme();
    const row = (mark, label, about) =>
      h_flex().gap(10).items_start().py(3)
        .child(h_flex().w(74).flex_none().gap(4).items_center().justify_end().h(16).child(mark))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(TEXT.small).text_color(t.foreground).child(label))
          .when(Boolean(about), (el) => el.child(div().text_size(TEXT.caption).text_color(t.dim).child(about))));
    const section = (title, rows) =>
      v_flex().gap(1).pt(10)
        .child(div().pb(4).text_size(TEXT.label).font_medium().text_color(t.muted).child(title))
        .children(rows);
    const text = (s, color = t.dim) => div().text_size(TEXT.caption).text_color(color).child(s);
    const iconText = (name, s, color = t.dim) => h_flex().gap(3).items_center().text_color(color)
      .child(Icon(name, 11)).when(Boolean(s), (el) => el.child(text(s, color)));
    const badge = div().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(TEXT.avatar).font_semibold()
      .text_color(t.blocked).flex().items_center().child("Needs you");
    return v_flex().size_full().bg(t.popover).p(16).gap(2)
      .child(h_flex().justify_between().items_center()
        .child(div().text_size(TEXT.body).font_semibold().text_color(t.foreground).child("What the sidebar shows"))
        .child(div().id("help-close").px(8).h(22).flex().items_center().rounded(6).text_size(TEXT.small)
          .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => closeOverlay(props()?.overlay)).child("Close")))
      .child(v_flex().id("help-body").flex_1().min_h(0).overflow_y_scrollbar()
        .child(section("Agent status (right of each agent; small under a subagent)", [
          row(stateCircle(t, "working"), "Working", "A pulsing green dot: a model call or a tool is running."),
          row(stateCircle(t, "waiting"), "Waiting for its subagents", "A still green ring: it only waits while subagents under it work."),
          row(badge, "Needs you", "It asks for an answer or a permission."),
          row(stateCircle(t, "done"), "Done", "Finished while you weren't looking; turns idle once you look."),
          row(stateCircle(t, "idle"), "Idle", "Nothing running."),
          row(h_flex().gap(4).child(stateCircle(t, "idle")).child(text("⇄")).child(stateCircle(t, "done")), "Mark unread, or read",
            "On the active agent, hover its circle to preview and click to flip. Opening it again reads it."),
          row(stateCircle(t, "finished", 6), "Subagent finished", "Quiet, not news: its parent reports the result."),
          row(stateCircle(t, "quiet", 6), "Subagent quiet", "Not finished, but nothing written for 5 minutes (a long command, or it died)."),
        ]))
        .child(section("A Claude agent's first line, before its status", [
          row(iconText("hourglass-full", "12m", ORANGE), "Prompt cache warm", "Time since the last reply. The next turn reads the context from cache, cheaply."),
          row(iconText("hourglass-low", "55m", t.ansi1), "Cache about to go cold", "Its last 10 of 60 minutes (a 5-minute cache scales the same)."),
          row(iconText("hourglass-empty", "1h20m", t.ansi4), "Prompt cache cold", "The next turn re-reads the whole context at full price. Hover any glass for the last reply's date."),
          row(text("8s"), "Working: just the time", "While it works the cache keeps being refreshed, so no mark."),
        ]))
        .child(section("A Claude agent's second line", [
          row(Icon("chevron-down", 11).text_color(t.dim), "Fold its subagents", "Under the agent's icon, only when it has subagents; folded, it's a boxed button."),
          row(text("Opus 5.5 high"), "Model and effort", "The model asked for, and the effort level when Claude records it."),
          row(h_flex().gap(3).child(text("Ctx:")).child(percentChip(t, 30, TEXT.caption)).child(percentChip(t, 60, TEXT.caption)).child(percentChip(t, 85, TEXT.caption)),
            "Context used", "Share of the model's window (1M for Claude 5, 200k before): green, yellow from 50%, red from 80%. Hover for the tokens."),
          row(iconText("bot", "2/17"), "Subagents", "Running (working or waiting) of all it started."),
          row(iconText("timer", "1h20m"), "Time spent working", "All its turns added up, the current one included."),
        ]))
        .child(section("Subagent rows", [
          row(text("9%  12m"), "Context and run time", "Context used, then how long it has run (or ran, once finished)."),
          row(iconText("chevron-down", "3 done"), "Finished subagents", "With 2 or more finished under one parent, they fold behind this row."),
          row(text("1 quiet"), "Quiet ones", "Counted beside them when they never finished."),
        ]))
        .child(section("Buttons", [
          row(Icon("eye", 14).text_color(t.dim), "Show or hide subagents", "For every agent; remembered."),
          row(Icon("chevron-down", 14).text_color(t.dim), "Collapse finished subagents", "Folds every \"N done\" group, and hides lone finished ones."),
          row(text("21m"), "Other agents", "Agents that aren't Claude show the time in their current state."),
          row(div().size(16).rounded(4).bg("#e3814f"), "Space colour and icon", "Right-click a space's avatar: pick its colour, and its letter, an icon or an emoji (searchable; paste any emoji)."),
        ])));
  }
}
