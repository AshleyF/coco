# Cartridges

Cartridge images (`.ccc` / `.rom`) for the emulator.

Only `colorforth.ccc` is checked in; place additional cartridge images here locally
and load them via the **Cart** button in the UI.

## Boot directly into a cartridge

Append `?cart=<name>` to the URL to auto-load a cartridge from this folder at
boot. The name maps to `carts/<name>.ccc`.

Examples:

- `index.html?cart=colorforth` — boots the bundled Color Forth cartridge.

You can also pass a full path/URL via `?cart=path/to/file.ccc`.

## Sources

- Color Forth (1981, Microworks) — from
  [colorcomputerarchive.com](https://colorcomputerarchive.com).
