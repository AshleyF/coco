"""Inventory known direct transfers and interpreter-dispatch entries.

This is evidence from the selected listing/image, not a reachability proof:
computed transfers, overlapping entry points, CALL, and modified RAM are possible.
"""
import json
from pathlib import Path
from golden import instruction_map, ROOT

rom = (ROOT / 'reference/a1basic.bin').read_bytes()
targets = [0xe710, 0xec50, 0xeec9, 0xefb3]
entries = instruction_map()
result = {}
for target in targets:
    refs = []
    for address in entries:
        offset = address - 0xe000
        opcode = rom[offset]
        destination = None
        if opcode in [0x20, 0x4c]:
            destination = rom[offset + 1] | rom[offset + 2] << 8
        elif opcode in [0x10, 0x30, 0x50, 0x70, 0x90, 0xb0, 0xd0, 0xf0]:
            delta = rom[offset + 1]
            destination = (address + 2 + (delta if delta < 128 else delta - 256)) & 65535
        if destination == target:
            refs.append({'address': f'{address:04X}', 'instruction': entries[address]})
    tokens = [f'{token:02X}' for token in range(120)
              if (rom[0xa10 + token] | rom[0xa88 + token] << 8) == target]
    result[f'{target:04X}'] = {'direct_references': refs, 'verb_dispatch_tokens': tokens}
path = ROOT / 'build/reachability.json'
path.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
