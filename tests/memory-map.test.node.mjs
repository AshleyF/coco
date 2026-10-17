import assert from 'node:assert/strict';
import {CoCo} from '../coco-machine.js';
import {readFileSync} from 'node:fs';
const m=new CoCo(),bus=m.mem;
bus.loadROM(readFileSync(new URL('../roms/bas13.rom',import.meta.url)),0xa000);
bus.loadROM(readFileSync(new URL('../roms/extbas11.rom',import.meta.url)),0x8000);
bus.loadCartridge(Uint8Array.from({length:0x3f00},(_,i)=>(i^0x96)&255));
for(let a=0x8000;a<0xff00;a++)bus.ram[a]=(a^0x5a)&255;
const rom=Array.from({length:0x7f00},(_,i)=>bus.read(0x8000+i));
bus.write(0xffdf,0);
for(let a=0x8000;a<0xff00;a++){assert.equal(bus.read(a),(a^0x5a)&255);bus.write(a,0x31);assert.equal(bus.read(a),0x31);}
for(let a=0xfff0;a<=0xffff;a++){bus.write(a,a&255);assert.equal(bus.read(a),a&255);}
assert.equal(bus.read(0xffdf),255,'SAM remains I/O in all-RAM mode');
bus.write(0xff01,4);assert.equal(m.pia0.ctrlA&4,4,'PIA remains I/O');
bus.write(0xffde,0);assert.deepEqual(Array.from({length:0x7f00},(_,i)=>bus.read(0x8000+i)),rom);
bus.write(0xffdf,0);m.reset();assert.equal(m.sam.bits&0x8000,0);assert.equal(m.cpu.pc,bus.read(0xfffe)*256+bus.read(0xffff));
console.log('64K SAM ROM/RAM banking: all high RAM bytes, ROM/cartridge preservation, vectors, I/O, and Reset passed.');
