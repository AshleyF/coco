import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoCo } from '../../../coco-machine.js';
const coco = new CoCo();
coco.mem.loadROM(readFileSync(new URL('../../../roms/bas13.rom', import.meta.url)), 0xa000);
coco.mem.loadROM(readFileSync(new URL('../../../roms/extbas11.rom', import.meta.url)), 0x8000);
coco.reset();
const frames = n => { for (let i = 0; i < n; i++) coco.stepFrame(); };
frames(120);
coco.cassette.loadCAS(readFileSync(new URL('../build/prompt.cas', import.meta.url)));
coco.startTyping('CLOADM\n');
frames(400);
assert.match(coco.readTextScreen(), /INTBASIC/);
// Compare every segment against the assembled binary after ROM cassette loading.
const binary = readFileSync(new URL('../build/prompt.bin', import.meta.url));
for (let offset = 0; binary[offset] === 0;) {
    const length = binary.readUInt16BE(offset + 1), address = binary.readUInt16BE(offset + 3);
    assert.deepEqual(Buffer.from(coco.mem.ram.slice(address, address + length)), binary.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
}
coco.startTyping('EXEC\n');
frames(160);
assert.match(coco.readTextScreen(), />/);
coco.startTyping('PRINT 6*7\n');
frames(160);
assert.match(coco.readTextScreen(), />PRINT 6\*7\s*\n42\s*\n\s*\n>/);
coco.startTyping('10 PRINT 123\n20 END\nRUN\n');
frames(400);
assert.match(coco.readTextScreen(), />RUN\s*\n123\s*\n\s*\n>/);
coco.startTyping('10 A=0\n20 A=A+1\n30 IF A<3 THEN 20\n40 PRINT A\n50 END\nRUN\n');
frames(900);
assert.match(coco.readTextScreen(), />RUN\s*\n3\s*\n\s*\n>/);
console.log('Tape image, ROM CLOADM/EXEC, physical keyboard PRINT, RUN, and conditional branching passed.');
