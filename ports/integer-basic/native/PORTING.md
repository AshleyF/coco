# Native Apple-1 Integer BASIC for the CoCo

`make native` builds `build/prompt.bin`, `build/prompt.cas`, and `build/prompt.wav`.
Boot a 32K or larger CoCo to Color BASIC, select the CAS file using **Tape**, and
enter `CLOADM`, then `EXEC`. Entry is `$0800`. Reset returns to Color BASIC.
The WAV contains audio for the same cassette payload.

## Implementation and correspondence

The default application is a complete static MC6809 translation of the selected
original interpreter's algorithms. `native/original-runtime/build.py` consumes
the pinned ca65 disassembly/listing and generates `build/runtime-prototype.asm`;
LWASM assembles that source into the released binary. No 6502 instruction decoder
or CPU emulator runs on the CoCo. Source-address labels connect native routines
to the original. Original verb dispatch is rebuilt with native addresses.

Parsing, tokenization, expression evaluation, arithmetic, variable allocation,
arrays, strings, editing/LIST/AUTO, program execution, FOR/NEXT, GOSUB/RETURN,
conditional continuations, INPUT and error recovery execute in native code.
The original syntax tables remain data. COLOR and PLOT retain this selected ROM's
placeholder/check behavior; they do not add Apple II graphics.

The original numeric and token data layouts remain explicitly little-endian.
Native instruction operands, addresses and native dispatch words use the 6809's
normal conventions. The native A/B registers hold two original byte values; a
private byte holds the other byte index. Helpers preserve carry conventions,
byte wrapping, required flags and overlapping private workspace aliases.

The earlier handwritten implementation remains in `prompt.asm`, `expressions.asm`,
`programs.asm`, `storage.asm`, `io.asm` and `memory.asm` for comparison. It is not
linked into the default application. `make native-handwritten` and
`node native/handwritten-runner.mjs` build/run that earlier backend. Its historical
acceptance results must not be presented as evidence for the released binary.

## Memory and platform adaptations

| Region | Purpose |
| --- | --- |
| `$0800` through `t_code_end`, below `$4000` | Native interpreter, dispatch and helpers |
| `$4000-$42FF` | Relocated original private byte workspace, control frames and input buffer |
| `$4300-$4306` | Native helper state |
| `$4C00-$4DFF` | Original grammar data |
| `$5000-$57FF` | Initial 2 KiB variable/program arena |
| `$5800-$6FFF` | Available expansion through HIMEM |
| `$7E00-$7EFF` | Native hardware stack, initialized at `$7F00` |

Variables grow up from LOMEM; programs grow down from HIMEM. Initial usable
capacity matches the reference's 2 KiB arena. Memory commands accept native
addresses in `$5000-$7000`, protecting the interpreter and hardware stack.
Original allocator behavior remains, including ignored HIMEM decreases and the
partially allocated descriptor left by a failed DIM. Tests check retained values,
programs, live FOR frames, allocation errors and subsequent recovery.

PEEK/POKE use actual CoCo addresses. CALL runs native MC6809 instructions and
preserves the interpreter's registers, DP and flags around the call. An Apple
program containing 6502 machine code needs that code translated separately.

Internal pointers have a separate memory policy: relocated private RAM and arena
are writable, grammar data is read-only, and unbacked internal accesses read zero
or ignore writes. This follows the original oracle's console-memory profile.
Some accepted HIMEM/LOMEM/COLOR expressions underflow the noun stack; their
invalid internal pointers must not accidentally access CoCo ROM or SAM/PIA.
Those cases have explicit platform checks, separate from portable contracts.
Arbitrary POKE into interpreter state remains capable of corrupting the program.

Color BASIC KEYIN/CHROUT provide physical console I/O. Lowercase is uppercased;
CoCo backspace byte 8 maps to the original underscore-delete key; CLEAR byte 12
(Escape in the web keyboard) maps to Apple's Escape line cancellation. Logical output
is observed before the CoCo's physical 32-column wrapping. Original TAB/LIST
formatting therefore remains in the transcript, while the screen wraps sooner.
Program execution polls at original record boundaries; NEXT/RETURN continuations
retain their original polling behavior. A stopping key remains available at the
prompt, with variables and control frames retained.

## Verification

```sh
make verify-native  # Actual released binary: parser, language, layout, platform,
                    # fast/physical/PCM cassette paths, and historical Blackjack
make verify-oracle  # Unchanged ROM, CPU functional check, contracts, independent
                    # py65 agreement, targeted faults and broad mutation sample
python3 native/original-runtime/replay.py
node native/runner.mjs < commands.bas
```

The portable suite contains 931 frozen behavioral contracts. Each checks stated
results/errors/recovery and the complete original transcript. The native runner
only supplies the KEYIN ABI and observes CHROUT; it does not tokenize, evaluate,
edit, allocate or execute BASIC on the host. Independent py65 agreement checks the
original CPU oracle, with a deliberately shared console device policy.

The routine-level parser matrix executes the parser from the released binary,
comparing exact tokens or errors against the unchanged ROM on 1,558 source lines.
The legacy diagnostic replay separately matches 1,300 selected snapshots,
including deep expression/resource recovery. Its 266 explicit exclusions require
platform-address or instruction-budget-specific comparisons. Legacy snapshots
are supplementary observations, not a substitute for audited contracts.

The physical cassette tests boot stock CoCo ROMs, load every segment with CLOADM,
execute with EXEC, and exercise physical keys, backspace, programs, arrays,
strings, loops/subroutines, asynchronous stop and retained values. Two slower
paths disable every cassette ROM shortcut: CAS-generated FSK and the saved WAV's
actual PCM samples, supplied through PIA input. The PCM path bypasses both the
WAV-to-CAS decoder and CAS pulse generator. A small independent native payload
also verifies each tape path through the CoCo ROM's timing/checksum routines.

Historical Blackjack has two complete original/C/py65/native transcript checks
and a separate cassette game session. See [demos](../demos/README.md).

Reports include `build/native-acceptance.md/json`,
`build/native-original-parser.json`, `build/native-original-replay.json`, and
`build/behavior-coverage.json`. Binary, ROM and frozen-suite fingerprints guard
against stale or projected acceptance reports. Coverage and mutation detection
measure test evidence; they do not establish universal equivalence.

## Remaining limits

The selected 4 KiB Replica 1 reference image remains byte-for-byte frozen; its
provenance has not been authenticated against a particular surviving 1976 BASIC
cassette. This port targets that exact image, not every Apple-1/Apple-II variant.

PEEK/POKE/CALL addresses, usable memory bounds, screen width and keyboard hardware
are CoCo adaptations. Instruction counts and real-time speed differ by CPU.
Original Apple cassette-interface commands and machine-code games are not
implemented. Some malformed accepted expressions depend on the oracle's unbacked
memory policy and are documented/tested as platform quirks.

The CoCo ROM's loading and execution paths are tested in this emulator, including
actual PCM input with shortcuts disabled. An electrical playback test on a real
CoCo and an independent emulator remains useful hardware validation; no physical
machine test is claimed here. Use a normal CoCo cassette cable/audio source for
WAV playback and adjust volume as appropriate for that hardware.
