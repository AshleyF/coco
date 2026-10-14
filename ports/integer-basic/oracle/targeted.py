"""Coverage assertions for specific uncovered interpreter paths."""
import json
import re
import tempfile
from pathlib import Path
from golden import execute

with tempfile.TemporaryDirectory() as temp:
    coverage = Path(temp) / 'hits.json'
    for size in [15, 16, 17, 18, 20, 30]:
        case = {'id': f'skipped-print-{size}', 'budget': 2000000,
                'input': 'IF 0 THEN PRINT ' + ','.join(['1'] * size) + '\n'}
        observed = execute(case, None, coverage)
        hits = json.loads(coverage.read_text())['hits']
        assert observed['status'] == 0, observed
        assert bool(hits[0x710]) == (size >= 17), (size, hits[0x710])
        assert (' ERR\n' in observed['output']) == (size >= 17), observed
    # Establish that both normal boolean entry points execute, with the sign
    # fallback remaining skipped for the full boundary-value truth table.
    values = [-32767, -256, -1, 0, 1, 127, 256, 32767]
    commands = ''.join(f'PRINT ({a}) {op} ({b})\n'
                       for a in values for b in values for op in ['AND', 'OR'])
    observed = execute({'id': 'boolean-sign-path', 'budget': 10000000, 'input': commands}, None, coverage)
    hits = json.loads(coverage.read_text())['hits']
    assert observed['status'] == 0, observed
    assert ' ERR\n' not in observed['output'], observed
    assert hits[0xc40] and hits[0xc47] and not hits[0xc50]
    expected = [str(int((bool(a) and bool(b)) if op == 'AND' else (bool(a) or bool(b))))
                for a in values for b in values for op in ['AND', 'OR']]
    assert re.findall(r'(?m)^[01]$', observed['output']) == expected
print('Skipped-IF stack boundary and 128 boolean sign-path probes passed')
