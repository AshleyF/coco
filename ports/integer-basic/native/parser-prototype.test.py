"""Compare native parser tokens/errors directly with the unchanged ROM parser.

This is a routine-level development check, separate from portable language
contracts. The reference stop address is the instruction after Se491 returns.
"""
import json
import argparse
import re
import shlex
import subprocess
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'oracle'))
from py65_runner import ConsoleMemory, InputFinished, MPU


def reference(source):
    memory=ConsoleMemory(source+'\n')
    cpu=MPU(memory=memory,pc=0xe000)
    try:
        for _ in range(1000000):
            if cpu.pc==0xe2e1:
                start=memory.data[0xc8]+(cpu.p&1)
                end=memory.data[0xf1]+1
                return {'error':0,'start':start,'tokens':list(memory.data[0x200+start:0x200+end])}
            memory.instruction_pc=cpu.pc
            cpu.step()
    except InputFinished:
        errors=re.findall(r'(?m)^\*\*\* (.*?) ERR$', ''.join(memory.output))
        if not errors:raise AssertionError((source,''.join(memory.output)))
        return {'error':{'>32767':2,'TOO LONG':9,'SYNTAX':1}[errors[0]]}
    raise AssertionError(('reference budget',source,cpu.pc))

sources=['','PRINT 1','A=7','10 PRINT 7','BOGUS','PRINT 32768','PRINT (','DIM A1$(5)']
sources += ['PRINT '+'+'.join(['1']*n) for n in [1,20,40,41,42,45]]
sources += ['PRINT '+'('*n+'1'+')'*n for n in [1,10,12,13,14,20,35,55]]
sources += ['PRINT '+'ABS('*n+'1'+')'*n for n in [1,10,12,13,14,15,20]]
rows=[json.loads(line) for line in Path('oracle/behavior.jsonl').read_text().splitlines()]
for case in rows[1:]:
    for source in case['input'].splitlines():
        if len(source)<=127 and not re.search(r'[^\x20-\x7e]|_',source):
            sources.append(source)
sources=list(dict.fromkeys(sources))
arguments=argparse.ArgumentParser(description=__doc__)
arguments.add_argument('--runner',default='node native/parser-prototype.mjs')
arguments.add_argument('--report',default='build/parser-prototype-report.json')
args=arguments.parse_args()
result=subprocess.run(shlex.split(args.runner),input=json.dumps(sources),text=True,capture_output=True,check=True)
observed=list(map(json.loads,result.stdout.splitlines()))
assert len(observed)==len(sources)
failures=[]
for source,native in zip(sources,observed):
    original=reference(source)
    if native!=original:failures.append({'source':source,'original':original,'native':native})
Path(args.report).write_text(json.dumps({'runner':args.runner,'cases':len(sources),'matched':len(sources)-len(failures),'failures':failures},indent=2)+'\n')
print(f'{len(sources)-len(failures)}/{len(sources)} native parser token/error results match the ROM parser')
for failure in failures[:20]:print(failure)
raise SystemExit(bool(failures))
