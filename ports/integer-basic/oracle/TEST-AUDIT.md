# Behavioral test audit — 2026-10-13

The earlier 99.16% score measures execution, not independently verified semantics. The exploratory snapshots remain useful differential observations, but they are no longer the sole acceptance criterion for the native port.

## Audited acceptance suite

`behavior.py` and `contracts.py` define 873 portable language contracts, frozen in `behavior.jsonl`. Every case has an id, feature, purpose, complete input, independently stated expectations, exact observed output, and expected termination. Arithmetic and boolean results are calculated independently; control-flow/array/string cases state their required results and ordering. Error cases specify the exact error category and subsequently execute a recovery command. Cases are isolated from one another.

All acceptance cases must:

- Produce exactly the expected sequence of numeric result lines, not merely contain a matching digit somewhere in echoed input.
- Produce exactly the listed diagnostic categories. A valid feature test cannot silently pass by reaching a SYNTAX error.
- Meet explicit string/listing/formatting observations and forbidden-output checks where relevant.
- Execute `PRINT "DONE!"` after the scenario and finish at the next prompt. This catches premature exits and failed error recovery.
- Match the entire frozen original console transcript, preserving whitespace, prompts, echo, order, and additional output. Numerical anchors complement this comparison rather than replace it.

The random-number case independently checks bounds, result count, and variation, while its frozen transcript also checks the exact deterministic cold-start sequence. This is a deliberate requirement to preserve the selected original RNG algorithm, not just any valid random generator.

Examples of observable state checks: overwrite a variable and read it again; store distinct array indices and verify they do not alias; inspect the loop variable after NEXT; nest GOSUBs and verify return order; replace/delete lines and check LIST plus subsequent RUN; verify a skipped conditional does not perform its assignment; retry invalid numeric INPUT and inspect the recovered value.

Definitions are checked against the saved baseline during comparison. Changing inputs or expectations requires an explicit, reviewable re-record. Comparison never updates expected output. Candidate mismatches include a bounded unified transcript diff.

## Corrections found during this pass

Several proposed success cases were not valid Apple-1 syntax. We corrected them before freezing the acceptance suite:

- Arrays use indices starting at 1; zero is a range-error scenario, not a successful element store.
- This image uses SCR to clear program text. NEW was producing a syntax error.
- Colon-separated statements and certain commands must be tested in numbered programs.
- TAB is a statement rather than the assumed PRINT TAB function form. Its column convention is tested explicitly.
- Numeric RETURN error behavior is tested inside a running program, not mistaken for the immediate-mode syntax error.
- Underscore is an editing character in the original input path, so the recovery marker avoids underscores.

The original interpreter, vendored CPU cores, and reference binary are unchanged. The console adapter adds branch-outcome instrumentation.

## Measured evidence

The audited contracts pass and execute **1,444 / 1,545 instruction entries (93.46%)**. `build/behavior-coverage.json` records the ids of passing cases witnessing each address. That identifies where execution evidence comes from; it does not prove each instruction has an independently discriminating assertion.

Twenty-one selected valid-ROM mutations are rejected by the semantic checks. Examples:

| Deliberate fault | Detecting contract |
| --- | --- |
| Addition dispatches to subtraction | precedence-and-parentheses |
| Multiplication dispatches to division | precedence-and-parentheses |
| Numeric equality dispatches to inequality | computed-expression-016 |
| String equality dispatches to inequality | empty-string-and-compare |
| One boolean operator dispatches to the other | boolean--32767-AND-0 |
| CLR does nothing | store-overwrite-and-clr |
| >= becomes >; <= becomes < | equal-operand comparison partitions |
| Nonempty string character comparison always reports equal | string-characters partitions |
| FOR/GOSUB nesting limit is seven instead of eight | for-depth-8; gosub-depth-8 |

`mutations.py` patches temporary copies of the ROM's dispatch table, one string-character comparison, nesting limits, and selected instruction operands, never the reference image. `build/mutation-report.json` records patch addresses and failure reasons. Twenty-one detected faults establish sensitivity to those faults; they are not comprehensive mutation coverage. The report includes every semantic detector and transcript-only detector, plus a feature-by-fault detection matrix. A mutation must have a semantic detector to pass.

Conditional-branch instrumentation observes **358 / 438 outcomes (81.74%)**, counting taken and not-taken separately for all 219 listing-defined branches. The denominator retains unobserved branches, including platform paths and invariant outcomes. `behavior-coverage.json` records the missing outcomes and the case ids observing each outcome. Feature counts and instruction reach are also reported; shared execution is not classified as incidental solely because it overlaps.

The expansion closes the four experimentally demonstrated blind spots in [ORACLE-REVIEW.md](ORACLE-REVIEW.md). Directed cases now cover all comparison order partitions, nonempty string equality and differences, signed division/MOD, CLR before reassignment, live independent storage, repeated RUN and RUN-with-line, edit shrink/grow, IF-to-line, FOR boundary and outer-NEXT behavior, eight-level nesting and overflow recovery, substring bounds, INPUT into empty strings and array elements, and multi-line token/page boundary sweeps with edit-and-rerun checks.

