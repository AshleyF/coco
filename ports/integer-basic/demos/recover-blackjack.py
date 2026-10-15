"""Recreate pasteable source by asking the unchanged original ROM to LIST it."""
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'oracle'))
from py65_runner import ConsoleMemory, MPU, InputFinished, run

image = (HERE / 'blackjack.woz.txt').read_bytes()
assert hashlib.sha256(image).hexdigest() == 'bb6c5aaae3c6fb0f574568aeb56bcdae646c9595b75f8ed4dc6999047be53144'
memory = ConsoleMemory('LIST\n')
address = None
for line in image.decode('ascii').splitlines():
    if ':' not in line:
        continue
    head, data = line.split(':', 1)
    if head.strip():
        address = int(head, 16)
    for value in data.split():
        assert address is not None and 0 <= address < 0x1000
        memory.data[address] = int(value, 16)
        address += 1
cpu = MPU(memory=memory, pc=0xe2b3)  # Original warm entry preserves loaded program.
for _ in range(10_000_000):
    memory.instruction_pc = cpu.pc
    try:
        cpu.step()
    except InputFinished:
        break
else:
    raise AssertionError('Original LIST failed to finish')
listing = ''.join(memory.output).split('>LIST\n', 1)[1].rsplit('\n>', 1)[0]
lines = []
for line in listing.splitlines():
    match = re.match(r'^\s{0,4}(\d+) (.*)$', line)
    if match:
        lines.append(match[1] + ' ' + match[2])
    elif line.startswith('      '):
        lines[-1] += line[6:]  # LIST's six-column continuation indentation.
    else:
        assert not line, repr(line)
compact = []
for line in lines:
    number, body = line.split(' ', 1)
    quoted = False
    text = ''
    for char in body:
        if char == '"':
            quoted = not quoted
        if char != ' ' or quoted:
            text += char
    compact.append(number + ' ' + text)
source = '\n'.join(compact) + '\n'
assert max(map(len, source.splitlines())) < 128
# A fresh cold interpreter must reconstruct exactly the recovered LIST,
# including strings and line numbers; this catches lost spaces at wraps.
fresh = run(source + 'LIST\n', budget=50_000_000)
assert fresh['status'] == 0
assert fresh['output'].split('>LIST\n', 1)[1].rsplit('\n>', 1)[0] == listing
if '--write' in sys.argv:
    (HERE / 'blackjack.bas').write_text(source)
else:
    assert (HERE / 'blackjack.bas').read_text() == source
print(f'Recovered Blackjack source verified: {len(compact)} lines; original LIST round-trip identical.')
