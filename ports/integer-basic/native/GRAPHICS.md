# Native 40×24 graphics terminal

The website's Integer BASIC, Blackjack and Star Trek application tapes now use a
native 40-column, 24-row console. EXEC changes the CoCo from its green 32×16 ROM
screen to a compact light-on-black display. The same cassette bytes run on a
32K CoCo 1/2; no browser overlay, JavaScript text renderer, extra cartridge or
CoCo 3 hardware is required. Physical hardware playback remains untested.

## Use and build

Refresh the main page and use its Software library. Mount an application tape,
then at Color BASIC's OK prompt enter CLOADM, wait for OK, then EXEC. For a
bundled game, enter RUN. The new terminal starts on EXEC. The library selects **Sharp pixels (text)**
for readable small glyphs; **Graphics display** can restore NTSC artifact color.
This monitor setting changes only emulator presentation, not video RAM or native
code. A real monochrome monitor/TV avoids composite artifact-color fringes. Reset returns to the
CoCo ROM's normal display.

```sh
make native-graphics graphics-demos
make graphics-test
make graphics-xroar-test   # optional installed XRoar
make web-software         # refresh the five packaged website cassettes
```

The outputs are `build/graphics.bin/.cas/.wav`,
`build/graphics-blackjack.bin/.cas/.wav`, and
`build/graphics-star-trek.bin/.cas/.wav`. The preloaded game builds are internal
regression fixtures. The website publishes only the interpreter as
`software/integer-basic.cas` and two separate program tapes. The program-only Blackjack/Star Trek tapes are unchanged:
their token format is independent of display mode. For Star Trek's program-only
tape, enter **HIMEM=27904** before LOAD "STARTREK" in the graphics interpreter.
Preloaded regression fixtures have their workspace configured and contain no
separate program file for LOAD.

The previously tested 32×16 ROM-console build remains available as
`make native` (`build/prompt.*`); its existing memory map and binary are unchanged.
Use that build's **HIMEM=23808** Star Trek setup. Reports for the two builds are
separate; a pass for one must not be reported as validation of the other.

## Implementation

`native/graphics-terminal.asm` contains the complete MC6809 driver. It configures
PIA1 for RG6 and SAM V=110 with video base $0800, then writes the actual 6 KiB
bitmap. The 256×192 display holds forty 6×8 character cells, with 8-pixel left
and right margins. Glyphs use the project's existing 5×7 uppercase font, with a
blank eighth raster row. This preserves the Apple-1's terminal dimensions, not
a claim of a bit-identical Apple character-generator ROM or video waveform.

The driver handles printable uppercase ASCII, automatic column-40 wrapping,
carriage return, clear, destructive backspace, a block cursor and scrolling by
one eight-pixel character row. Lowercase output folds to uppercase. The cursor
blinks in the blocking keyboard wait; its timing follows keyboard polling rather
than emulating the Apple-1 display circuit. The historical BASIC editor retains
its own underscore-delete and Escape line-cancellation behavior. This is not an
ANSI terminal. Color televisions can show NTSC artifact-color fringes around
small text; a monochrome display gives a cleaner appearance.

The static generator has a separate `--graphics` memory profile. It relocates
private state, syntax data, arena addresses and console entry points before
assembly. The BASIC algorithms and frozen reference ROM remain unchanged.
Graphics output replaces the stock CHROUT service; KEYIN, cassette services and
user CALL still enter CoCo ROM/user code with DP=0 and restore the engine ABI.
Native console routines preserve registers and flags. The renderer executes in
the target CPU, including while tests supply logical keyboard bytes.

## 32K memory layout

| Region | Use |
| --- | --- |
| $0000–$07FF | CoCo ROM workspace/text memory; game maps at $0600–$067F |
| $0800–$1FFF | 6,144-byte graphics framebuffer |
| $2000–$4CD7 | Current engine, console code and font; build checks ceiling $5000 |
| $5000–$52FF | Original private workspace, control frames and input buffer |
| $5300–$5306 | Engine helper state |
| $5308–$5375 | Program cassette state and saved ROM workspace |
| $53A0–$53AA | Graphics cursor and drawing scratch |
| $5400–$5BFF | Native cassette extension reservation |
| $5C00–$5DFF | Read-only grammar data |
| $5E00–$5EFF | Tape block buffer |
| $6000–$67FF | Initial 2 KiB program/variable arena |
| $6800–$6FFF | Optional arena expansion (maximum 4 KiB total) |
| $7000–$7DFF | Atomic incoming program-tape staging; demo bootstrap at $7000 before loading |
| $7E00–$7EFF | Native stack, initially $7F00 |

