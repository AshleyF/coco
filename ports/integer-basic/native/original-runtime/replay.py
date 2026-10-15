"""Diagnostic legacy replay; not a replacement for portable behavioral contracts."""
import hashlib
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'oracle'))
from golden import execute

corpus=(ROOT/'oracle/golden.jsonl').read_bytes()
rows=[json.loads(line) for line in corpus.splitlines()]
artifact=ROOT/'build/prompt.bin'
digest=lambda:hashlib.sha256(artifact.read_bytes()).hexdigest()
before=digest()
selected=[]
excluded=[]
for case in rows[1:]:
    reason=None
    if re.search(r'\b(PEEK|POKE|CALL|LOMEM|HIMEM|PLOT|COLOR)\b',case['input']):
        reason='Requires an explicit platform memory/hardware profile'
    elif case['status']==2:
        reason='Original bounded nontermination: instruction counts differ by ISA'
    if reason:
        excluded.append({'id':case['id'],'reason':reason})
    else:
        selected.append(case)
def check(case):
    try:
        result=execute(case,'node native/runner.mjs')
        expected={key:case[key] for key in ['output','status']}
        return {'id':case['id'],'passed':result==expected,
                **({} if result==expected else {'expected':expected,'actual':result})}
    except RuntimeError as error:
        return {'id':case['id'],'passed':False,'error':str(error)}
with ThreadPoolExecutor(max_workers=3) as pool:
    results=list(pool.map(check,selected))
assert digest()==before,'Candidate changed during diagnostic replay'
report={'kind':'legacy snapshot diagnostic, not audited behavioral acceptance',
    'artifact_sha256':before,'corpus_sha256':hashlib.sha256(corpus).hexdigest(),
    'selected':len(selected),'passed':sum(r['passed'] for r in results),
    'failed':sum(not r['passed'] for r in results),'excluded':excluded,'results':results}
(ROOT/'build/native-original-replay.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"Legacy diagnostic: {report['passed']}/{len(selected)} matched; {report['failed']} mismatches; {len(excluded)} explicitly excluded.")
for result in results:
    if not result['passed']:print(result['id'])
raise SystemExit(bool(report['failed']))
