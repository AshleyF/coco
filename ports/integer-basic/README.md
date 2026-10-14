# Woz Integer BASIC for the CoCo

Status: Apple-1 BASIC assembles byte-for-byte against the reference and runs in a local console emulator. The native 6809E slice now handles immediate integer expressions, quoted-string PRINT, and single-letter scalar assignment/CLR. Stored programs, arrays, and string variables remain unported.

The intended deliverable is a native MC6809 application that can be loaded on a real CoCo with CLOADM/EXEC or LOADM/EXEC. The interpreter is being rewritten in native 6809E assembly.

## Reference candidate

Apple-1 BASIC is the selected initial target. Apple-1 has a compact keyboard/display interface and no Apple II graphics dependencies.

Files in `reference/` were retrieved on 2026-10-13 from:

- https://github.com/jefftranter/6502/tree/master/asm/a1basic
- `a1basic.s`: Eric Smith's disassembly, adapted by Jeff Tranter for ca65 and the Replica 1 image. Preserve its attribution comments.
- `a1basic.mon`: upstream monitor-format bytes.
- `a1basic.bin`: exactly 4096 bytes extracted from the monitor listing, mapped at $E000-$EFFF.
- `upstream-README.txt`: upstream notes describing the Replica 1 variant.

SHA-256 of `a1basic.bin`:
`5d8a3fe3c20c42903b226d67430c840ea5119557f88774c069e2e4dd80ad2c67`

This is a Replica 1 reference candidate, not yet authenticated against an original Apple-1 cassette image. The ca65/ld65 build matches this binary byte-for-byte. The upstream repository's license for Tranter-authored files does not by itself establish a license for Wozniak's interpreter or Smith's disassembly.

For Apple II instead, there is an annotated listing and downloadable project/binary set at https://www.6502disassembly.com/a2-rom/ . Its listing is based on the DOS 3.3 system master image; choose and fingerprint a specific version before porting.

## Proposed sequence

1. Authenticate and freeze the selected interpreter image. Assemble its source and require byte-for-byte equality with the chosen binary.
2. Build a deterministic headless Apple oracle with a tested NMOS 6502 core. Apple-1 needs RAM, BASIC, monitor dependencies, and PIA keyboard/display at $D010-$D013. Preserve readiness bits, input high bits, and read side effects; blindly replacing every I/O access with a host call can change behavior.
3. Run typed command transcripts on the oracle. Capture raw output, line listings, errors, and termination under an instruction budget. Check the oracle against an independent emulator before treating its output as authoritative. Candidates: https://github.com/zserge/bsoz (small C implementation) and https://github.com/st3fan/ewm (Apple-1 support and ROM provenance notes). The bsoz core is now built and passes its upstream functional test plus our console smoke checks; EWM has not been built here.
4. Create a 6809 RAM application using LWASM, initially restricted to 32K RAM and standard CoCo text I/O. Reserve a private direct page, buffers, BASIC workspace, and stack; avoid trampling resident Color BASIC variables. Choose addresses only after measuring translated code size. Put CoCo keyboard/output behind a small host interface, with a headless test implementation.
5. Translate routines in dependency order: console, initialization, decimal conversion, arithmetic, tokenizer/parser, variables/strings, program editing, control flow. Preserve token tables and computed-dispatch semantics. Track each source routine's mapped 6809 entry and test status.
6. Compare both implementations using identical transcripts: precedence, negative numbers, arithmetic overflow/division, syntax and runtime errors, numbered-line replacement/deletion, LIST/RUN, FOR/NEXT, GOSUB/RETURN, arrays/strings, and INPUT. Derive expected behavior from the original, not modern BASIC assumptions.
7. Package a CAS cassette image for CLOADM/EXEC, then WAV audio and a disk image for LOADM/EXEC. Test first in this emulator, then XRoar, then real hardware. Tape timing must not depend on this emulator's ROM shortcuts.

## Translation traps

- BASIC data keeps the original little-endian layout, using explicit byte access for numeric interpretation. The native 6809 instructions and ROM addresses use the CPU's normal conventions.
- 6502 subtraction carry means no borrow; 6809 subtraction carry means borrow. Audit every translated SBC and carry-dependent branch.
- Loads, transfers, and address arithmetic affect flags differently. A mnemonic substitution is insufficient when a later branch consumes those flags.
- Zero-page wrapping, page-one stack behavior, return addresses, and computed jump tables need explicit handling.
- Code relocation changes absolute pointers in tables. Distinguish data from instructions before translating; a linear disassembly is insufficient.
- Machine-specific PEEK/POKE/CALL addresses need a documented policy; language equivalence does not imply identical hardware addresses.

