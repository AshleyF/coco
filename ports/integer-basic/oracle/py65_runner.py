"""Independent NMOS 6502 core with the same logical-console device policy.

py65 1.2.0 is BSD-3-Clause, https://github.com/mnaberez/py65 . It is installed
locally under ignored .tools/python, not copied or modified by this adapter.
The shared PIA policy is intentional: this checks CPU-dependent observations,
not physical keyboard timing, terminal hardware, or historical authenticity.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.tools/python'))
try:
    from py65.devices.mpu6502 import MPU
except ImportError:
    raise SystemExit('Install cross-check dependency: python3 -m pip install --target .tools/python -r oracle/requirements-crosscheck.txt')


class InputFinished(Exception):
    pass


class ConsoleMemory:
    def __init__(self, source, event=None):
        self.data = bytearray(65536)
        self.data[0xe000:0xf000] = (ROOT/'reference/a1basic.bin').read_bytes()
        monitor = (ROOT/'oracle/vendor/wozmon.h').read_text()
        image = bytes(int(s,16) for s in re.findall(r'0x([0-9a-fA-F]{2})',monitor))
        self.data[0xff00:0xff00+len(image)] = image
        self.source = iter(source)
        self.pending = 0
        self.instruction_pc = 0
        self.output = []
        self.event = event
        self.event_ready = self.event_delivered = False
        self.event_tail = ''

    def __getitem__(self, address):
        if address == 0xd011:
            if self.event_ready and not self.event_delivered and not self.pending:
                self.pending = self.event['key'] | 0x80
                self.event_delivered = True
            if not self.pending and self.instruction_pc == 0xe003:
                try:
                    key = ord(next(self.source))
                except StopIteration:
                    raise InputFinished
                if 97 <= key <= 122: key -= 32
                if key == 10: key = 13
                self.pending = key | 0x80
            return 0x80 if self.pending else 0
        if address == 0xd010:
            key,self.pending = self.pending,0
            return key
        if address == 0xd012:
            return 0
        return self.data[address]

    def __setitem__(self, address, value):
        if address == 0xd012:
            key = value & 0x7f
            self.output.append('\n' if key == 13 else chr(key))
            if self.event and not self.event_ready:
                self.event_tail = (self.event_tail+self.output[-1])[-len(self.event['after']):]
                self.event_ready = self.event_tail == self.event['after']
        elif address < 0x1000 or 0xd010 <= address <= 0xd013:
            self.data[address] = value & 0xff


def run(source, budget=10000000, event=None):
    memory = ConsoleMemory(source,event)
    cpu = MPU(memory=memory,pc=0xe000)
    try:
        for _ in range(budget):
            memory.instruction_pc = cpu.pc
            cpu.step()
    except InputFinished:
        return {'output':''.join(memory.output),'status':0}
    return {'output':''.join(memory.output),'status':2}


if __name__ == '__main__':
    result = run(sys.stdin.read())
    sys.stdout.write(result['output'])
    raise SystemExit(result['status'])
