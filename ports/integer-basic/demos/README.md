# Historical Apple-1 demos

Blackjack (also called **21**) is our first recovered historical game. This is
the Apple-1 BASIC game, not a newly written imitation. Its author is unknown.

## Play on the CoCo

From `ports/integer-basic`, run:

```sh
make demos
```

In the web CoCo emulator, start at the normal Color BASIC `OK` prompt:

1. Choose **Tape** and select `build/blackjack.cas` in this directory.
2. Type `CLOADM` and press Enter. Wait for `OK`.
3. Type `EXEC` and press Enter. The native Woz BASIC `>` prompt appears.
4. Type `RUN`. Enter your name, a numeric bet, and `Y` or `N` at `HIT?`.
5. Enter a bet of `0` to finish. `RUN` starts another game.

The tape contains the native MC6809 interpreter and the game's already entered
native BASIC program records. A small native startup stub enters the interpreter
without erasing the game. There is no 6502 interpreter or machine-code game in
this cassette. Regenerate the cassette when the native interpreter changes;
its saved program format and warm entry belong to that particular build.

The ordinary interpreter cassette remains `build/prompt.cas`.
`make demos` also creates `build/blackjack.wav`, containing cassette audio.
`blackjack.bas` is available for source entry. Bulk paste can outrun tokenization
of long lines; the preloaded demo cassette avoids that input-pacing issue.

## Provenance and exact source recovery

Vince Briel posted the recovered tape's monitor-format memory listing on
[Applefritter on January 24, 2005](https://www.applefritter.com/node/6203).
`blackjack.woz.txt` preserves his [21.TXT attachment](https://www.applefritter.com/files/21.TXT)
byte for byte. Retrieved October 14, 2026. SHA-256:

```text
bb6c5aaae3c6fb0f574568aeb56bcdae646c9595b75f8ed4dc6999047be53144
```

The [Apple-1 Software Library's Blackjack archive](https://apple1software.com/games/blackjack/)
identifies it as the game sold by Apple as cassette A1T004X and links that
recovery. Its archive treats the game as historical public-domain software;
the original attachment provides no separate license notice. Author and
recovery attribution are preserved here; no new ownership claim is made.

`recover-blackjack.py` loads that recovered memory into the **unchanged original
BASIC ROM**, enters its warm start, and asks it to `LIST`. It removes only LIST's
continuation indentation and spaces outside quoted strings. Compaction is
necessary because LIST expands some lines beyond the original keyboard input
limit. The result is 31 numbered source lines, at most 119 characters per line.
There are no corrected branches, altered game rules, renamed variables, or
replaced random-number calls. In particular, the historical reference to missing
line 44 is retained.

The recovery check re-enters the resulting source into a fresh original
interpreter and requires its entire LIST to equal the recovered tape's LIST.

## Verification

```sh
make demo-test
python3 demos/test.py --runner 'node native/original-runtime/runner.mjs'
```

Two reusable game sessions check a stand/win/quit path and an excessive-bet
retry followed by a hit/bust/loss/quit path. Each compares the **entire transcript**
between the unchanged ROM running on the C oracle, the independent py65 CPU,
and the native CoCo backend. Explicit assertions check cards, bet rejection,
win/loss, exact winnings and clean termination. These are integration contracts;
they do not claim to exercise every branch of the game.

The cassette test separately boots real CoCo ROMs, uses their `CLOADM` and
`EXEC`, and plays a complete hand through the emulated physical keyboard
matrix. It does not replace KEYIN or CHROUT with host services.

The browser UI was also verified with the actual Tape file chooser, `CLOADM`,
`EXEC` and `RUN`; the recovered game's `WELCOME TO 21. YOUR NAME?` prompt appeared.

## Other candidates and original tape loading

- [Hamurabi](https://apple1software.com/games/hamurabi/): the historical resource
  management game, available as Apple-1 BASIC. Not yet imported or verified here.
- [Mini-Startrek](https://apple1software.com/games/mini-startrek/): another
  archived Apple-1 BASIC candidate; not yet imported or verified here.
- [Original text Lunar Lander](https://apple1software.com/games/lunar-lander/text-only/)
  is 6502 machine code, so the BASIC port alone cannot run it.
- [ASCII Lunar Lander](https://apple1software.com/games/lunar-lander/ascii-graphics/)
  is a later Apple-1 BASIC adaptation (Corey Cohen, 2012). Its sound routines
  POKE/CALL 6502 code and Apple cassette hardware; those require explicit CoCo
  adaptations. It is not an untouched 1976 Apple-1 BASIC game.

The original [Apple-1 Cassette Interface manual](https://apple1software.com/downloads/Cassette_Interface.pdf)
describes reading and writing address ranges from its monitor at `$C100`, using
commands such as `E000.EFFFR`. These tapes are memory dumps, not portable BASIC
source files or CoCo CAS files. A recovered BASIC program may include interpreter
pointers and variables as well as tokens. The original waveform cannot simply
be mounted in the CoCo deck and loaded with `CLOADM`. Our demo instead converts
the recovered program back through original BASIC's LIST and builds a native
CoCo cassette. This uses the existing tape deck and standard CoCo loader.
