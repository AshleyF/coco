"""Render the full native acceptance result without changing any baseline."""
import hashlib
import json
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
report = json.loads((root/'build/native-acceptance.json').read_text())
if report['suite_sha256'] != hashlib.sha256((root/'oracle/behavior.jsonl').read_bytes()).hexdigest():
    raise SystemExit('Acceptance report is stale for the current frozen suite')
if report['cases'] != len((root/'oracle/behavior.jsonl').read_text().splitlines())-1:
    raise SystemExit('Acceptance report is a projection, not the entire current suite')
artifact = report.get('candidate_artifact')
if artifact and artifact['sha256'] != hashlib.sha256((root/artifact['path']).read_bytes()).hexdigest():
    raise SystemExit('Acceptance report is stale for the current native binary')
features = defaultdict(lambda: [0,0])
for result in report['results']:
    features[result['feature']][0 if result['passed'] else 1] += 1
lines = ['# Native acceptance report', '',
    f"{report['passed']}/{report['cases']} contracts passed; {report['failed']} failed.", '',
    'Each contract checks explicit behavioral assertions and the entire original transcript.',
    'Passing counts are not a percentage of interpreter fidelity.', '',
    f"Reference ROM SHA-256: `{report['reference_rom_sha256']}`.",
    f"Frozen suite SHA-256: `{report['suite_sha256']}`.", '',
    '| Feature | Passed | Failed |', '| --- | ---: | ---: |']
if artifact:
    lines[10:10] = [f"Native binary SHA-256: `{artifact['sha256']}`.", '']
for name,(passed,failed) in sorted(features.items()):
    lines.append(f'| {name} | {passed} | {failed} |')
failures = [r for r in report['results'] if not r['passed']]
if failures:
    lines += ['', '## Failures', '']
    for result in failures:
        lines += [f"### {result['id']}", '', '```text', result['reason'], '```', '']
lines += ['', 'Detailed evidence: `native-acceptance.json`. Platform-specific cassette,',
    'layout, and CALL/memory-policy tests are run separately by `make native-test`.', '']
(root/'build/native-acceptance.md').write_text('\n'.join(lines))
print('Wrote build/native-acceptance.md')
