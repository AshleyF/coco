// No KEYIN/CHROUT replacement: real Color BASIC tape loader and keyboard matrix.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CoCo} from '../../../coco-machine.js';
const machine = new CoCo();
machine.mem.loadROM(readFileSync(new URL('../../../roms/bas13.rom',import.meta.url)),0xa000);
machine.mem.loadROM(readFileSync(new URL('../../../roms/extbas11.rom',import.meta.url)),0x8000);
machine.reset();
function frames(count) { for(let i=0;i<count;i++) machine.stepFrame(); }
function waitFor(pattern) {
    for(let i=0;i<30_000;i++) {
        if(i%10===0 && pattern.test(machine.readTextScreen())) return;
        machine.stepFrame();
    }
    assert.match(machine.readTextScreen(),pattern);
}
function type(text, extra=180) {
    machine.startTyping(text);
    for(let i=0;i<100_000;i++) {
        machine.stepFrame();
        if(!machine._typeQueue.length && machine._typePhase!=='hold') {
            frames(extra);
            return;
        }
    }
    throw Error('Keyboard typing did not finish');
}
frames(120);
machine.cassette.loadCAS(readFileSync(new URL('../build/blackjack.cas',import.meta.url)));
type('CLOADM\n',900);
assert.match(machine.readTextScreen(),/INTBASIC/);
type('EXEC\n');
assert.match(machine.readTextScreen(),/>/);
type('RUN\n');
waitFor(/YOUR NAME\?/);
type('ASHLEY\n');
assert.match(machine.readTextScreen(),/BET\?/);
type('10\n',900);
waitFor(/HIT\?/);
type('N\n',900);
waitFor(/WINNINGS: 10/);
waitFor(/BET\?\s*$/);
type('0\n');
assert.match(machine.readTextScreen(),/END--STOPPED AT 30/);
assert.match(machine.readTextScreen(),/>\s*$/);
console.log('Original Blackjack: CLOADM, EXEC, preloaded native program, complete hand, winnings, and quit passed.');
console.log(machine.readTextScreen());
