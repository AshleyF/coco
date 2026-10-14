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
4. **64K RAM mapping is absent.** `Memory` always exposes BASIC ROM at $8000-$BFFF, blocks writes there, and ignores SAM TY/page configuration. The allocated 64K array is not equivalent to a 64K CoCo memory map. Implement and verify RAM/ROM overlays and vector behavior before using upper RAM for the port.
5. **PIA inputs are treated as levels rather than transitions.** `setCA1`/`setCB1` latch flags each time the requested level matches polarity, without remembering the prior level. Reading a flag clear then submitting an unchanged input can spuriously interrupt. CA2/CB2 interrupt and handshake modes are also incomplete.

## Other limits relevant to validation

- Frame execution uses a fixed cycle budget; changing SAM rate currently has no scheduling effect, even with corrected getters. There is no scanline HSYNC source.
- Cassette handling bypasses routines at fixed Color BASIC ROM addresses. Alternate ROM revisions and actual hardware timing can differ; successful CLOADM through those shortcuts is not hardware validation.
- README's “full instruction set, cycle-accurate” claim is stronger than the current evidence, particularly interrupt timing and video/peripheral timing.
- Browser and Node tests are separate copies and can drift. Prefer shared cases with small environment adapters when extending conformance coverage.

CPU interrupt behavior should be checked against the Motorola programming manual linked in README and independent 6809 vectors before using this emulator as the sole judge of the native port.
