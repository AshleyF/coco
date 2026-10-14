# Coverage audit — 2026-10-13

Current golden corpus: 1,566 fresh-machine transcripts, 1,532 / 1,545 listing-defined instruction entries executed (99.16%). These are observed interpreter behaviors, not proof of the emulator or language implementation. The raw denominator has not been reduced to achieve a higher score.

Ten uncovered entries are NOPs, apparently used as padding: $E16C, $EE4C, $EE4D, $EE52, $EED1, $EED2, $EFAF-$EFB2. These occur after return or unconditional transfer instructions. Their presence as assembly mnemonics in the listing does not establish that the language can reach them. CALL into arbitrary ROM addresses is not counted as language-driven coverage.

## Remaining uncovered non-NOP instructions

| Address | Instruction | Current status | Findings and next check |
| --- | --- | --- | --- |
| $EC50 | JMP $EFC9 | **Uncovered** | No identified direct transfer or verb-table entry. Normal AND/OR operands are normalized to 0/1, so the preceding BPL skips this fallback. All 128 targeted boolean probes pass without reaching it. Check historical versions and any overlapping entry before declaring it unreachable. |
| $EEC9 | CMP #$28 | **Uncovered** | Follows the unconditional jump at $EEC6; no identified direct transfer or verb-table entry targets it. Surrounding code differs between ROM variants. Authenticate those variants and inspect their entry paths. |
| $EFB3 | JSR $EFC9 | **Uncovered** | No identified direct transfer or verb-table entry in our image. The Sander/Smith variant source has an incoming jump/fallthrough absent from our Replica 1 variant. Assemble that variant and compare the actual bytes and dispatch paths. |

“Uncovered” means no observed instruction fetch at that address in the present suite. It does not by itself establish dead code. The findings above apply to the selected Replica 1 image, not automatically to Wozniak's original cassette implementation.

### Complete remaining uncovered set

The latest report contains 13 uncovered entries: the three non-NOP instructions above plus these ten NOP entries:

`$E16C`, `$EE4C`, `$EE4D`, `$EE52`, `$EED1`, `$EED2`, `$EFAF`, `$EFB0`, `$EFB1`, `$EFB2`.

Their position after returns/unconditional transfers suggests padding. Keep them in the raw denominator until overlapping/indirect entry analysis establishes their status.

Do not force PC to these addresses merely to report 100%. If we need register/memory fixtures for routine-level tests, report that coverage separately from BASIC transcript coverage and record all fixture preconditions and observations.

Coverage-directed additions include LIST/DEL ranges, AUTO and cancellation, editing controls, valid string INPUT programs, IF string comparisons, string slicing, TAB statements, runtime errors, nested FOR/GOSUB, memory exhaustion, numeric INPUT retry, and programs/arrays aligned across 256-byte boundaries. Generated comparisons use a fixed seed.

Some cases deliberately exercise syntax errors, and those remain useful compatibility observations. A syntax-error-only transcript is not evidence that its intended feature executed. The report's actual address hits, together with inspected outputs from successful directed cases, establish coverage.

`make golden-test` replays saved results; `build/coverage.json` gives uncovered addresses and raw hit/read counters. The report identifies instruction entries from the ca65 listing, not every byte in the 4K image. Instruction coverage is distinct from branch and condition coverage. Independent emulator comparison is still required before treating all snapshots as authoritative.

Source reference: reference/a1basic.s. Historical language reference: https://www.bitsavers.org/pdf/apple/apple_I/AppleI_BasicMan.pdf . This particular Replica 1 image can differ from original cassette versions; its fingerprint remains in the golden metadata.

## Detailed evidence for the three uncovered non-NOP instructions

`python3 oracle/reachability.py` generates `build/reachability.json`, scanning decoded direct calls/jumps/branches and all 120 verb-table entries in the actual binary. This does not rule out computed transfers or entries overlapping the listed instructions. Results:

- **$EC50:** Has no direct transfer or verb-table entry. Its ordinary entry is fallthrough from $EC4E, `BPL $EC1B`. The helper at $EFC9 calls NOT, increments X, then falls through to another NOT at $EFCD. NOT writes a normalized 0/1 value and zero high byte; AND/OR therefore combine normalized booleans, and the sign stays clear. STA preserves the sign flags, so BPL takes the branch and skips $EC50. This explains the gap under normal interpreter state; it does not establish the history or intended use of the fallback.
- **$EEC9:** No listed direct transfer or verb-table entry targets it. Immediately preceding it, $EEC6 unconditionally jumps to the memory-update routine. Checking only the named labels is insufficient, but scanning the actual dispatch addresses did not find an entry here either. Version history now matters: this area was changed between historical BASIC images.
- **$EFB3:** No listed direct transfer or verb-table entry targets it in our image. Willegal's multi-version source has an incoming JMP and an earlier fallthrough in the Sander/Smith variant; the Briel variant changes those surrounding memory routines and has an unconditional jump plus NOPs before this entry. That is concrete evidence that this address had incoming control flow in another variant. We have not assembled the alternate variant, so source comparison is evidence rather than binary authentication.

Mike Willegal's firsthand comparison describes four buildable variants: https://www.applefritter.com/content/build-able-source-4-versions-apple-1-basic . The multi-version source is https://www.willegal.net/appleii/a1basic.asm (inspected separately, not copied into this repository). Jeff Tranter explains adapting the Smith disassembly to match the Replica 1 bytes: https://jefftranter.blogspot.com/2012/05/source-code-for-apple-1-basic.html . Neither source establishes who made every historical byte change.

The appropriate conclusion is **one sign-path invariant needing historical explanation and two entries affected by variant-specific surrounding code**. Do not generalize this to Wozniak's original handwritten implementation, and do not label these three entries dead code. Next steps are independently assemble/authenticate the alternate variants, inspect the overlapping/indirect entries there, and investigate the remaining three non-NOP entries.

`make targeted-test` checks 128 AND/OR combinations against independently calculated boolean results. Both ordinary boolean entry points execute; $EC50 remains skipped. These are transcript tests, with no forced PC, register injection, or ROM patching.

## Reproducing this snapshot

ROM SHA-256: `5d8a3fe3c20c42903b226d67430c865ea5119557f88774c069e2e4dd80ad2c67`.

```sh
cd ports/integer-basic
make golden-test
make targeted-test
python3 oracle/reachability.py
```

The golden replay regenerates `build/coverage.json`; the reachability scan writes `build/reachability.json`. This audit is an interpreted snapshot and should be updated when those results change.

## Execution coverage versus behavioral acceptance

The 99.16% figure above belongs to the legacy exploratory corpus. The audited portable acceptance suite separately executes 1,444/1,545 entries (93.46%) and passes 873 independently anchored behavioral contracts. See [TEST-AUDIT.md](TEST-AUDIT.md) for assertion strength, quarantined observations, mutation tests, and remaining equivalence gaps. A passing-case witness is execution evidence, not proof that every instruction it touches is behaviorally distinguished by a test.
