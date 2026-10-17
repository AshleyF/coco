# Adapting Mike Mayfield's Star Trek to Integer BASIC

These notes describe our adaptation of the preserved HP BASIC STTR1 listing
for Woz's Integer BASIC and its native MC6809 port on the CoCo. For source
provenance, loading instructions, tests and comparisons, see [README.md](README.md).

| File | Purpose |
| --- | --- |
| [STTR1.original.bas](STTR1.original.bas) | Untouched HP listing, including attribution and original remarks |
| [STTR1.integer.bas](STTR1.integer.bas) | Annotated Integer BASIC adaptation for comparison |
| [STTR1.compact.bas](STTR1.compact.bas) | Deployed version with attribution remarks retained |

The annotated version remains available as a record of the changes. The deployed
version already omits explanatory remarks, so these Markdown notes consume no
CoCo RAM. No executable BASIC or cassette bytes changed when these notes moved.

## HP BASIC and Integer BASIC differences

This is HP floating-point BASIC, not Apple-1 Integer BASIC. The current native
interpreter faithfully uses signed 16-bit integer arithmetic. The standard 32K graphics
build provides at most 4 KiB for program and variables, and stages at most 3,584
program bytes. The expanded 64K profile below supplies the space this game needs.

Concrete differences in this listing:

| HP behavior | Examples | Work needed for Integer BASIC |
| --- | --- | --- |
| Fractional arithmetic and random fractions | 290, 520–550, 1480, 1890–1900 | Explicit scaled arithmetic and RNG mapping; preserve probabilities and navigation precision |
| Square roots, powers, user function | 360, 2700, 3850, 5240 | Distance calculation with checked precision and overflow |
| Two-dimensional arrays and square-bracket indexing | 260, 730, 2430 | Flatten arrays and adapt all subscripts |
| Matrix clearing | 450, 910, 2400 | Explicit clearing, preserving HP implicit-array behavior |
| Chained assignment | 290, 420–440, 810 | Expand assignments in the proper order |
| Computed dispatch | 1290, 4680 | Explicit dispatch with correct out-of-range fall-through |
| IMAGE / PRINT USING | 2350–2520, 4430–4620 | Equivalent formatting and an explicit 40-column layout adaptation |
| HP substring access and assignment | 470, 5540–5590, 5720–5790 | Translate indexing and assignment semantics |
| Clock | 410, 4090–4100 | Define timing units and handle the original expression explicitly |

`node ports/integer-basic/demos/mayfield/compatibility.mjs` reproduces a small
set of compatibility probes on the actual native graphics binary. These probes
establish blockers; they do not validate a game adaptation. Build the native
graphics binary first with `make -C ports/integer-basic native-graphics`.

The game is adapted to the existing signed-integer language; the interpreter's
arithmetic semantics remain unchanged. The Bishop demo remains separate. Our
checks compare the adaptation on the original ROM and native port; an HP BASIC
reference comparison is still outstanding.

## Language and gameplay changes

The derived file includes REM explanations near its header and helper routines.
The build script explains the associated transformations in more detail:

- **Fractional navigation:** courses and warp factors are entered in tenths.
  Enter `15` for course 1.5, `30` for course 3, and `2` for warp .2. Movement
  accumulates tenths internally and rounds to sectors at the original points.
  Negative galactic coordinates explicitly use floor division. Precision is
  tenths, so this is not an implementation of arbitrary HP floating point.
- **Probability and damage:** random probabilities use hundredth bins; repairs
  use tenths. The Apple RNG has a different sequence from HP's. Energy, shields,
  and hits use whole units. Distance is an integer square root in tenths; hit
  formulas explicitly split products to avoid overflow for ordinary gameplay
  values. Rounding changes numerical outcomes relative to the floating-point
  original. We have not proven overflow freedom for every possible long or
  deliberately pathological session in this 16-bit language.
- **Variable names:** Apple-1 BASIC allows a letter with an optional digit,
  so new arithmetic scratch values use U0..U3, H0/H1, and V0..V4.
- **Arrays:** two-dimensional G/Z/C/K arrays are flattened row by row while
  preserving their one-based indices. Matrix clearing becomes explicit loops.
  Apple FOR loops are post-tested; zero-count object/movement loops need guards
  or a phantom object appears even when the original count was zero.
- **Strings:** HP fixed-width padding becomes explicit spaces. Apple substring
  assignment truncates the tail; the adaptation saves and restores each suffix
  to implement HP's replacement semantics. Initialization moves DIM before the
  initial INPUT, and restart reuses arrays instead of attempting illegal REDIM.
- **Control flow:** HP GOTO OF becomes explicit dispatch with out-of-range menu
  fall-through. Apple IF guards one statement, so multi-statement conditional
  paths use explicit branches. DEF FND becomes a distance subroutine.
- **Output:** IMAGE/PRINT USING becomes ordinary PRINT. Short scan status moves
  below the 32-character board. The galaxy record uses three digits per quadrant.
  Instruction prose is retained, except the navigation-unit explanations and
  diagram are adapted. Some original long messages still wrap at 40 columns.
- **Time/rating:** stardates and their mission limit remain; HP's elapsed wall
  clock report is omitted. Efficiency is truncated to tens and printed without
  overflowing a 16-bit numeric result. Zero elapsed stardates gets an explicit
  message instead of division by zero.
- **Calculator:** the HP listing sets H8 to zero at line 5270; after the manual
  calculator this can fall into NEXT I without the intended loop. The derived
  line sets H8 to one, and documents the correction. Calculator coordinates are
  restricted to sectors 1..8 to bound intermediate arithmetic. Equal coordinates
  report distance zero; only combat clamps a zero divisor.

The task here is a documented adaptation, not a claim of bit-for-bit HP game
behavior or an authenticated reconstruction of Wozniak's own lost adaptation.

## 64K native memory profile

`make native-large` builds `build/graphics64.bin/.cas/.wav`; the engine remains
native MC6809. The low RAM engine/framebuffer/private layout matches the graphics
profile. At EXEC a native bootstrap copies the CoCo ROMs and vectors underneath
themselves, then selects SAM all-RAM mode. Color BASIC's code and service vectors
at $A000..$BFFF remain available as RAM copies; Extended BASIC's $8000..$9FFF
copy is reused by the expanded arena. There is no host BASIC interpreter.

- Arena: $6000..$9FFF (16 KiB), default HIMEM $A000.
- Color BASIC service copy: $A000..$BFFF.
- Atomic LOAD staging: $C000..$FDFF; maximum program 15,872 bytes.
- Native stack: $FE00..$FEFF, starting at $FF00, including the translated TXS path.
- Real PIA/SAM I/O remains decoded; reset restores the ROM map before vector fetch.

This requires **64K RAM on a real CoCo 1/2**; it does not fit a 32K machine.
Unrelated Extended BASIC calls into $8000..$9FFF are unavailable after program
loading. The standard 32K native binary is unchanged. The emulator now models
SAM TY ROM/RAM selection; high RAM is not a browser-only extension.

Independent XRoar (`-ram 64`, tape acceleration disabled) validates the 64K
interpreter CAS and WAV through console and stored-program executions, checking
native segments and computed markers. `build/graphics64-xroar-acceptance.json`
records those results. The Mayfield game itself is covered by native/original-ROM
transcript comparisons and the JS machine's physical cassette/keyboard test;
we have not tested it on electrical hardware.


