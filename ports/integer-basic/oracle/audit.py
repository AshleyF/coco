"""Classify the legacy exploratory snapshots without upgrading their evidence."""
import json
import re
from collections import Counter
from golden import ROOT

rows=[json.loads(line) for line in (ROOT/'oracle/golden.jsonl').read_text().splitlines()]
report=[]
for case in rows[1:]:
    errors=re.findall(r'(?m)^\*\*\* (.*?) ERR$',case['output'])
    issues=[]
    if re.search(r'\b(PEEK|POKE|CALL|LOMEM|HIMEM|PLOT|COLOR)\b',case['input']):
        issues.append('platform-or-memory-map-dependent; define native capability before comparing')
    if case['status']==2:
        issues.append('instruction-budget-dependent; not a portable timeout contract')
    if 'SYNTAX' in errors:
        issues.append('contains syntax errors; does not alone validate the feature named by its id')
    if case['id'].startswith('skipped-print-stack-'):
        issues.append('unusual error text; needs independent emulator confirmation')
    report.append({'id':case['id'],'validation':'snapshot-only','issues':issues,
                   'errors':errors,'status':case['status']})
summary={'cases':len(report),'snapshot_only':len(report),
         'with_syntax_errors':sum('SYNTAX' in c['errors'] for c in report),
         'budget_exhaustions':sum(c['status']==2 for c in report),
         'platform_or_resource_dependent':sum(any('dependent' in issue for issue in c['issues']) for c in report),
         'error_counts':dict(Counter(error for case in report for error in case['errors'])),
         'cases_detail':report}
(ROOT/'build/exploratory-audit.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='cases_detail'},indent=2))
