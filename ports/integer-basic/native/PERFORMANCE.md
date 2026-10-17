# Native performance pass — 2026-10-15

The native MC6809 engine now uses 32–39% fewer cycles across seven deterministic
workloads, with unchanged complete transcripts against the frozen original ROM.
The engine and dispatch/helpers occupy 10,483 bytes, down from 13,529 (22.5%).
The cassette extension and memory layout are unchanged.

## Normal-speed Blackjack

These measurements use the actual CoCo keyboard matrix and stock ROM console,
at normal 60 Hz emulated time. They include typing and key release, not human
reaction time. The recovered historical game source and random sequence are
unchanged. The program is loaded through native LOAD, with tape shortcuts off.
Application loading itself occurs before timing.

| Action | Before | After |
| --- | ---: | ---: |
| RUN to name prompt | 3.45 s | 2.35 s |
| Bet 10 to HIT? | 27.70 s | 17.17 s |
| Stand to next BET? | 31.77 s | 19.18 s |
| Program tape LOAD | 11.30 s | 11.30 s |

These are target-machine times, not JavaScript wall-clock timings. Tape timing
is intentionally unchanged. Blackjack still pauses noticeably: its shuffle and
delay loops do real work, and the static port still spends cycles preserving
byte arithmetic and flags. Further large gains would require careful replacement
of more whole routines; this pass does not skip delays or special-case the game.

## Broad CPU measurements

Only logical KEYIN is supplied for this benchmark; actual CHROUT and every BASIC
algorithm execute on the target CPU. Thus it excludes ROM keyboard scanning and
human waits. Every complete output is compared to the unchanged original C
oracle. Cases exercise loops, arithmetic, arrays, strings, subroutines, program
entry/editing/LIST and a complete historical Blackjack session.

| Workload | Before cycles | After cycles | Reduction |
| --- | ---: | ---: | ---: |
| counting-loop | 6,616,099 | 4,112,663 | 37.8% |
| integer-arithmetic | 5,855,031 | 3,817,816 | 34.8% |
| arrays | 4,271,074 | 2,923,900 | 31.5% |
| strings | 5,870,755 | 4,006,076 | 31.8% |
| subroutines | 5,064,558 | 3,238,868 | 36.0% |
| parser-edit-list | 104,043,092 | 63,279,758 | 39.2% |
| blackjack | 119,190,366 | 75,338,107 | 36.8% |

## Changes and safeguards

- Use direct page $40 for private state and fixed U=$4080 for wrapped byte
  indexing. X and Y are native scratch registers. ROM I/O and user CALL enter
  with DP=0 and restore the engine's registers on return. Tape and demo bootstrap
  entry points explicitly restore DP/U.
- Remove redundant scratch-register saves. Conservative flag liveness removes
  saves only where subsequent code cannot observe the discarded flags. Calls,
  returns and unknown edges retain conservative requirements.
- Keep native borrow polarity through straight-line comparisons/subtraction;
  normalize at observable boundaries instead of inverting carry repeatedly.
- Read ordinary scalar/pointer nouns directly. Unusual indices fall back to the
  original translated routine, preserving malformed-expression behavior.
- Inline internal memory guards, retaining read-only grammar, zero for unbacked
  reads and ignored unbacked writes. Explicit PEEK/POKE still use the CoCo bus.

The optimization differential checks compare 205,056 instruction-boundary cases
(644 forms, all NZVC inputs, byte-index and pointer boundaries), plus 53,248 whole
noun-reader cases, against the captured pre-pass implementation. Carry polarity
is normalized at source boundaries; dead flags are excluded only according to
the conservative analysis. This is supplementary evidence: the 931 unchanged
portable contracts and 1,558 parser cases still compare to the original ROM.
An independent memory-policy test checks 524,288 read/write/address/flag cases.
Physical cassette tests, historical game transcripts and independent XRoar
checks cover the actual ROM I/O and target execution path. User CALL tests also
check DP=0 on entry and restoration after the callee clobbers DP/U.

## Reproduce

From `ports/integer-basic`:

```sh
make native-benchmark
node native/physical-performance.mjs
make verify-native
make native-xroar-test
python3 native/original-runtime/replay.py
```

`native/performance-baseline.json` preserves the pre-pass measurements and input
hashes. `make native-benchmark` checks those hashes and rejects a cycle increase
above 2% for any workload. Reports are `build/native-performance.json` and
`build/physical-performance.json`; they fingerprint the exact binary and inputs.
The pre-pass binary SHA-256 is
`74ad5ff039d62104dfac2be66bca93faf7df49a479805406e37a40e1c22e4c5a`;
the optimized binary is
`2f12b51b3c2bed47e93600f5016f9ba8cb4e86d1422bf9c2600efa8f52b336f8`.

For a future optimization, capture a new local differential baseline **before**
changing the generator:

```sh
make native-benchmark
cp build/prompt.bin build/perf-before.bin
cp build/prompt.sym build/perf-before.sym
cp build/runtime-optimization.json build/perf-before-optimization.json
cp build/native-performance.json build/perf-before.json
# Modify/rebuild the implementation, then:
make native-performance-check
```

The old binary/symbol snapshots are local build artifacts, not checked-in ROMs.
`native-performance-check` requires them; the normal benchmark and full regression
gates do not. Baseline equivalence cannot prove correctness by itself, and cycle
reduction is not a measure of language fidelity.
