# Applying the oracle-gap paper

Reference: Jain, Kalburgi, Le Goues, and Groce, [Mind the Gap: The Difference Between Coverage and Mutation Score Can Guide Testing Efforts](https://arxiv.org/pdf/2309.02395), 2023, especially Sections II, IV, and VI.

The paper uses coverage minus mutation score to guide test effort, distinguishing raw scores from scores restricted to covered mutation sites. Its goal is actionable diagnosis, not a completeness certificate. We apply those definitions to listed 6502 instruction entries and fixed 256-byte ROM regions, rather than source lines/files. That is an adaptation of the unit of analysis, not a replication of the paper's experiments.

## Repeatable measurement

`make oracle-gap` first verifies the behavioral suite and refreshes fingerprinted coverage, then runs a deterministic mutation sample. The default uses seed 230902395 and samples up to three sites **per operator per region**, independently of whether tests cover or detect the site:

- Invert a conditional branch by exchanging its positive/negative condition.
- Flip bit 0 of an immediate operand for supported load, comparison, arithmetic, and logic instructions.

There are 81 mutants in the current fixed sample. The 23 hand-selected regression faults remain separate; their success rate must not stand in for a broader mutation score.

For each ROM region, the generated report includes instruction coverage, raw mutation score, covered mutation score, both gaps in percentage points, sample counts, and an investigation recommendation. No mutations in a region means **unknown**, not zero or 100%. Negative gaps are retained. Surviving mutants are retained until reviewed; we do not assume they are equivalent or assume each proves a missing assertion.

`build/oracle-gap.json` includes exact patches, original covering-case counts, how many cases were evaluated, the first detector, its reason, and whether detection came from explicit behavioral expectations, the frozen transcript alone, or execution/termination failure. All covering cases are evaluated for survivors. Uncovered sites need no mutant execution: changing a single unvisited instruction cannot change the deterministic prefix of a test. We retain those mutants in the raw denominator and exclude them from the covered denominator.

The reference ROM and frozen baselines are never changed by this analysis. ROM and suite fingerprints prevent mixing reports from different baselines. Input/output contracts remain portable; the mutations only measure sensitivity of those contracts against the original implementation.

## Acting on the findings

The initial sample against 840 cases found six covered survivors. Investigation produced four additional portable contracts:

| Survivor | Missing behavior | New contract |
| --- | --- | --- |
| `$E0B3` immediate comparison | Listing the TAB token at a token-table boundary | list-tab-token-and-execute |
| `$E28A` ESC comparison | Cancelling a partially typed line | escape-cancels-partially-typed-line |
| `$E7F1` default AUTO increment | Using AUTO without an explicit increment | auto-default-increment |
| `$EFC3` input sentinel | Switching from string to numeric INPUT | mixed-string-numeric-input |

The AUTO case is especially instructive: the old test executed the default-increment assignment, then replaced it with an explicitly supplied increment. Its failure to detect a bad default demonstrates incidental execution despite coverage.

The same four faults have been added to `mutation-test` as regression checks. Two covered survivors, `$E6C7` (a skipped-IF token threshold) and `$EBC0` (numeric INPUT parser stack initialization), still require analysis. They are not removed from the sample or labelled harmless.

The paired report uses the identical ROM and exact mutations before/after these four additions. E000-E0FF already had 100% instruction coverage; its sampled mutation detection improves after asserting TAB listing behavior. This is an improvement that instruction coverage alone cannot reveal. The report records new and lost detections, score changes, and the previous suite fingerprint.

```sh
make oracle-gap
# To compare against a saved snapshot made before a test change:
python3 oracle/oracle_gap.py --previous build/oracle-gap-before.json
```

`build/oracle-gap.md` is the readable current report; `build/oracle-gap.json` is the detailed data. Save a copy before changing tests if a paired comparison is wanted.

## Limits and next investigations

Three samples per operator/region are small. The results are not statistical bounds on oracle adequacy and are not directly comparable to the Java/C++/Go scores in the paper. The sample lacks instruction deletion, pointer/offset, dispatch, and many arithmetic mutations. Increasing `--per-region` broadens the sample without changing its rules, but a comparison requires the same exact mutations.

Large positive gaps and surviving covered faults direct us toward better assertions or missing input partitions. Uncovered faults direct us toward new scenarios. High scores on a small sample direct us toward broader mutation operators, rather than declaring the region complete. Crashes and budget failures are useful detections, but are reported separately from discriminating value/state assertions. Independent CPU agreement, branch outcomes, and feature contracts remain separate evidence.
