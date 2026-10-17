import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CoCo} from '../../../coco-machine.js';
import {attachPCM} from '../../../tests/pcm-tape-source.mjs';
const machine=new CoCo();
machine.mem.loadROM(readFileSync(new URL('../../../roms/bas13.rom',import.meta.url)),0xa000);
machine.mem.loadROM(readFileSync(new URL('../../../roms/extbas11.rom',import.meta.url)),0x8000);
machine.reset();
const frames=n=>{for(let i=0;i<n;i++)machine.stepFrame();};
const screen=()=>machine.readTextScreen();
function waitFor(pattern) {
    for(let i=0;i<30_000;i++) {
        if(i%10===0&&pattern.test(screen()))return;
        machine.stepFrame();
    }
    assert.match(screen(),pattern);
}
function type(text,enter=true) {
    machine.startTyping(text);
    if(!enter)machine._typeQueue.pop();
    for(let i=0;i<30_000;i++) {
        machine.stepFrame();
        if(!machine._typeQueue.length&&machine._typePhase!=='hold') {frames(10);return;}
    }
    throw Error('Typing did not finish');
}
function key(key) {
    machine.keyboard.keyDown({key});frames(4);
    machine.keyboard.keyUp({key});frames(8);
}
frames(120);
const binary=readFileSync('build/prompt.bin');
const tapeMode=process.env.BASIC_TAPE_MODE||'fast';
if(tapeMode==='pcm')attachPCM(machine,readFileSync('build/prompt.wav'));
else {
    machine.cassette.loadCAS(readFileSync('build/prompt.cas'));
    if(tapeMode==='cas')machine.cassette.interceptEnabled=false;
}
type('CLOADM\n');waitFor(/F INTBASIC\s*\nOK\s*\n/);
for(let offset=0;binary[offset]===0;) {
    const length=binary.readUInt16BE(offset+1),address=binary.readUInt16BE(offset+3);
    assert.deepEqual(Buffer.from(machine.mem.ram.slice(address,address+length)),binary.subarray(offset+5,offset+5+length));
    offset+=5+length;
}
type('EXEC\n');waitFor(/>\s*$/);
type('PRINT 1',false);key('Backspace');key('2');key('Enter');
waitFor(/>PRINT 1_2\s*\n2\s*\n\s*\n>/);
type('PRINT 99',false);key('Escape');type('PRINT 7\n');
waitFor(/PRINT 7\s*\n7\s*\n\s*\n>/);
assert.doesNotMatch(screen(),/\n99\s*\n|SYNTAX ERR/);
type('AUTO 100\n');waitFor(/>100\s*$/);
type('PRINT 9\n');waitFor(/>110\s*$/);
type('END\n');waitFor(/>120\s*$/);
key('F12');key('Enter');waitFor(/>\s*$/);
type('LIST\n');waitFor(/>\s*$/);
assert.match(screen(),/100 PRINT 9/);
assert.match(screen(),/110 END/);
assert.doesNotMatch(screen(),/120 (PRINT|END|LIST)/);
type('RUN\n');waitFor(/>RUN\s*\n9\s*\n\s*\n>/);
type('SCR\n');waitFor(/>\s*$/);
for(const line of ['10 DIM A(2),B$(5)','20 B$="HI"','30 FOR I=1 TO 2',
    '40 A(I)=I*7:GOSUB 100','50 NEXT I','60 END','100 PRINT B$;A(I):RETURN']) {
    type(line+'\n');waitFor(/>\s*$/);
    assert.doesNotMatch(screen(),/ERR/);
}
type('RUN\n');waitFor(/HI7\s*\nHI14\s*\n\s*\n>/);
type('SCR\n');waitFor(/>\s*$/);
for(const line of ['10 A=0','20 A=A+1','30 GOTO 20']) {
    type(line+'\n');waitFor(/>\s*$/);
}
type('RUN\n');frames(120);key('p');
waitFor(/STOPPED AT (20|30)/);waitFor(/>P\s*$/);
type('RINT A\n');waitFor(/>PRINT A\s*\n[1-9]\d*\s*\n\s*\n>/);
console.log(`${tapeMode}: full native CLOADM/EXEC, segment bytes, backspace, arrays/strings/FOR/GOSUB, asynchronous stop and retained state passed.`);