Compatibility observations are explicit: RUN-with-line clears variables; initially out-of-range FOR executes its body once; this selected image's MOD sign follows the product of operand signs; comparisons of widely separated signed endpoints can overflow during subtraction. These should be preserved by this image's port, rather than replaced silently with modern conventions.

## Readiness gaps

The current report still contains **101 uncovered instruction entries and 80 missing branch outcomes**. Some belong to platform operations or invariant/padding paths; others need further language scenarios. Keep each in the raw denominator until its status is explained. The suite is not a completeness certificate.

Next priorities are parser/editing and control-flow mutations, more tokenizer/input/console partitions, allocation-failure tests under an explicit portable memory-capacity profile, and an event-driven BREAK contract. The native logical-console adapter is implemented; stored-program, string/array, and control-flow language features are still pending. The earlier three remaining non-NOP instructions concern the separate legacy execution corpus, not these 101 acceptance gaps.

## Retained exploratory corpus

The 1,566 earlier snapshots remain in `golden.jsonl`, with their 99.16% execution report in `build/coverage.json`. An audit of these snapshots found:

- 25 cases containing syntax errors (34 syntax diagnostics total). Some are useful negative tests; they do not establish successful implementation of the feature in their name.
- 272 cases with platform or resource dependencies, including Apple-address PEEK/POKE/CALL, memory limits, or instruction-budget termination.
- Two budget-exhaustion cases. One is a deliberate infinite loop; the other needs investigation rather than acceptance as normal behavior.
- The unusual `PPED AT` diagnostic in the skipped-IF overflow cases still needs independent emulator confirmation before being required of a faithful port.

Every legacy case is classified as snapshot-only in `build/exploratory-audit.json`, with reasons attached where applicable. These observations are preserved, not silently deleted or rewritten to fit the new suite. The legacy `make golden-test` remains available, but is separate from portable language acceptance. `make targeted-test` checks special instruction paths separately.

## Native runner contract and remaining gaps

`behavior.py compare --runner 'path/to/runner'` uses the same stored cases, expectations, and full transcripts against another implementation. The runner must start with fresh language state, accept the entire input stream, emit logical console output before screen wrapping/scrolling, and stop at the next input wait after EOF. Native memory addresses, instruction counts, and register allocation are not compared. Status 0 is required for all audited cases; hangs are failures, not golden language results.

The generic runner path has been exercised against all 873 cases using the original emulator as an external command. The native port now uses logical output capture and passes its expression/scalar milestone projection. Full language acceptance remains incomplete; screenshots alone are insufficient.

These contracts are stronger evidence, but passing them does not prove a complete faithful port. Remaining work includes improving the measured branch/condition coverage, more error boundaries and interaction/stateful scenarios, hardware-policy tests, independent validation of the device policy and ROM provenance, and substantially more mutation coverage across parser/tokenizer/editing/error paths. Internal state should be compared through meaningful behavior (LIST, subsequent expressions, control flow) unless a routine-level test defines a portable abstraction; copying relocated raw pointers would be misleading.

All 873 frozen acceptance transcripts match **py65 1.2.0's independently implemented NMOS 6502 core**, including the signed MOD and control-flow observations. `build/crosscheck-report.json` records the fingerprint and results. The new Python console adapter follows the same device policy as the C runner: this cross-check does not independently validate keyboard timing, physical PIA/display behavior, or ROM authenticity. Historical ROM variants still require separate fingerprints and comparison. The skipped-IF diagnostic remains outside acceptance and was not included in this cross-check.

## Commands

```sh
make test                 # CPU test, audited contracts, targeted paths, mutations, smoke checks
make behavior-test        # Portable acceptance only
make behavior-record      # Deliberately re-record after reviewing changed definitions
make mutation-test
make exploratory-audit
make golden-test          # Legacy exploratory replay, separate from acceptance
python3 -m pip install --target .tools/python -r oracle/requirements-crosscheck.txt
make oracle-crosscheck    # Independent py65 CPU against every acceptance case
make verify-oracle        # All normal checks plus independent CPU comparison
```

## Applying the oracle-gap paper

[ORACLE-GAP.md](ORACLE-GAP.md) describes the new raw/covered gap analysis and the fixed 81-mutant sample. Against 873 cases, 76/81 sampled mutations are detected; 76/78 covered mutations are detected. The other three are uncovered, and two covered survivors remain unresolved. This broader sample is separate from the 21 selected regression faults. Four new portable tests were derived from sampled survivors: default AUTO increment, ESC line cancellation, TAB token listing, and mixed string/numeric INPUT. `make oracle-gap` generates a readable regional report and detailed JSON evidence.

## Native expression/scalar, stored-program, and branch milestones

The unchanged comparator and frozen baselines are used against `node native/runner.mjs`. The gated milestone (`make native-behavior-test`) contains 622 arithmetic/comparison/division/logic/literal-console cases, 11 scalar/error/editing cases, and 126 stored-program/branch cases. Eight new branch contracts were recorded against the original ROM; all 865 previous contract definitions and complete transcripts remain unchanged. They distinguish GOTO from RUN variable clearing, backward/forward jumps and skipped colon tails, false-IF validation without evaluation, missing-target recovery, THEN literal restrictions, nested IF, and conditional END. The full native report retains failures for unimplemented features. See [native/PORTING.md](../native/PORTING.md).
