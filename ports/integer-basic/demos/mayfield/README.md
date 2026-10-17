# Mike Mayfield's HP BASIC Star Trek (STTR1)

This is the source selected by the user to replace the Bishop Apple-1 demo.
`STTR1.original.bas` preserves the complete upstream file byte for byte,
including the unnumbered extraction note, all numbered REM lines, instructions,
and Mike Mayfield / Centerline Engineering attribution. No comments were removed.
The separate Integer BASIC adaptation is described below. The compact version
now runs on the native **64K CoCo build**, using a separate program cassette.


## Listings and adaptation notes

- [Original HP listing](STTR1.original.bas)
- [Commented Integer BASIC adaptation](STTR1.integer.bas)
- [Compact deployed listing](STTR1.compact.bas)
- [What changed to make it run in Integer BASIC and on the CoCo](ADAPTATION.md)

The detailed language, arithmetic, formatting and 64K memory notes are in
**ADAPTATION.md**. The deployed listing keeps attribution comments; the annotated
version remains available for comparison.

## Source identity

- Repository: https://github.com/fkfisch/STTR
- Pinned listing: https://github.com/fkfisch/STTR/blob/4d287105f27b3abac1e2686d2e5f33e408e1f6a1/STTR1
- Retrieved October 16, 2026; 19,012 bytes, 643 physical lines.
- SHA-256: `69dfa0122e3dd9299fbf5764419e13de1bf42fd34fb2d0a3104847c57b6ef396`
- Header identifies HP BASIC program 36243, revision B, October 1973.
- Line 120 credits Mike Mayfield, Centerline Engineering.
- Line 140 says original 20 October 1972.
- Extraction note credits Pete Turnbull, 16 November 2003.

The screenshot supplied by the user shows revision E; this particular GitHub
file says revision B. Preserve that difference rather than silently relabeling it.
The source header's 1972 date is not a claim that Mayfield's earlier 1971 game
never existed.

## Wozniak's own adaptation

Wozniak says in *iWoz* (printed p. 184) that he adapted a BASIC Star Trek
program to his Apple-1 BASIC and got it running. This is direct evidence of
his own game adaptation, separate from Bishop's later Apple-1 version.

Source: [Wozniak and Gina Smith, *iWoz*](https://www.scribd.com/document/623963576/IWoz-From-Computer-Geek-to-Cult-Icon).

The passage does not identify this exact STTR1 revision or give the changes
he made. His use of HP BASIC as a language-design reference does not, by
itself, establish which Star Trek source revision he adapted. We have not
located/authenticated his adapted listing. Do not claim he never ported the
game, that Bishop's program was his port, or that his port's implementation
choices are known. Finding his surviving adaptation is preferable to inventing
a new one for this project's historical-demo objective.

## Integer BASIC adaptation

`STTR1.integer.bas` is the derived, commented version; `adapt.py` generates it
from the untouched HP file using explicit source-line replacements. Original
line numbers remain anchors for comparing the two versions. All numbered
original REM lines survive, including Mayfield's attribution. His credit also
prints beneath the title. The extraction credit is included as a numbered REM.

The adaptation runs on the original, unmodified Apple-1 BASIC ROM in the
logical-console oracle with **32 KiB of writable RAM**. This is an expanded-memory
configuration, not a claim that the full program fits a stock 4K/8K Apple-1.
The C adapter accepts explicit `APPLE1_RAM_TOP=0x8000`; py65 accepts
`ram_top=0x8000`. Both retain their old 4K memory policy by default, so the frozen
language-oracle contract is unchanged.

The fully annotated source requires **18,480 token bytes**. The deployment copy,
`STTR1.compact.bas`, removes explanatory/formatting REMs and spaces outside
strings, retaining the title, revision, extraction credit, Mayfield attribution
and original date at the top. It requires **14,163 token bytes**, saving 4,317.
`compact.py` also redirects jumps to removed REM lines to their next surviving
statement; it does not change game rules, strings or line numbers of executable
statements. The annotated adaptation and original HP file remain untouched.

That is still too large for the existing 4 KiB arena. The new **64K profile**
uses a 16 KiB arena, and the initialized game leaves **1,169 bytes free**.
The website offers separate 64K Integer BASIC and Mayfield program tapes:

1. Reset to Color BASIC. Mount **64K Integer BASIC**, enter `CLOADM`, wait for
   `OK`, then enter `EXEC`.
2. Mount **Mayfield Star Trek program**, enter `LOAD "MIKETREK"`, wait for
   `LOADED`, then `RUN`.
3. Answer YES or NO for instructions. Enter course/warp values in tenths.

Initialization and the first board take about **149.5 seconds** at nominal
60 Hz/normal CoCo speed in the physical-keyboard test. The larger program does
more line searches than the Bishop demo; this pause is not a tape error.

The Bishop game and original 32K interpreter remain available separately.
The original HP file can be diffed against the annotated adaptation, then that
file against the compact deployment source. Original comments remain in the
first two files; only attribution comments remain in the deployed LIST.

### Run and verify

From `ports/integer-basic`:

```sh
make mayfield-source       # regenerate derived source, keeping original intact
make mayfield-test         # annotated game on C/6502, helpers on native MC6809
make mayfield-compact-test # compact game: original ROM/native transcript parity + tape test
make mayfield-tapes        # 64K interpreter and separate MIKETREK CAS/WAV
make web-software          # package website tapes
make mayfield-crosscheck   # also compare a full session on independent py65
```

For an interactive session in the logical Apple console, provide `HIMEM=32767`
and `LOMEM=2048`, enter the derived listing, then RUN. The executable's explicit
RAM setting must match: `APPLE1_RAM_TOP=0x8000 build/apple1 reference/a1basic.bin`.
At the instructions question answer YES or NO. Commands remain 0..7 as in HP's
original. The website now provides separate interpreter and program tape buttons.

`build/mayfield-adaptation-test.json` (or `mayfield-adaptation-crosscheck.json`
for the independent-CPU run) records source hashes, tested transcripts,
token size and whether an independent CPU was used. Tests include instructions,
scans/map/status, fractional navigation, trajectory calculator, controlled
phaser/torpedo hit and miss, docking/refill, damaged devices, empty weapons,
win/loss/time-limit/restart, and protection while docked. Controlled encounters
add test setup lines at 9000; they exercise the unchanged derived game routines
rather than traversing a random mission to reach the same situation.

Additional tests run all 225 sector-distance deltas and replace all 64 map cells,
checking string suffixes/lengths, on both the original ROM and native MC6809
helper builds. These are adaptation tests, not HP-reference differential tests;
no HP BASIC reference execution has yet been used. The compact suite compares 21 complete scenario transcripts against native
MC6809 execution; the 22nd measures token size. Physical keyboard events and
ROM cassette loading of both separate tapes are also tested, with tape shortcuts
disabled, through initialization/scans/status and Reset. Physical hardware and
a full HP floating-point differential oracle remain untested.


## Compare the preserved versions

```sh
diff -u STTR1.original.bas STTR1.integer.bas
diff -u STTR1.integer.bas STTR1.compact.bas
```

The first comparison shows the language/game adaptation and its comments. The
second shows deployment-only comment/space removal and branch redirection.
`compact.py` is reproducible and checks do not rewrite the original source.
