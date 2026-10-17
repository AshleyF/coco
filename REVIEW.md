# Initial emulator correctness review — 2026-10-13

This was a focused code inspection and Node test run, not a complete hardware-conformance audit.

## Fixed in this pass

- SAM clock rate was read from bits 14–15 instead of 11–12, and memory size from bits 12–13 instead of 13–14. Updated getters and tests to match $FFD6-$FFD9 and $FFDA-$FFDD. Reference: https://www.lomont.org/software/misc/coco/Lomont_CoCoHardware.pdf (SAM register map, pages 71–72).
- The keyboard release test contradicted the intentional short-tap queue. A press/release before the first scan must remain visible for that scan. Updated the test to check both delivery and subsequent release; no keyboard behavior changed.

Validation: `node tests/cpu.test.node.js` — 183/183 pass. Initially 181/182 passed. Browser UI and real hardware were not tested.

## High-priority remaining findings

1. **CWAI double-stacks state.** `cpu.js` pushes the entire state in the CWAI handler, but `checkInterrupts()` pushes another frame when accepting IRQ/FIRQ/NMI. An RTI then restores the wrong continuation/stack position. CWAI needs a distinct pre-stacked wait state; interrupt entry must reuse that frame (including full-state return for FIRQ).
2. **Interrupt dispatch is detached from instruction execution.** `step()`/`run()` never sample interrupt lines. `coco.js` checks IRQ once at frame start and immediately clears the CPU IRQ line, even if the PIA still has a pending flag. An IRQ masked at frame start cannot be accepted when code unmasks it later in that frame. Derive persistent CPU lines from peripheral flags and sample at instruction boundaries. Account for entry cycles in the scheduler.
3. **SYNC wakeup is incomplete.** It shares `waitingForInterrupt` with CWAI and only resumes when an unmasked interrupt is accepted. A masked interrupt should release SYNC without taking a vector. Distinguish synchronization from CWAI wait behavior.
4. **SAM page/RAM-size addressing remains incomplete.** SAM TY all-RAM selection, high RAM reads/writes, ROM/cartridge overlays, vectors and reset map restoration were added and tested on 2026-10-17 for the native 64K profile. The page bit and physical RAM-size aliasing are still not modeled; this is not a full SAM conformance claim.
5. **PIA inputs are treated as levels rather than transitions.** `setCA1`/`setCB1` latch flags each time the requested level matches polarity, without remembering the prior level. Reading a flag clear then submitting an unchanged input can spuriously interrupt. CA2/CB2 interrupt and handshake modes are also incomplete.

## Other limits relevant to validation

- Frame execution uses a fixed cycle budget; changing SAM rate currently has no scheduling effect, even with corrected getters. There is no scanline HSYNC source.
- Cassette handling bypasses routines at fixed Color BASIC ROM addresses. Alternate ROM revisions and actual hardware timing can differ; successful CLOADM through those shortcuts is not hardware validation.
- README's “full instruction set, cycle-accurate” claim is stronger than the current evidence, particularly interrupt timing and video/peripheral timing.
- Browser and Node tests are separate copies and can drift. Prefer shared cases with small environment adapters when extending conformance coverage.

CPU interrupt behavior should be checked against the Motorola programming manual linked in README and independent 6809 vectors before using this emulator as the sole judge of the native port.

## Carry arithmetic correction — 2026-10-14

The native Integer BASIC translation exposed incorrect ADC/SBC condition codes at byte boundaries. `_adc8` and `_sbc8` previously folded carry/borrow into the operand before computing flags. The helpers now keep the original operand for overflow/half-carry and include carry/borrow separately in the result. An independent signed-range/nibble-sum check exhausts all 256 × 256 × 2 combinations for ADCA, ADCB, SBCA, and SBCB (524,288 instruction executions). Before the fix all four exhaustive checks failed; afterward the Node suite passes 187/187. The shared cases are also included in the browser CPU suite.

Reference: Motorola M6809PM Appendix A, [ADC and SBC](https://www.maddes.net/m6809pm/appendix_a.htm). SBC half-carry is undefined and is not asserted. This correction does not resolve the separate interrupt/PIA/mapping findings above.

## Cassette waveform correction — 2026-10-15

The cassette's fast ROM shortcuts hid an incorrect audio format: one bits used
two cycles instead of one and bytes were sent most-significant bit first.
Encoding, decoding, simulated pulses and bit recording now use one cycle per bit,
least-significant bit first. Motor-off pauses playback instead of rewinding it.
Selecting the tape again rewinds it. The decoder also retains the final data bit.

Protocol references: [XRoar cassette documentation](https://www.6809.org.uk/xroar/doc/xroar.shtml#Cassettes)
and its `tape_byte_out` implementation in the official 1.12.1 source release.
Tests go beyond encoder/decoder agreement: unmodified Color BASIC ROMs load and
execute a native payload using PIA signal input with all cassette shortcuts off.
A separate PCM adapter supplies actual WAV samples without our decoder or pulse
generator. All 256 byte values also survive the WAV round trip exactly.
The full native BASIC application passes the same CAS/PCM loading paths, and
independent XRoar CAS/WAV tests recover every native segment and execute programs.
These checks improve tape validation; the interrupt, PIA and memory-map findings
above remain separate limits, and no physical cassette-cable test is claimed.

Program-tape SAVE/LOAD now exercise recording as well as reading. The accelerated
WRLDR path no longer drops leader bytes while recording: the existing byte-output
intercept records them. Native round-trip tests load that recording through the
ROM with tape shortcuts disabled, including raw WAV samples. Independent XRoar
also records the native SAVE command through its actual cassette DAC; the native
LOAD reads that waveform and runs the restored program. See
[program-tape verification](ports/integer-basic/native/TAPE.md).

## Native BASIC performance pass — 2026-10-15

The native port now uses direct-page private state, cheaper wrapped indexing,
conservative flag/carry optimization and fast guarded operand reads. Seven
workloads require about 32–39% fewer target cycles and engine code shrinks 22.5%.
At normal emulator speed Blackjack's deal drops from 27.7 to 17.2 seconds and
the dealer turn from 31.8 to 19.2 seconds; noticeable pauses remain. The original
game and ROM are unchanged. See [measurements and safeguards](ports/integer-basic/native/PERFORMANCE.md).

These changes optimize the native application, not the emulator's interrupt,
PIA or RAM-mapping issues listed above. The CPU and joystick regression suites
still pass; independent XRoar checks also run the optimized native binary.


## 64K native game support — 2026-10-17

The emulator now honors SAM TY ($FFDE/$FFDF) ROM/RAM selection while retaining
PIA/SAM I/O decoding. The reset path restores ROM visibility before fetching the
CPU reset vector. High RAM/ROM/cartridge/vector/I/O checks are in
`tests/memory-map.test.node.mjs`; CPU 187/187 and joystick regressions pass.
The existing 32K Integer BASIC binary is unchanged.

The separate native 64K build copies ROM and vectors into RAM, expands its arena
to $6000..$9FFF, stages program tapes at $C000..$FDFF and moves the native stack
to $FE00..$FEFF. Both the initial LDS and translated TXS use the new stack area.
Independent XRoar 64K CAS/WAV console and stored-program tests pass. Mayfield's
compact game passes original-ROM/native transcript comparisons and separate
application/program cassette loading through the ROM decoder, with shortcuts
disabled. Physical hardware remains untested. Page-bit addressing, RAM-size
aliasing, interrupts and other outstanding PIA issues remain separate findings.
