# CoCo II Emulator

A TRS-80 Color Computer II emulator in plain JavaScript. No build tools, no dependencies — just open it in a browser.

## Quick Start

```
npx serve .
```

Open `http://localhost:3000`. The emulator auto-loads Color BASIC 1.3 + Extended BASIC 1.1 and boots to the `OK` prompt.

## Features

- **MC6809E CPU** — full instruction set, cycle-accurate
- **Video** — text mode, semigraphics-4 (SET/RESET), all PMODE graphics
- **Sound** — DAC audio via Web Audio API
- **Keyboard** — full matrix emulation, browser key mapping, on-screen touch keyboard for mobile
- **Joystick** — dual-stick emulation (Ctrl+Arrows = right stick, +Shift = left stick)
- **Cassette** — CLOAD/CSAVE with CAS files, WAV export (real FSK audio playable on hardware)
- **Cartridges** — ROM cartridge loading with FIRQ autostart
- **Mobile** — responsive layout, on-screen CoCo keyboard (tap ⌨ to toggle)

## Controls

| Action | Key |
|--------|-----|
| Letters, numbers, symbols | Direct mapping |
| ENTER | Enter |
| CLEAR | Escape |
| BREAK | F12 |
| Backspace | Left arrow |
| Right joystick | Ctrl + Arrows, Ctrl + Space = fire |
| Left joystick | Ctrl + Shift + Arrows, Ctrl + Shift + Space = fire |
| Paste text | Ctrl + V |

## Cartridges & Tapes

Download CoCo software from the [Color Computer Archive](https://colorcomputerarchive.com/):
- **Cartridges**: [ROM packs](https://colorcomputerarchive.com/repo/ROMs/) — click **Cart**, select a `.rom`/`.ccc` file
- **Cassettes**: [CAS files](https://colorcomputerarchive.com/repo/Cassette/) — click **Tape**, then type `CLOAD` or `CLOADM`

## Running Tests

```
node tests/cpu.test.node.js
```

182 tests covering CPU, memory, PIA, SAM, VDG, keyboard, cassette, and system integration.

---

# Architecture

## System Overview

The CoCo II is built from five chips plus RAM and ROM. The emulator mirrors this structure — one JS file per chip, wired together in `coco.js`.

```
┌──────────────────────────────────────────────────────────────┐
│                        Address Bus                           │
├──────┬──────┬──────┬──────┬──────────┬──────────┬───────────┤
│ CPU  │ RAM  │ ROM  │ ROM  │  PIA 0   │  PIA 1   │    SAM    │
│6809E │ 64K  │Basic │ExtBas│ $FF00-03 │ $FF20-23 │ $FFC0-DF  │
│      │      │$A000 │$8000 │ Keyboard │ Sound    │ Video cfg │
│      │      │      │      │ Joystick │ Cassette │ Clocking  │
├──────┘      │      │      │ VSync    │ VDG mode │           │
│             │      │      └────┬─────┴────┬─────┘           │
│             │      │           │           │                 │
│             │      │      ┌────┴───┐  ┌───┴────┐            │
│             │      │      │Keyboard│  │  VDG   │◄── SAM     │
│             │      │      │ Matrix │  │ MC6847 │    video    │
│             │      │      └────────┘  │ Video  │    offset   │
│             │      │                  │ Output │            │
│             │      │                  └───┬────┘            │
│             │      │                      │                 │
│             │      │                  ┌───┴────┐            │
│             │      │                  │ Canvas │            │
│             │      │                  │ 256×192│            │
│             │      │                  └────────┘            │
└──────────────────────────────────────────────────────────────┘
```

| File | Chip | Role |
|------|------|------|
| `cpu.js` | MC6809E | 8-bit CPU, ~0.895 MHz |
| `memory.js` | — | 64K address bus, routes reads/writes |
| `pia.js` | MC6821 ×2 | Peripheral interface (keyboard, sound, VDG control) |
| `sam.js` | MC6883 | Video addressing, clock rate, memory config |
| `vdg.js` | MC6847 | Video display generator (text + graphics rendering) |
| `keyboard.js` | — | Browser keyboard → CoCo 7×8 matrix mapping |
| `joystick.js` | — | Dual joystick emulation via keyboard |
| `cassette.js` | — | CAS/WAV tape file loading, saving, FSK encoding |
| `sound.js` | — | DAC audio output via Web Audio API |
| `debug.js` | — | Disassembler, breakpoints, tracing |
| `coco.js` | — | System integration, main loop, UI wiring |

## Memory Map

```
$0000-$7FFF  RAM (32K)
    $0400-$05FF  Default text screen (32×16 = 512 bytes)
    $0600-$1FFF  Graphics screen pages (PMODE)
$8000-$9FFF  Extended BASIC ROM (8K)
$A000-$BFFF  Color BASIC ROM (8K)
$C000-$FEFF  Cartridge ROM space
$FF00-$FF03  PIA 0 (keyboard, joystick comparator, VSYNC)
$FF20-$FF23  PIA 1 (sound DAC, cassette, VDG mode bits)
$FFC0-$FFDF  SAM registers (write-only, bit-pair set/clear)
$FFF0-$FFFF  Interrupt vectors (mirrored from BASIC ROM)
```

## Keyboard Matrix

```
       Col 0  Col 1  Col 2  Col 3  Col 4  Col 5  Col 6  Col 7
Row 0:   @      A      B      C      D      E      F      G
Row 1:   H      I      J      K      L      M      N      O
Row 2:   P      Q      R      S      T      U      V      W
Row 3:   X      Y      Z      ↑      ↓      ←      →    SPACE
Row 4:   0      1      2      3      4      5      6      7
Row 5:   8      9      :      ;      ,      -      .      /
Row 6: ENTER  CLEAR  BREAK  ---    ---    ---    ---    SHIFT
```

## References

- [MC6809E Programming Manual](http://www.maddes.net/m6809pm/)
- [CoCo Technical Reference](https://archive.org/details/ETC2052)
- [Lomont Hardware Guide](https://www.lomont.org/software/misc/coco/Lomont_CoCoHardware.pdf)
- [Color Computer Archive](https://colorcomputerarchive.com/)

