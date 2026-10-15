# Complete original algorithm translation

`make native-original` builds `build/runtime-prototype.bin`, with entry `$0800`.
`make native-original-test` runs platform checks, physical cassette loading,
the entire frozen portable behavioral suite, and historical Blackjack contracts.
This is the default backend selected by `make native`. The release artifacts are
`build/prompt.bin`, `build/prompt.cas` and `build/prompt.wav`. See
[PORTING.md](../PORTING.md) for the current release pipeline and platform limits.

The generator consumes the pinned original disassembly and emits static native
MC6809 instructions. No 6502 opcodes are fetched or decoded at runtime. BASIC
parsing, editing, allocation, expression evaluation and execution all run on the
6809. Original grammar bytes remain data, and computed verb dispatch is rebuilt
as native 6809 addresses. Source address labels allow tracing back to the ROM.

The native A register holds the algorithm's accumulator, native B its byte index,
and a private byte holds its second byte index. Helpers handle carry convention,
flag preservation, eight-bit indexed wrapping and overlapping workspace aliases.
These are translations of this interpreter's algorithms, not a general 6502
binary translator or a CPU emulator.

| Native address | Purpose |
| --- | --- |
| `$0800` through `t_code_end` (below `$4000`) | Native interpreter and I/O helpers |
| `$4000-$42FF` | Relocated original byte workspace, control frames, input buffer |
| `$4300-$4306` | Native helper state |
| `$4C00-$4DFF` | Original syntax tables, data only |
| `$5000-$57FF` | Initial 2 KiB variable/program arena |
| `$5800-$6FFF` | Available arena expansion through HIMEM |
| `$7E00-$7EFF` | Native hardware stack; reset at `$7F00` |

Initial allocation capacity matches the reference's `$0800-$0FFF` region. Program
records grow downward from HIMEM and variables grow upward from LOMEM, retaining
the original allocator and its failures. Numeric data is explicitly little-endian;
native addresses and native instruction operands use normal 6809 conventions.
The private workspace preserves the original aliases, including absolute indexed
crossings between its byte page and control frames. Native hardware stack behavior
also reproduces the original deep-expression recovery path.

Platform adaptations:

- Color BASIC KEYIN and CHROUT supply the real CoCo keyboard and screen. Backspace
  byte 8 is mapped to Apple's underscore-delete key; CLEAR byte 12 maps to Escape
  line cancellation. Lowercase is uppercased.
- Program execution checks for waiting keys at the original control-flow points.
  A stopping key is retained for the command prompt.
- PEEK/POKE access actual CoCo memory. CALL executes native 6809 instructions and
  protects the interpreter's registers, direct page and flags around the call.
- Internal indirect accesses use the relocated BASIC workspace, syntax data and
  arena. Unbacked internal reads return zero and writes are ignored, following the
  oracle's console-memory profile. Syntax data remains read-only internally.
  For example, the original's accepted `ABS(HIMEM)` expression underflows its noun
  stack and reads an unbacked address. The port must not substitute CoCo ROM bytes
  or let an underflowed internal pointer drive SAM/PIA registers. Explicit
  PEEK/POKE retain their separate, actual CoCo bus behavior.
- LOMEM/HIMEM accept native addresses only within `$5000-$7000`, protecting the
  engine and stack. Their original algorithms otherwise remain, including the
  selected ROM's silently ignored HIMEM decreases and failed DIM descriptors.
- PLOT/COLOR retain the selected reference's placeholder/check behavior, not
  Apple II graphics or a newly invented CoCo graphics language.

Acceptance is reported in `build/native-original-runtime.json`, with fingerprints
of the exact ROM, frozen suite and native binary. A passing portable transcript
report does not by itself establish physical input, platform pointer policy or
hardware timing; the separate platform and cassette checks cover those aspects.
Historical game checks additionally run unchanged game source against the C
oracle and independent py65 core.

Validation includes all 931 frozen behavioral contracts. A separate diagnostic
replay matches all 1,300 selected legacy snapshots, including deep parser/resource
errors. Its 266 exclusions are recorded individually: platform-address-dependent
cases and original instruction-budget exhaustion require different comparisons.
This diagnostic replay is supplementary evidence, not an audited contract suite.
The physical cassette, platform and two historical game checks also pass.

Malformed HIMEM/LOMEM/COLOR getter reads have separate three-way platform checks;
they and arbitrary pointer-corrupting POKE operations must not be described as
portable contracts. No Apple-address machine code or
original cassette-interface hardware is provided by this native application.
