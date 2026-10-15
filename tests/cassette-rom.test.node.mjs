// Independent of CAS/WAV decoder round trips: the actual Color BASIC ROM
// must recover our FSK waveform through PIA input, without ROM shortcuts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CoCo} from '../coco-machine.js';
import {buildCAS,buildHeader,casToWAV} from '../cassette.js';
import {attachPCM} from './pcm-tape-source.mjs';
const machine=new CoCo();
machine.mem.loadROM(readFileSync(new URL('../roms/bas13.rom',import.meta.url)),0xa000);
machine.mem.loadROM(readFileSync(new URL('../roms/extbas11.rom',import.meta.url)),0x8000);
machine.reset();
const frames=n=>{for(let i=0;i<n;i++)machine.stepFrame();};
frames(120);
const payload=Uint8Array.from([0x86,42,0xb7,3,0x20,0x39]);
const blocks=[{type:0,data:buildHeader('FSKTEST',2,0,0x3000,0x3000)},
    {type:1,data:payload},{type:0xff,data:new Uint8Array()}];
const cas=buildCAS(blocks);
const wav=casToWAV(cas);
for(const format of ['CAS','WAV','PCM']) {
    machine.reset();frames(120);
    machine.mem.ram.fill(0,0x3000,0x3006);
    machine.mem.ram[0x320]=0;
    machine.cassette.interceptEnabled=false;
    if(format==='CAS')machine.cassette.loadCAS(cas);
    else if(format==='WAV')machine.cassette.loadWAV(wav);
    else attachPCM(machine,wav);
    machine.startTyping('CLOADM\n');
    for(let i=0;i<2400;i++) {
        machine.stepFrame();
        if(i>120&&/F FSKTEST\s*\nOK/.test(machine.readTextScreen())&&!machine.cassette.motorOn)break;
    }
    assert.deepEqual([...machine.mem.ram.slice(0x3000,0x3006)],[...payload],
        `${format}: original ROM did not decode the executable payload`);
    assert.doesNotMatch(machine.readTextScreen(),/\?IO ERROR/);
    machine.startTyping('EXEC\n');frames(120);
    assert.equal(machine.mem.ram[0x320],42,`${format}: cassette execution failed`);
    console.log(`${format}: Color BASIC decoded FSK through PIA and executed native payload; no ROM intercepts.`);
}
