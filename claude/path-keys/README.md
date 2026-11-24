# path-keys

A Claude Code mod for sessions running inside Herdr. After each reply, every file the reply
names that exists on disk gets a number on screen (`[1]`, `[2]`, …; the stored reply is
unchanged), and a row above the prompt lists them: `Open 1: decisions.md  2: viewer.js`.
With the prompt empty, press the digit and the file opens in Herdr's Better Files viewer
beside the terminal, ready to edit or tick checkboxes in.

It works the same on a remote machine: the mod labels its own terminal
`herdr.open={"path","root","at"}` with herdr-core's `hc`, and Better Files (in this repo's
`mods/better-files`) opens the file from the machine that terminal runs on.

Needs: Herdr with this repo's `mods/better-files`, and `hc` on the machine Claude runs on.
At most nine files get a digit. A new prompt clears the numbers.

Install (from this folder's parent, on each machine):

```sh
claude plugin marketplace add <path to this repo>/claude
claude plugin install path-keys@quarterdeck
```