DP=$50 and U=$5080 are the engine's internal ABI. Graphics helpers use explicit
addresses and preserve callers' DP. Warm demo entry establishes this ABI and
initializes graphics. Staging may overwrite the one-shot demo bootstrap after
it has jumped into the engine; normal execution does not return there.

The graphics build trades some arena expansion for its framebuffer. Initial
capacity remains the reference's 2 KiB; the maximum is 4 KiB rather than the
ROM-console build's 8 KiB. Tape tokens remain limited to 3,584 bytes. PEEK/POKE
still access actual CoCo addresses, while internal accesses retain a separate
guarded policy (private RAM and arena writable; grammar read-only; unbacked
reads zero/writes ignored). Existing machine-code extensions need this layout.

## Evidence

- 931 unchanged portable behavioral contracts pass on `graphics.bin`;
  `build/graphics-acceptance.json` fingerprints that exact binary.
- 1,558 parser inputs match original tokens/errors (`build/graphics-parser.json`).
- 1,317 entire framebuffer comparisons check every glyph, every packing phase,
  all columns, the bottom edge, exact-width wrapping, controls, repeated scroll,
  cursor blinking and register preservation. An engine-code canary checks that
  rendering never writes into executable code; reset restores the ROM text mode.
- 524,288 memory guard cases check every 16-bit address, read/write and flags
  under the relocated profile.
- Physical keyboard/ROM tests load every application segment with tape shortcuts
  disabled, using both CAS pulses and raw WAV samples. They check actual bitmap
  text, input editing, scrolling and SAVE/SCR/LOAD while RG6 remains configured.
  SAVE in this test uses the emulator's normal ROM byte-recording shortcut;
  re-loading disables shortcuts. Analog recording is checked independently below.
- Both complete historical Blackjack sessions and five Star Trek scenarios match
  unchanged original C and independent py65 transcripts. Physical CAS/WAV tests
  repeat game loading and play. The Star Trek test asserts both 33-column borders
  and the short-scan heading are visible together in the 24-row bitmap.
- Independent XRoar CAS/WAV runs load every native segment and execute console
  and stored-program cases. A separate Python decoder checks XRoar's bitmap RAM,
  without our JavaScript CPU or VDG. XRoar also records native SAVE through the
  actual ROM/DAC; native LOAD reads that waveform as PCM and RUN prints 42.

The display uses documented CoCo hardware registers and no additional browser
capability. Independent emulator checks support portability; an electrical tape
and display test on a physical CoCo is still needed before claiming hardware
verification. Keyboard, font, cursor timing and video signal remain CoCo
adaptations, while the original language transcripts are retained.

Hardware references: [Tandy Color Computer Technical Reference, video modes](https://www.bighole.nl/pub/mirror/homepage.ntlworld.com/kryten_droid/coco/coco_tm_s3.htm) and
[Tandy Color Computer 3 Service Manual](https://colorcomputerarchive.com/coco/Documents/Manuals/Hardware/Color%20Computer%203%20Service%20Manual%20%28Tandy%29.pdf), whose SAM register map documents the compatible mode/offset controls.
A fresh parallel build reproduces all nine graphics BIN/CAS/WAV artifacts and
all five packaged website tapes (`build/graphics-clean-build.json`).


## Optional 64K build

The separate `make native-large` profile supports the larger
[Mayfield Star Trek adaptation](../demos/mayfield/README.md). It retains this
40×24 renderer and uses real SAM all-RAM mode, a native ROM-copy bootstrap,
a 16 KiB arena, and expanded cassette staging. It requires 64K RAM; the standard
32K profile and its binary remain unchanged. See the linked memory map and
verification limits before selecting a hardware target.
