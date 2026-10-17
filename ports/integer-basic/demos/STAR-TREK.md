# Apple Star-Trek (Robert J. Bishop, 1977)

This demo uses the preserved **8K Apple-1 BASIC** listing, also known as
Mini-Startrek. It is a historical game, not a newly written imitation or an
Apple II Applesoft conversion.

## History: what the sources establish

Mike Mayfield wrote the original Star Trek in 1971. Bob Leedom expanded the game;
David Ahl published Super Star Trek in the November/December 1975 Creative
Computing and, after work with Steve North, in the 1978 BASIC Computer Games.
Ahl describes this sequence in his
[first-person interview](https://gamesnostalgia.net/story/interview-with-david-ahl-founder-of-creative-computing).
Leedom independently describes starting with Ahl's collection in his
[2021 interview](https://www.atariarchive.org/an-interview-with-robert-leedom/).
These are two different people: **Bob Leedom** expanded Super Star Trek;
**Robert J. (Bob) Bishop** wrote the Apple-1 game used here.

Bishop's original article and program listing are in
[Interface Age, May 1977, printed pp. 132–134](https://archive.org/details/Interface_Age_vol02I06_1977_May/page/n135/mode/2up).
It identifies Apple BASIC and describes its game as another version of the
Star-Trek type. It has the Mayfield family's recognizable 8×8 galaxy of
8×8-sector quadrants, Klingons, starbases, energy, stardates, short/long scans,
phasers and torpedoes. That supports selecting it as a period Apple-1 member
of that game family. **A direct chain of copied source code from Mayfield or
Leedom to Bishop is not established by the sources found.** The article does
not name either as a source. Do not turn the family resemblance into a claim
of proven line-by-line descent. The stricter requested ancestry remains a
provenance limitation, rather than something inferred as certain.

The source used here is Corey986's
[Applefritter attachment](https://www.applefritter.com/files/AppleStarTrek_8k.txt)
to the [December 2011 source post](https://www.applefritter.com/content/8k-apple-1-star-trek-basic-code).
The accompanying [instructions](https://www.applefritter.com/content/star-trek-8k-apple-i-basic)
credit Pete Turnbull's March 2005 retyping from a scan supplied by Bishop.
The listing is also preserved by the
[Apple-1 Software Library](https://apple1software.com/games/mini-startrek/).
We have not authenticated a particular surviving 1977 cassette or independently
transcribed every printed program line.

`star-trek.original.bas` preserves the downloaded attachment byte for byte:

```text
SHA-256 9fa8a2bdfbd49b2f169bfc393b282446d35d3ba9ef917072c92a1ca7b6f0420c
```

## Play

The website Software library provides separate **Integer BASIC** and
**Star Trek program** tapes. Mount Integer BASIC, type `CLOADM` at Color BASIC's
`OK` prompt, wait for `OK`, then `EXEC`. At Integer BASIC's `>` prompt:

```text
HIMEM=27904
```

Mount `software/star-trek-program.cas`, then:

```text
LOAD "STARTREK"
```

Wait for `LOADED`, then `RUN`. The workspace command is necessary: the program's
3,024 token bytes exceed BASIC's default 2 KiB arena. The website interpreter uses the native 40×24
graphics console; the legacy `build/prompt.cas` ROM-console build instead uses
HIMEM=23808. Loading a program does not save HIMEM settings.

At `TYPE A NUMBER ?`, enter a small positive number such as `1` to select the
initial random sequence. Initialization takes time at normal CoCo speed. Then:

| Command | Action |
| --- | --- |
| `0` | Move; enter horizontal,vertical sectors at `VECTOR ?`, e.g. `0,-16` |
| `1` | Short-range scan |
| `2` | Long-range scan |
| `3` | Phasers; enter energy when requested |
| `4` | Fire an automatically aimed torpedo |
| `5` | Computer; request `0` for map or `1` for status |

The mission starts with seven Klingons, fifteen stardates, two starbases,
three torpedoes and 500 energy. Quadrant coordinates run from 0 through 7.
The website’s 40×24 console displays the short-range scan intact. The retained
32×16 ROM-console build wraps it. Logical output retains the original formatting. For a short demonstration with seed `1`, enter commands
`5`, `1` for status; `1` for a short scan; `2` for a long scan. A move of
`100,100` leaves the galaxy and ends the game. `RUN` starts again.

## Adaptation and verification

`star-trek-source.mjs` applies only two platform substitutions:

- Original setup `LOMEM = 768` becomes `HIMEM=27904` for graphics
  (`HIMEM=23808` for the retained ROM console). Each allocates 3,328 bytes:
  original `$0300..$0FFF`, ROM-console `$5000..$5CFF`; graphics-console `$6000..$6CFF`.
- Line 20's map addresses `Q=640:S=704` become `Q=1536:S=1600`, using free CoCo
  RAM `$0600..$067F` for the two 64-byte maps. Explicit PEEK/POKE need native
  addresses; no Apple addresses are silently remapped by the interpreter.

Whitespace outside strings is compacted for entry, with exact original LIST
comparison proving the tokenization is unchanged. All game rules, commands,
messages and random-number calls are preserved. Source entry and native SAVE
produce the program tape; no host implementation of the game is included.

```sh
make star-trek
make star-trek-test
make web-software
```

Five deterministic sessions compare complete game transcripts across the original
C core, independent py65 and native 6809 execution. Stated results check scans,
map/status, within-quadrant movement, empty-target weapons, cross-quadrant battle,
phaser damage/destruction, torpedo consumption, energy exhaustion and leaving the
galaxy. Separate physical-keyboard cassette checks run immediately after LOAD
without LIST priming, using CAS with shortcuts disabled, raw WAV samples, and
the all-in-one CLOADM/EXEC tape. The full scan and game transcript must match.
`build/star-trek-test.json` records results and fingerprints. This is integration
coverage of those scenarios, not proof that every possible mission outcome
(including victory and docking) has been tested.

A fresh parallel `make -j4 native demos` also reproduces all five Star Trek
BIN/CAS/WAV artifacts byte for byte; `build/clean-star-trek.json` records hashes.
