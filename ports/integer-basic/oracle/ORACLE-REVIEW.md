# Golden oracle review — 2026-10-13

**Historical review snapshot:** the four demonstrated gaps below have since been closed. The expanded suite detects all four mutations. See [TEST-AUDIT.md](TEST-AUDIT.md) for current results; the original findings are retained here as evidence of why instruction coverage alone was insufficient.

The current acceptance suite is a useful foundation, but passing it is not yet strong evidence of a faithful 6809 port. This review found four deliberately broken implementations that pass every one of its 369 cases, including the complete frozen transcripts. The next investment should be discriminating behavioral cases, not a larger random case count.

## Demonstrated acceptance gaps

Experiments used temporary copies of the reference ROM and the existing `execute`, `assert_behavior`, and exact output/status comparisons. The original ROM, test definitions, and frozen baselines were unchanged. Detailed observations are in `../build/review-mutations.json` (generated, ignored by Git).

| Deliberate fault | Patch | Existing cases passing | Small distinguishing scenario |
| --- | --- | --- | --- |
| `CLR` does nothing | Redirect verb `$0C` to verb `$35`'s RTS handler | 369/369 | `A=7`, `CLR`, `PRINT A`: original prints 0; mutant prints 7. |
| `>=` behaves as `>` | Redirect verb `$18` to `$19` | 369/369 | `PRINT 1>=1`: original prints 1; mutant prints 0. |
| `<=` behaves as `<` | Redirect verb `$1A` to `$1C` | 369/369 | `PRINT 1<=1`: original prints 1; mutant prints 0. |
| String character comparisons always report equality | At `$E212`, replace `C5 E4` (`CMP p2`) with `D1 DA` (`CMP (aux),Y`), comparing the just-loaded character with itself | 369/369 | Assign `"AB"` and `"AC"` to strings and test equality/inequality: original reports unequal; mutant reports equal. |

Dispatch replacements copy both the low and high handler bytes from tables at `$EA10` and `$EA88`. These experiments establish specific blind spots; four survivors out of four chosen experiments is not a statistical estimate of all possible faults.

### 1. State changes need observations before the state is overwritten

`behavior.py:28` tests `CLR`, but then assigns `A=9` before reading A. That erases the observable difference between clearing variables and doing nothing. Add reads immediately after CLR, and check arrays, strings, program preservation, and subsequent RUN behavior according to the original interpreter's observed semantics. The same principle applies to errors: successfully printing `DONE!` proves prompt recovery, but not preservation or clearing of preexisting variables, program text, and control stacks.

### 2. Random comparisons omit crucial equality partitions

`behavior.py:64-74` generates operands independently in -100..100. In the current fixed corpus, neither `<=` nor `>=` receives equal operands, and neither numeric inequality spelling (`#`, `<>`) produces false. Include explicit less/equal/greater partitions for every comparison operator, both literals and variables. Include signed boundaries and byte carries separately; random small operands cannot establish their behavior. Preserve original error behavior where a boundary expression overflows internally rather than assuming modern mathematical semantics.

### 3. The string equality test only distinguishes lengths

`behavior.py:46` compares empty with empty, then empty with `"A"`. It never compares the characters of two nonempty strings. The character comparison loop at `$E206-$E21A` is uncovered by acceptance. Add equal nonempty strings, same-length strings differing at the first/middle/last character, and prefix pairs in both orders. Exercise the same observations after substring assignment and INPUT so storage and comparison interact.

## Breadth and coverage

The acceptance corpus has 207 arithmetic cases and 128 Boolean cases: 335/369, approximately 91%. It has only two string cases, five control-flow cases, three INPUT cases, and one variables case. These counts describe emphasis, not independent behaviors; each case may contain multiple observations.

Acceptance executes 1,418/1,545 listed instruction entries (91.78%), leaving 127 entries uncovered. The 99.16% figure and three remaining non-NOP entries describe the separate exploratory corpus. They must not be used as the behavioral acceptance score.

Prioritize these missing or thinly specified behaviors:

- Arithmetic: direct MOD, sign combinations, division/remainder boundaries, unary precedence, associativity, and overflow/recovery for each operation.
- Control flow: successful GOTO and IF-to-line, RUN with a line argument, FOR boundary/step cases, selecting an outer loop with NEXT, and stack limits plus recovery. Two levels of nesting do not establish the eight-entry limit.
- Editing/tokenization: backspace, cancel, line-length limits, keyword/variable distinctions, REM, whitespace, and replacing lines with longer/shorter bodies while verifying LIST and RUN.
- Storage: multiple live variables/arrays/strings, independent indexing, substring bounds, full capacity and capacity-plus-one, and preservation after failed operations.
- Interactions: edit an existing program, RUN it twice, mutate variables, recover from an error, then LIST/RUN again. Fresh-machine isolation is useful, but each scenario must also exercise meaningful persistent state.

Tests should identify their intended behavior and observable consequence. Address witnesses currently identify which passing cases *execute* an instruction; they do not establish that those cases would detect a defect there. Branch outcomes and targeted mutations would add evidence that instruction coverage alone lacks. The existing five mutations are coarse operator substitutions and all pass their detection checks; the four survivors above expose what that small sample misses.

## Portability and oracle trust

The external runner interface is a good start: fresh state, stdin input, logical console output, frozen expected results, and no raw relocated pointer comparison. However:

- `apple1.c:33` supplies input only at the original RDKEY location. Consequently this harness cannot specify asynchronous BREAK behavior during RUN. Add an explicit input-event mechanism with portable synchronization before claiming that behavior is tested.
- The native test currently checks a final screen and prompt. Build a native logical-console adapter and run shared prompt/input cases through both systems early; scrolling, keyboard queuing, EOF-at-input-wait, and control-character handling need a tested contract.
- Define which terminal details are language compatibility requirements and which are host presentation. Exact transcripts are valuable; screen wrapping and the physical representation of a backspace should not silently become dependencies on one display adapter. Document any normalization narrowly and test it.
- Resource and hardware behavior needs an explicit compatibility profile. Excluding literal Apple memory addresses is appropriate, but that exclusion should not remove language-level capacity, allocation-failure, or recovery tests. Test those through declared capacities and observable behavior.
- Only one CPU implementation currently produces the golden observations. The upstream CPU functional test and independent arithmetic assertions improve confidence, but do not independently validate the console adapter, historical ROM selection, or surprising diagnostics. Cross-check representative programs and quirks using a separate emulator and the same fingerprinted image before promoting uncertain observations into requirements.

## Validation and recommended order

`make test` passed during this review: CPU functional check, 369 acceptance cases, targeted probes, five existing mutation checks, and nine smoke checks. Each of the four additional mutations passed all 369 acceptance cases and changed the output of its distinguishing probe.

1. Add explicit contracts for the four demonstrated gaps and retain the mutations as regression checks.
2. Cover each language feature's normal, boundary, error, and recovery behavior; add stateful interaction scenarios.
3. Implement the native transcript adapter and prove shared prompt/input tests work through it.
4. Expand branch and mutation analysis around parser, storage, control-flow, and error routines, using surviving faults to guide additions.
5. Independently validate the oracle's unusual behaviors and chosen ROM variant.

The design already has useful safeguards: independent numerical expectations, exact frozen transcripts, recovery markers, definition/baseline consistency checks, and a clear separation between exploratory execution and acceptance. Preserve those while closing the demonstrated behavioral gaps.
