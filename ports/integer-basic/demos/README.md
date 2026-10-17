# Historical Apple-1 demos

Mike Mayfield’s HP **STTR1** is now preserved alongside a separate, commented
[Integer BASIC adaptation](mayfield/README.md). Its compact, attributed deployment copy runs in the native **64K CoCo build**,
with separate interpreter and program tapes.
The website’s playable Star Trek is still the distinctly named Bishop version.

Blackjack (also called **21**) is our first recovered historical game. This is
the Apple-1 BASIC game, not a newly written imitation. Its author is unknown.

Bishop's **Apple Star-Trek** (1977) is also available. See [history, loading,
commands and provenance limits](STAR-TREK.md). Build it with `make star-trek`,
verify with `make star-trek-test`, and publish local site assets with
`make web-software`.

## Play on the CoCo

The main page's **Software library** provides separate **Integer BASIC** and
**Blackjack program** tapes. Load BASIC with `CLOADM`, wait for `OK`, then
`EXEC`. Mount the game tape, enter `LOAD "BLACKJAK"`, wait for `LOADED`, then
`RUN`. Mounting does not type commands for you. The keyboard is expanded by default.

At normal CoCo speed, the first shuffle pauses at `I SHOW` for about 17 seconds;
the dealer turn can take about 19 seconds. It continues after those loops finish.


### Load the game as an individual BASIC program

Run `make native demos` in `ports/integer-basic`. Then, in the web emulator:

1. Choose **Tape** → `build/prompt.cas`. At CoCo BASIC's `OK` prompt type
   `CLOADM`, wait for `OK`, then type `EXEC` to start Integer BASIC.
2. Choose **Tape** → **`build/blackjack-program.cas`**.
3. At Integer BASIC's `>` prompt type `LOAD "BLACKJAK"` (the cassette name is
   eight characters), wait for `LOADED`, then type `RUN`.
4. Enter your name, a numeric bet, and `Y` or `N` at `HIT?`. Bet `0` to quit.

The program-only tape is just **1,530 tokenized program bytes**, plus cassette
headers and checksums. It contains no interpreter, native machine code or saved
variables. `build/blackjack-program.wav` carries the same program as audio.
Load it with Integer BASIC's `LOAD`, not CoCo BASIC's `CLOADM`.

To save your own copy after quitting the game, click **⏺**, type
`SAVE "MY21"`, wait for `SAVED`, stop recording, then click **CAS** or **WAV**.
You can `SCR` and `LIST` to confirm the program has been cleared, select your
downloaded tape with **Tape**, then `LOAD "MY21"` and `RUN` to play again.
Loading clears gameplay variables; it does not resume a hand. See
[program-tape instructions](../native/TAPE.md) for file limits and recovery.

`program-tape-build.mjs` enters the recovered source into the native interpreter
and uses its actual `SAVE` command and the CoCo ROM to produce these files.
The program format is versioned; it contains no addresses tied to an interpreter
build. Rebuild it when the recovered source or program-file format changes.

### Internal preloaded test fixtures

`make demos` also builds `build/blackjack.cas/.wav`, a snapshot containing the
interpreter with the game already installed. These are retained for regression
tests and are not published in the website library. They have no separate
program file for `LOAD` to read. Use separate BASIC and program tapes to play.

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

The program-only workflow test boots an empty interpreter through `CLOADM/EXEC`,
loads the game with `LOAD`, plays a hand, saves through `SAVE`, clears with `SCR`,
reloads, and plays a second hand. It checks exact program bytes, the complete
original LIST, variables cleared on reload, and both complete game transcripts
against C and independent py65 execution of the unchanged original ROM. It runs
with program CAS input and raw WAV samples, with tape loading shortcuts disabled.
The first session stands, wins and quits; the second rejects an excessive bet,
hits, busts, loses and quits, preserving the original RNG sequence across RUNs.
`build/blackjack-program-test.json` records the transcripts and artifact hashes.

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