See ../../REVIEW.md for emulator correctness issues that could undermine validation.

## Build and run now

From this directory:

```sh
make test
make run
```

At the `>` prompt, type `PRINT 6*7`, or enter a program:

```basic
10 FOR I=1 TO 3
20 PRINT I
30 NEXT I
40 END
RUN
```

Exit with Ctrl-D on an empty input line or Ctrl-C. The console uses normal line input. Lowercase is converted to uppercase. Feed transcripts with `./build/apple1 build/a1basic.bin < program.bas`. Use LF line endings. The optional second argument sets the instruction budget (default 100 million); exhaustion exits with status 2. Successful EOF exits with status 0 only when BASIC requests another character, after executing the submitted command.

A C compiler, make, Python 3, ca65 and ld65 are needed for the full build/test. Local assembler binaries are already in ignored `.tools/` for this workstation. To rebuild tools elsewhere, install cc65 or build its pinned source:

```sh
git clone https://github.com/cc65/cc65.git /tmp/coco-cc65
git -C /tmp/coco-cc65 checkout e47ac5060b28a8be899871c814644aa04d21c221
make -C /tmp/coco-cc65 -j4 ca65 ld65
make CA65=/tmp/coco-cc65/bin/ca65 LD65=/tmp/coco-cc65/bin/ld65 test
```

You can run the existing reference without an assembler: `make build/apple1`, then `./build/apple1 reference/a1basic.bin`.

### Emulator scope and provenance

`oracle/vendor/bsoz.h` is the unchanged CPU core from https://github.com/zserge/bsoz at commit `66bdc4702a7216cbfebdd0d4a4ca67f362547cfc`. Its README declares MIT licensing and is included. Woz monitor bytes were extracted from that revision's `apple1/rom.h`. The upstream test harness and functional-test image are included under their original filenames/content (image renamed for clarity); its success trap is $3469. The linker config is cc65's `cfg/none.cfg` from the pinned revision above; its license is included.

`oracle/apple1.c` is our console adapter: 4K RAM, external BASIC at $E000, Woz monitor at $FF00, and immediately ready keyboard/display I/O. It enters BASIC directly rather than booting the monitor. It feeds scripted keys at the reference image's RDKEY polling instruction; RUN's break-key polling sees no queued future commands. This deliberately supports deterministic transcripts, not asynchronous BREAK or a cycle-accurate Apple-1 PIA/display/cassette. The RDKEY address is specific to this fingerprinted image. Confirm transcript behavior against an independent emulator before declaring the oracle authoritative for every language edge case.

`make test` checks reference assembly equality, the upstream 6502 functional test, and nine console scenarios including arithmetic, FOR/NEXT, GOSUB/RETURN, line replacement, errors, EOF, and runaway programs. Build products, listings, maps, and local assembler executables are ignored.

## Native expressions, stored programs, and branches

Run `make native-test` to assemble and test `native/prompt.asm`. The resulting `build/prompt.cas` is a cassette image of the native MC6809E application, with execution entry at $3000. Boot the web emulator to OK, use Tape to select this image, then type `CLOADM` and, when loading finishes, `EXEC`. The DECB binary remains an internal build/test artifact. It evaluates commands such as `PRINT 6*7`, `A=256`, and `PRINT A/2`. Numbered programs support editing, LIST/DEL/SCR, RUN, END, REM, GOTO, and numeric IF/THEN. Loops, subroutines, and dynamic variable/string/array storage remain incomplete. See [native/PORTING.md](native/PORTING.md) for current source correspondence and limits. Reset returns to Color BASIC.

The source translates the initial cold/memory/NEW/CLR and prompt paths, uses Color BASIC keyboard/output vectors, and preserves original little-endian BASIC data layout through explicit byte construction. Native scalar/buffer/program storage occupies $4000-$6FFF, with stack at $7F00. The input buffer is bounded at 127 bytes.

`coco-machine.js` contains the shared browser/headless machine. Its `loadDECB` validates RAM records before loading, and `readTextScreen` exposes text-screen RAM without OCR. The native tests boot actual CoCo ROMs, load the cassette through CLOADM/EXEC, type `PRINT 6*7` through the keyboard matrix, and verify 42 plus a stored program with conditional backward branching. Native layout checks verify scalar LE storage. `make native-behavior-test` checks 759 shared oracle cases against the actual binary via the logical-console runner. Browser interactions and real hardware have not been separately tested.

LWASM is built locally in ignored `.tools/`. Recreate it using https://github.com/stahta01/LWTools at commit `a00d389d0a1e47ea54834649d7cc86d17046b4af`, build with `make -j4 lwasm`, and pass its executable path as `make LWASM=/path/to/lwasm native-test`.

