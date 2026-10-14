// Native-only memory convention check; deliberately separate from portable
// transcript acceptance. Original numeric structures must remain little-endian.
import assert from 'node:assert/strict';
import { runNative } from './runner.mjs';
for (const value of [1,255,256,32767,-1,-256,-32767]) {
    const result = runNative(`A=${value}\nPRINT A\n`);
    assert.equal(result.status,0);
    assert.ok(result.output.includes(`\n${value}\n`));
    assert.equal(result.machine.mem.read(0x4000), value & 0xff);
    assert.equal(result.machine.mem.read(0x4001), (value >> 8) & 0xff);
}
const cleared = runNative('A=256\nCLR\nPRINT A\n');
assert.equal(cleared.status,0);
assert.equal(cleared.machine.mem.read(0x4000),0);
assert.equal(cleared.machine.mem.read(0x4001),0);
console.log('Native scalar LE storage, signed byte boundaries, and CLR passed.');
