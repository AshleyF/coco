"""Deployment copy: keep attribution REMs; preserve the annotated source separately.

Removed remark labels are redirected to the following surviving statement.
Whitespace compaction never touches quoted text or retained attribution.
"""
from pathlib import Path
import re,bisect
HERE=Path(__file__).resolve().parent
lines={int(n):body for n,body in (l.split(' ',1) for l in (HERE/'STTR1.integer.bas').read_text().splitlines())}
keep={n:b for n,b in lines.items() if not b.startswith('REM') or n in (3,5,26,120,140)}
numbers=sorted(keep)
def redirect(m):
 target=int(m[2])
 if target in lines and target not in keep:target=numbers[bisect.bisect_left(numbers,target)]
 return m[1]+str(target)
out=[]
for n,body in sorted(keep.items()):
 if not body.startswith('REM'):
  parts=re.split(r'("[^"]*")',body)
  for i in range(0,len(parts),2):
   parts[i]=re.sub(r'\b((?:GOTO|GOSUB|THEN)\s+)(\d+)',redirect,parts[i])
   parts[i]=parts[i].replace(' ','')
  body=''.join(parts)
 out.append(f'{n} {body}')
(HERE/'STTR1.compact.bas').write_text('\n'.join(out)+'\n')
