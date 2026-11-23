# Main Graph

A Herdr layout for directing coding agents on several machines. On the left, a sidebar of spaces
grouped by machine, each machine header carrying Claude's weekly pace as a small bar; on top, a
tab bar with panel buttons; in the middle, the shown tab's panes as rounded cards; a hidden right
panel for files, changes, a git graph and notes; along the bottom, the status bar and one
machine's CPU and RAM. Desktop notifications say when an agent needs you.

<!-- ![Main Graph](preview.png) -->

## What you see

- **Window:** no system title bar (`titlebar: none`, macOS traffic lights at 12,16), `canvas` background.
- **Sidebar** (268 px, 44–480, `chrome`): Herdr's `workspace-chrome` brand block (46 px), then
  `even-better-sidebar` (`view: lists`) and its footer (`view: footer`, 37 px).
  - **Machine headers** ("This computer", then each machine): name, then, centred in the space
    between the longest machine name and the controls, Claude's icon (12 px, `#d97757`), the limit
    label (`wk`, or the model's name such as `Fable` when that limit is further along), a 34×4 px
    bar in 7 day pieces with 1 px gaps, and the pace difference (`31%`), then `+`, a status dot
    and the fold chevron. Every header's name column is as wide as the longest name, so the
    widgets line up at any width.
  - **Bar:** used share solid, the stretch up to where pace would be at 50% opacity; green
    (`#30d158` dark / `#28a745` light) under pace, orange (`#ff9f0a` / `#e68600`) over. The
    percentage is the same color at 50% opacity.
- **Tab bar** (42 px, `tabs-graph`): Herdr's tab pills with `+`, then Files, Changes, Git and Notes buttons.
- **Work area** (padding 8, gap 8): the active tab's panes as cards (radius 10, 1 px `border`,
  `accent` when focused, gap 8, framed even when alone) with Herdr's `pane` header (30 px, top).
  The right panel (368 px, 280–900, hidden until a panel button) stacks `better-files`,
  `changes`, `git-graph` and `ray-notes`.
- **Status bar** (28 px): `workspace-status` (weight 1) and `system-load` (weight 2.4, min 120):
  a machine name in `accent` when remote, CPU, RAM and GPU with 12-sample graphs.

## How it behaves

- **Pace:** of Claude's weekly limits (weekly, and per-model weeks such as Fable or Sonnet) the
  header shows the one most over pace, or least under. Pace is how much of the window has passed;
  quota-axi's `pace.reservePercentPoints` gives it (time = used + reserve), else
  `resetsAt` and a 7-day window. Hover: "Claude weekly: 31% used, 31% under pace". Click: the
  quota popup for that machine (reset times, every limit as a ClaudeUsageBar-style bar with
  "N% used" and "N% under/over pace", options).
- **Quota refresh:** every 2 minutes for each connected machine; a machine without quota-axi
  shows no widget.
- **Agent status:** the sidebar shows working, blocked ("Needs you"), done and idle per agent as
  Even Better Sidebar does. `better-alerts` posts a desktop notification when an agent turns
  blocked, or done while you aren't looking at its tab; clicking it focuses that agent.
- **Keys:** `cmd-g` toggles the Git panel (`layout:main-graph` section, `tabs-graph.graph`).
- **Load bar:** follows the selected space's machine, or a pinned one (`mods/system-load/local.json`).

## Built from

- Layout `layouts/main-graph.json`: root row → `sidebar` column (`brand`, `sidebar-lists` →
  `spaces`, `sidebar-footer`) and `work` column (`tabs`, `work-body` row → `main` tab block and
  `panel` column → `panel-body` stack of `files`, `changes`, `graph`, `notes`; `status` row →
  `status-main`, `status-system`). Root `floating`: `better-alerts` and `quota` (`quota-pace`
  with `props.headless: true`), both drawing nothing.
- `quota-pace` publishes shared `quota.pace:<JSON machine>` = `{ text, letter, over, used, time,
  days, label, resetsAt }` (`pace.js`, tested by `node mods/quota-pace/pace.test.mjs`) and keeps
  `quota.data:<machine>` for its popup. `even-better-sidebar/views/spaces.js` `paceLabel()` draws
  the header widget and opens `openOverlay({ mod: "quota-pace", kind: "popup", props: { menu: true, machine } })`.
- Herdr API: `machines`, `spaces`, `exec(…, { on })`, `shared`/`setShared`, `openOverlay`, `hc`.
- Programs: `quota-axi --json`; `sh` for load; `hc read` and `notify-send`/`HerdrAlerts.app` for alerts.

## Watch out

- Herdr's gpui-kit wants exact arguments: `flex_shrink(1)`, not `flex_shrink()` (that crashes
  the sidebar at run time though `herdr-app check` passes). Check `gpui-kit.d.ts` and
  `herdr-app status` after every change.
- quota-axi on macOS can't read Claude's Keychain login until `quota-axi --allow-keychain-prompt`
  is run once. Its windows carry no `windowSeconds`; pace comes from `reservePercentPoints`.
- A global npm install on a Linux box with system Node fails with EACCES; use `--prefix ~/.local`.
- The quota mod must stay in the layout (as the headless floating block) or nothing refreshes.
- A disconnected machine shows its state instead of `+`, which can shift its widget a little.

## Done when

- `herdr-app check` passes for every mod in `mods/`, and `herdr-app status` shows `"errors": []`.
- Each machine with quota-axi shows Claude's icon, `wk`, a 7-piece bar and a percentage that
  equals ClaudeUsageBar's menu-bar value, aligned with the other machines' widgets.
- Clicking the widget opens the popup for that machine.
- An agent that asks for permission posts a desktop notification.
