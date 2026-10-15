"""Prove repeated original CPU/RAM/input state, rather than infer a hang from time."""
import hashlib
import json
import operator
from pathlib import Path
from py65_runner import ConsoleMemory, MPU, InputFinished

def check(case):
    memory=ConsoleMemory(case['input'])
    cpu=MPU(memory=memory,pc=0xe000)
    for _ in range(1_000_000):
        memory.instruction_pc=cpu.pc
        cpu.step()
    checkpoint=cpu.pc
    seen={}
    for step in range(1_000_000):
        if cpu.pc==checkpoint:
            state=(cpu.a,cpu.x,cpu.y,cpu.sp,cpu.p,memory.pending,
                   operator.length_hint(memory.source),len(memory.output),
                   hashlib.sha256(memory.data).digest())
            if state in seen:
                return {'id':case['id'],'output':''.join(memory.output),
                        'checkpoint':checkpoint,'cycle_steps':step-seen[state]}
            seen[state]=step
        memory.instruction_pc=cpu.pc
        cpu.step()
    raise AssertionError('No repeated architectural state: '+case['id'])

cases=json.loads((Path(__file__).parent/'cycles.json').read_text())
try:
    print(json.dumps([check(case) for case in cases]))
except InputFinished:
    raise AssertionError('Expected a closed execution cycle, reached an input wait')
