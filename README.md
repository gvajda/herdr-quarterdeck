# Main Graph for Herdr

A Herdr desktop layout for running coding agents across machines: the Even Better Sidebar
with Claude's weekly pace beside every machine, a tab bar with Files, Changes, Git and Notes
panels, desktop notifications when an agent needs you, and the selected machine's load in
the status bar.

<!-- preview.png goes here -->

## Install

Ask the agent running in Herdr:

> Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/gvajda/herdr-main-graph

[RECIPE.md](RECIPE.md) is the brief it follows. By hand: copy `layouts/main-graph.json` and
the folders in `mods/` into `~/.config/herdr-app/`, merge `keys.json`, then
`herdr-app do layout.switch --name main-graph`.

## Needs

- [`quota-axi`](https://github.com/kunchenguid/quota-axi) on every machine whose quota you
  want (`npm install -g quota-axi`, or `--prefix ~/.local` without root), signed in to Claude.
  On macOS run `quota-axi --allow-keychain-prompt` once and allow Keychain access.
- macOS notifications with Herdr's icon: `mods/better-alerts/helper/build.sh` (needs Xcode
  Command Line Tools). Linux uses `notify-send`.

## Options

- **Pin the load bar to one machine:** `{ "machine": "<name>" }` in
  `mods/system-load/local.json`. Without it the bar follows the selected space.
- **Quota details:** click the pace bar in a machine header.
- `settings.json` uses the font Illinois Mono; Herdr falls back to JetBrains Mono without it.

## What runs

- `quota-pace` runs `quota-axi --json` on each connected machine every 2 minutes.
- `system-load` runs one `sh` script every 3 s on the shown machine (iostat/vm_stat on macOS, /proc on Linux).
- `better-alerts` reads an agent's screen with `hc read` when it needs you or finishes.
- `even-better-sidebar` reads Claude Code transcripts on each machine for context and timing.
- No mod sends anything over the network itself.

## Credits

Built from other people's mods; see [SOURCES.md](SOURCES.md) for where each came from and
what changed. Each mod keeps its own licence.
