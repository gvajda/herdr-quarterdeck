# Quarterdeck for Herdr

A Herdr desktop layout for running coding agents across machines: the Even Better Sidebar
with Claude's weekly pace beside every machine, a tab bar with Files, Changes, Git and Notes
panels, desktop notifications when an agent needs you, and the selected machine's load in
the status bar.

<!-- preview.png goes here -->

## Install

Ask the agent running in Herdr:

> Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/gvajda/herdr-quarterdeck

[RECIPE.md](RECIPE.md) is the brief it follows. By hand: copy `layouts/quarterdeck.json` and
the folders in `mods/` into `~/.config/herdr-app/`, merge `keys.json`, then
`herdr-app do layout.switch --name quarterdeck`.

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
- `open-ref` (`cmd-o`, and Cmd-click on a path in a terminal) reads the clipboard with `pbpaste` (cmd-o only) and checks the path with `sh` (`test -f`, `git rev-parse`) on the machine of the terminal.
- `better-files` opens a file a terminal asks for with the label `herdr.open`, from that terminal's machine.
- `claude/path-keys` (a Claude Code mod, installed per machine) numbers the files a reply names; a digit in an empty prompt runs `hc label` on its own terminal to open one.
- `better-files` writes a file only from its Edit mode or a ticked Markdown checkbox, and never over changes made since it read the file. A file on another machine is written there with `sh` (`base64`, `cmp`, `mv`).
- No mod sends anything over the network itself.

## Credits

Built from other people's mods; see [SOURCES.md](SOURCES.md) for where each came from and
what changed. Each mod keeps its own licence.