## Frozen golden transcripts and ROM coverage

`oracle/golden.jsonl` stores the original interpreter's exact console output and termination status for 1,566 isolated transcripts (566 directed cases and 1,000 seeded generated cases). Each case starts with fresh emulated RAM. Cases include program editing, listing, arithmetic boundaries, expressions, loops, subroutines, input, strings/arrays, errors, and a bounded runaway program. An error reported by BASIC is a valid observation, not a harness failure. Unsupported emulator instructions or host timeouts abort collection.

```sh
make golden-test       # Compare against saved results; never rewrite them.
make golden-record     # Explicitly regenerate saved observations.
# Larger collection, written separately for review:
python3 oracle/golden.py record --count 10000 --golden build/golden-10000.jsonl
```

The saved metadata fingerprints the ROM and identifies the CPU core, generator seed, and output convention. Regeneration is deliberate: do not update expected results automatically when the port disagrees. Review and minimize failing transcripts before changing either implementation.

`build/coverage.json` reports instruction entry coverage against instructions identified in the ca65 listing, uncovered addresses with assembly text, per-address execution counts, and ROM read coverage. Current instruction measurement: 1,532 / 1,545 entries (99.16%). See oracle/COVERAGE.md for the remaining ten apparent padding NOPs and three non-NOP entries awaiting reachability review. The rest includes tables/padding as well as unexecuted paths; 100% ROM-byte execution would be an invalid goal. ROM read counts include instruction fetches and operands, so they are not a pure data-table metric. This does not measure branch/condition coverage yet or prove correctness of the emulator. Semantic breadth, branch coverage, and independent emulator cross-checks remain necessary.

To compare a future native runner:

```sh
python3 oracle/golden.py compare --runner 'path/to/native-transcript-runner'
```

Runner contract: fresh machine per invocation, BASIC commands on stdin, a console transcript on stdout including input echo and prompts, status 0 at the next input wait after EOF, status 2 for a bounded runaway. Keep diagnostics on stderr. The future CoCo runner must capture logical output rather than screen wrapping/scrolling; the partial native milestone cannot pass full-language tests yet. Hardware-specific PEEK/POKE/CALL and random/time behavior will need explicit equivalence rules rather than silently accepting mismatches.

Expected output collection is observation, not independent validation: a bug in our 6502 emulator can otherwise become a golden result. Keep the upstream CPU test and curated numeric smoke expectations, and cross-check representative transcripts in a separate Apple-1 emulator before declaring the whole corpus authoritative. Expand tests toward uncovered routines and branch outcomes instead of relying on case count alone.

See [the coverage audit](oracle/COVERAGE.md) for current coverage, remaining addresses, and why the raw score is not claimed as 100%.

## Audited behavioral acceptance

Use `make test` for the current acceptance checks, or `make behavior-test` for the 873 portable language contracts. These combine specified results/errors/recovery with complete frozen transcripts. They exercise 93.46% of instruction entries and 81.74% of conditional-branch outcomes, and reject 21 selected behavioral ROM mutations. The earlier 99.16% exploratory score is a separate execution metric.

[TEST-AUDIT.md](oracle/TEST-AUDIT.md) documents corrected weak cases, the portable runner contract, mutation evidence, and remaining validation gaps. `build/behavior-coverage.json` links executed addresses to passing case ids; `build/exploratory-audit.json` classifies legacy observations. These scores measure evidence, not proof of complete equivalence.

Compare a native logical-console runner with `python3 oracle/behavior.py compare --runner 'path/to/runner'`. Do not substitute final screen text for the entire output transcript.

All 873 acceptance transcripts also match an independent NMOS 6502 core, [py65](https://github.com/mnaberez/py65), version 1.2.0 (BSD-3-Clause). Install its pinned dependency locally with `python3 -m pip install --target .tools/python -r oracle/requirements-crosscheck.txt`, then run `make oracle-crosscheck`, or `make verify-oracle` for the complete current validation. The device policy is shared, so this checks CPU-dependent observations without authenticating the historical image or physical hardware behavior. `build/mutation-report.json` contains the test-by-fault matrix; `build/behavior-coverage.json` contains instruction and branch witnesses.

`make oracle-gap` applies the [oracle-gap paper](https://arxiv.org/pdf/2309.02395) using a repeatable sample of branch and immediate-operand mutations, with raw and covered scores per ROM region. See [ORACLE-GAP.md](oracle/ORACLE-GAP.md) for methodology and limitations, and `build/oracle-gap.md` for the readable generated report. The broad sample is separate from the selected regression-fault checks.
