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

**Recommended for Claude Code:** merge [`claude/permissions.json`](claude/permissions.json) into
`~/.claude/settings.json` (append to `permissions.allow` and `permissions.ask`). It lets an agent
run the read-only and mod-development commands (`herdr-app check`, `status`, `shot`, `hc ls`,
`hc read`, a few `herdr-app do` layout commands) without a prompt. It keeps asking for anything
that runs code or types into terminals, here or on another machine (`hc run`, `hc exec`,
`hc send`, `hc file`, other `herdr-app do` commands, `hc machine add`). Remove any broader
`Bash(hc *)` or `Bash(herdr-app *)` ask rule first, since ask rules beat allow rules.
`herdr-app check` runs a mod's `init()`, so read a mod before checking it.

## Needs

- [`quota-axi`](https://github.com/kunchenguid/quota-axi) on every machine whose quota you
  want (`npm install -g quota-axi`, or `--prefix ~/.local` without root), signed in to Claude.
  On macOS run `quota-axi --allow-keychain-prompt` once and allow Keychain access.
- [gitview](https://github.com/ChmaraX/herdr-gitview) in the Changes panel (stage, commit, diff
  panes, review notes; macOS and Linux). Install it with its own installer while Quarterdeck is
  shown: `curl -fsSL https://raw.githubusercontent.com/ChmaraX/herdr-gitview/main/install.sh | sh -s -- --app`.
  It downloads a prebuilt binary and points the layout's `changes` block at gitview (already so
  in `layouts/quarterdeck.json`). Then apply `patches/gitview-tab-switch.patch` from
  `~/.config/herdr-app` (`patch -p1 < patches/gitview-tab-switch.patch`), again after each gitview upgrade:
  without it, switching tabs closes gitview's diff pane, because `tabs-graph` remembers the
  panel per tab. Without gitview, set the `changes` block back to `{ "mod": "changes" }`.
- macOS notifications with Herdr's icon: `mods/better-alerts/helper/build.sh` (needs Xcode
  Command Line Tools). Linux uses `notify-send`.

## Options

- **Pin the load bar to one machine:** `{ "machine": "<name>" }` in
  `mods/system-load/local.json`. Without it the bar follows the selected space.
- **Quota details:** click the pace bar in a machine header.
- `settings.json` uses the font Illinois Mono for terminals and the sidebar's numbers, and Lexend for the other panels. Without Illinois Mono, terminals fall back to JetBrains Mono and the sidebar's numbers to Geist Mono; without Lexend, install it or remove `ui_font`.

## What runs

- `quota-pace` runs `quota-axi --json` on each connected machine every 2 minutes.
- `system-load` runs one `sh` script every 3 s on the shown machine (iostat/vm_stat on macOS, /proc on Linux).
- `better-alerts` reads an agent's screen with `hc read` when it needs you or finishes.
- `even-better-sidebar` reads Claude Code transcripts on each machine for context and timing.
- `open-ref` (`cmd-o`, and Cmd-click on a path in a terminal) reads the clipboard with `pbpaste` (cmd-o only) and checks the path with `sh` (`test -f`, `git rev-parse`) on the machine of the terminal.
- `better-files` opens a file a terminal asks for with the label `herdr.open`, from that terminal's machine.
- `claude/path-keys` (a Claude Code mod, installed per machine) numbers the files a reply names; a digit in an empty prompt runs `hc label` on its own terminal to open one.
- `better-files` writes a file only from its Edit mode or a ticked Markdown checkbox, and never over changes made since it read the file. A file on another machine is written there with `sh` (`base64`, `cmp`, `mv`).
- `gitview` runs its `herdr-gitview` binary, which runs `git` (through `hc exec` on another machine), `hc`, `herdr-app` and an editor; it writes to a repo only when you stage, discard or commit, and keeps a local trace in `data/gitview/trace` (no file contents).
- No mod sends anything over the network itself.

## Credits

Built from other people's mods; see [SOURCES.md](SOURCES.md) for where each came from and
what changed. Each mod keeps its own licence.
