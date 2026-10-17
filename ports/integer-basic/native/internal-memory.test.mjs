// Exhaust the documented bus policy independently of the guard implementation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CoCo} from '../../../coco-machine.js';
import {readSymbols} from './console-runner.mjs';
const large=process.argv.includes('--large'),graphics=large||process.argv.includes('--graphics'),profile=large?'graphics64':graphics?'graphics':'prompt',reloc=graphics?0x1000:0;
const s=readSymbols(readFileSync(`build/${profile}.sym`,'utf8')),m=new CoCo();
m.loadDECB(readFileSync(`build/${profile}.bin`),{execute:false});
if(large)m.sam.bits|=0x8000;
const c=m.cpu,ram=m.mem.ram;
let count=0;
for(const write of [false,true])for(let address=0;address<65536;address++)for(const flags of [0,1,2,15]){
 const privateRAM=address>=0x4000+reloc&&address<0x4300+reloc;
 const grammar=address>=0x4c00+reloc&&address<0x4e00+reloc;
 const arena=address>=0x5000+reloc&&address<(large?0xa000:0x7000);
 const readable=privateRAM||grammar||arena,writable=privateRAM||arena;
 const byte=(address^0x5a)&255;
 if(readable)ram[address]=byte;
 const before=ram[address];
 c.pc=s[write?'t_write_internal':'t_read_internal'];c.dp=graphics?0x50:0x40;c.u=0x4080+reloc;
 // Keep the test's own return address/CC pushes away from the address probed.
 const stack=large?(address>=0xfeed&&address<=0xfeef?0xfec0:0xfef0):(address>=0x7eed&&address<=0x7eef?0x7ec0:0x7ef0);
 c.a=0xa5;c.b=0x6b;c.x=address;c.s=stack;c.pushS16(0x7fff);c.cc=0x50|flags;
 let steps=0;while(c.pc!==0x7fff&&steps++<100)c.step();
 assert.ok(steps<100,'Guard did not return');
 const value=write?0xa5:(readable?byte:0);
 const expectedFlags=write&&!writable?0x50|flags:(0x50|(flags&1)|(value===0?4:0)|(value&128?8:0));
 assert.equal(c.a,value,`A ${write} ${address}`);
 assert.equal(c.cc&0x5f,expectedFlags,`flags ${write} ${address}`);
 assert.equal(ram[address],write&&writable?0xa5:before,`memory ${write} ${address}`);
 assert.equal(c.x,address);assert.equal(c.b,0x6b);assert.equal(c.dp,graphics?0x50:0x40);assert.equal(c.u,0x4080+reloc);assert.equal(c.s,stack);
 count++;
}
console.log(`${count} guarded read/write cases passed: every 16-bit address, read-only grammar, unbacked memory and flags.`);
