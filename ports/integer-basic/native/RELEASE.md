# Cassette release verification — 2026-10-15

The native MC6809E implementation of the pinned Apple-1 BASIC image is the
default build. The interpreter and historical Blackjack demo are delivered as
CoCo CAS files and WAV audio. This is finite verification of that selected image,
with the platform limits below; it is not a claim of universal equivalence.

The website now serves the separately verified [40×24 graphics-console build](GRAPHICS.md),
SHA-256 `555586f911337c2bc297b7438a51a274de2977cab8ab69ff60d50e421976d327`.
It passes the 931 contracts, parser matrix, bitmap/physical cassette/game checks
and independent XRoar tests. The table and original release hash below document
the retained ROM-console build; graphics reports are separately named.

## Requirements and evidence

| Requirement | Verified evidence |
| --- | --- |
| Native CoCo application | Static 6809 assembly generated from the frozen original algorithms; assembled with `--6809`. No 6502 decoder runs on the CoCo. Both our machine and independent XRoar execute the resulting bytes. |
| Reusable behavioral contracts | All 931 unchanged portable contracts pass against `build/prompt.bin`, including explicit results/errors/recovery and complete transcripts. `build/native-acceptance.md/json` identifies every case and fingerprints the binary and suite. |
| Unchanged original oracle | Assembly still matches the 4,096-byte reference byte for byte. All 931 original transcripts match independent py65 1.2.0. `make verify-oracle` passes, including its CPU test and 23 selected semantic mutation checks. |
| Original syntax and resource behavior | The parser from the released binary matches exact tokens/errors for 1,558 source lines. The separate legacy replay matches 1,300 selected snapshots; its 266 platform/budget exclusions are individually recorded. |
| Known conditional-command quirks | Two diagnostic cases prove repeated CPU/RAM/input state in the original and native engines, with matching transcripts. These closed-cycle witnesses avoid inferring nontermination from an ISA-specific timeout. |
| Real console and cassette path | Physical-key tests cover backspace, Escape/CLEAR line cancellation, BREAK/Control-D AUTO cancellation with LIST/RUN recovery, arrays, strings, loops/subroutines, stopping a running program, retained keys/values and prompt recovery. All native segments load via CLOADM and run through EXEC. |
| Cassette audio independent of shortcuts | The CoCo ROM loads the whole application through both CAS pulses and actual WAV samples with every tape shortcut disabled. The PCM test bypasses our WAV decoder and pulse generator. |
| Independent target CPU and tape implementation | Four XRoar 1.12.1 runs cover CAS/WAV and console/stored-program scenarios, with tape acceleration and leader padding disabled. Every loaded native segment matches the release; arrays, strings, IF, FOR/NEXT, GOSUB/RETURN and a computed memory marker are checked. |
| Existing historical demo | Recovered Apple-1 Blackjack source round-trips through the original LIST exactly. Two complete sessions agree across C, py65 and native backends. A physical cassette test plays a hand and quits. |
| Apple-1 Star Trek demo | Bishop’s 1977 Apple Star-Trek runs with only two memory-address substitutions. Five C/py65/native sessions and three physical cassette paths match complete transcripts. All five new artifacts reproduce in a clean parallel build. Direct Mayfield-to-Bishop source descent remains unverified; see [history and evidence](../demos/STAR-TREK.md). |
| Reproducible build | A fresh parallel `make -j4 native demos` build, with no pre-existing generated files, produces identical bytes for all eight BIN/CAS/WAV artifacts, including the program-only Blackjack CAS/WAV. `build/clean-build.json` records hashes. Native boot/execution is tested separately. |
| Historical game program tapes | The 1,530-byte recovered Blackjack program is recorded by native SAVE. Fresh-interpreter LOAD/play/SAVE/SCR/LOAD/play passes for CAS and raw WAV input. Full listings and both game transcripts match the unchanged ROM in C and py65; `build/blackjack-program-test.json` fingerprints inputs and records transcripts. |
| Individual program tapes | CoCo-only prompt SAVE/LOAD use the stock cassette ROM. Token bytes, LIST/RUN, empty/multi-block files, atomic error recovery and raw PCM loading are tested. Independent XRoar records a SAVE waveform that the native LOAD reads and runs. See [TAPE.md](TAPE.md) for the 3,584-byte limit and missing-tape recovery. |
| Performance safeguards | Seven cycle benchmarks retain exact original transcripts, with 32–39% fewer cycles. Instruction/noun differential checks and exhaustive internal memory-policy checks supplement the original oracle contracts. Physical Blackjack timing and methods are in [PERFORMANCE.md](PERFORMANCE.md). |
| Documented adaptations | [PORTING.md](PORTING.md) describes memory, byte order, console width/keys, CALL, PEEK/POKE, memory limits, internal unbacked-memory behavior and remaining limits. [XROAR.md](XROAR.md) records the independent emulator's source/version and reproduction commands. |

The release binary SHA-256 is:

```text
2f12b51b3c2bed47e93600f5016f9ba8cb4e86d1422bf9c2600efa8f52b336f8
```

The frozen reference ROM SHA-256 is:

```text
5d8a3fe3c20c42903b226d67430c840ea5119557f88774c069e2e4dd80ad2c67
```

The acceptance, legacy replay, closed-cycle, independent-emulator and clean-build
reports have been checked against the current artifacts, not merely their names.
The broader oracle mutation sample detects 78/81 faults, including 78/80 covered
sites. Two covered survivors remain under investigation. These numbers measure
test sensitivity, not a percentage of language fidelity. Instruction coverage
and the remaining uncovered original addresses are documented separately in
[COVERAGE.md](../oracle/COVERAGE.md).

## Run and reproduce

From `ports/integer-basic`:

```sh
make native demos
make verify-native
make verify-oracle
python3 native/original-runtime/replay.py
make native-xroar-test
```

Use a 32K CoCo with Extended Color BASIC and no disk cartridge, matching the
tested profile. In the web emulator, select `build/prompt.cas` using **Tape**,
then type `CLOADM` and `EXEC`. For the game, select `build/blackjack.cas` instead,
type `CLOADM`, `EXEC`, then `RUN`. See [demo instructions](../demos/README.md).

The implementation targets the exact frozen Replica 1 reference; authentication
against a particular surviving 1976 BASIC cassette is not claimed. Apple-specific
machine-code calls and cassette hardware are not emulated by this native app.
Disk BASIC workspace compatibility and disk-image packaging are not established.
Program SAVE/LOAD are explicit CoCo extensions. Physical cassette-cable recording/playback on a real CoCo remains unverified. These limits
are explicit; the delivered cassette implementation and its tests are complete.
