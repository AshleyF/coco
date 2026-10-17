// Independent cell model versus actual native glyphs, byte packing and scrolling.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runNative,symbols as s} from './graphics-runner.mjs';
const boot=runNative(''),m=boot.machine,c=m.cpu;
assert.equal(boot.status,0);assert.equal(m.sam.videoMode,6);assert.equal(m.sam.videoOffset,0x800);
assert.equal(m.pia1.dataB&0xf8,0xf8);assert.ok(s.t_code_end<0x5000);
const code=Buffer.from(m.mem.ram.slice(0x2000,s.t_code_end));
const font=JSON.parse(readFileSync('native/terminal-font.json','utf8'));
let cells=Array.from({length:24},()=>Array(40).fill(32)),col=0,row=0,visible=true,cases=0;
function call(name,a=0){
 c.pc=s[name];c.s=0x7ef0;c.a=a;c.b=0x91;c.x=0x1234;c.y=0x5678;c.u=0x5080;c.dp=0x50;c.cc=0x51;c.pushS16(0x7fff);
 let steps=0;while(c.pc!==0x7fff&&steps++<100000)c.step();assert.ok(steps<100000,name+' return');
 if(name==='gt_write'||name==='gt_tick'||name==='gt_init'){
  assert.equal(c.a,a);assert.equal(c.b,0x91);assert.equal(c.x,0x1234);assert.equal(c.y,0x5678);assert.equal(c.u,0x5080);assert.equal(c.dp,0x50);assert.equal(c.cc,0x51);assert.equal(c.s,0x7ef0);
 }
}
function expected(){
 const pixels=Buffer.alloc(6144);
 const bit=(x,y)=>{pixels[y*32+(x>>3)]|=0x80>>(x&7);};
 for(let y=0;y<24;y++)for(let x=0;x<40;x++)for(let dy=0;dy<8;dy++)for(let dx=0;dx<6;dx++){
  let on=!!(font[cells[y][x]&63][dy]&(0x80>>dx));
  if(visible&&x===col&&y===row)on=!on;
  if(on)bit(8+x*6+dx,y*8+dy);
 }
 return pixels;
}
function check(){
 assert.equal(m.mem.ram[s.gt_col],col);assert.equal(m.mem.ram[s.gt_row],row);
 assert.deepEqual(Buffer.from(m.mem.ram.slice(0x800,0x2000)),expected(),`bitmap case ${cases}`);
 assert.deepEqual(Buffer.from(m.mem.ram.slice(0x2000,s.t_code_end)),code,'Console wrote into engine code');cases++;
}
function put(ch){
 call('gt_write',ch);ch&=127;
 if(ch===12){cells=Array.from({length:24},()=>Array(40).fill(32));col=row=0;}
 else if(ch===8){if(col>0)col--;else if(row>0){row--;col=39;}cells[row][col]=32;}
 else if(ch===13){col=0;row++;}
 else if(ch>=32){if(ch>=96)ch-=32;cells[row][col]=ch;if(++col===40){col=0;row++;}}
 if(row===24){cells.shift();cells.push(Array(40).fill(32));row=23;}
 visible=true;check();
}
put(12);
// Every glyph across all 40 columns, every packing phase and the bottom edge.
for(let i=0;i<1200;i++)put(32+i%64);
for(const ch of [8,8,13,8,12,8,0,10,65,66,8,67,13])put(ch);
for(let i=0;i<40;i++)put(88);put(13); // Exact-width line followed by CR.
for(let i=0;i<30;i++){put(48+i%10);put(13);} // Repeated scrolling.
for(let i=0;i<256;i++)call('gt_tick');visible=false;check();
for(let i=0;i<256;i++)call('gt_tick');visible=true;check();
m.reset();for(let i=0;i<180;i++)m.stepFrame();assert.equal(m.sam.videoMode,0);assert.equal(m.sam.videoOffset,0x400);assert.match(m.readTextScreen(),/OK/);
const sha=b=>createHash('sha256').update(b).digest('hex');
writeFileSync('build/graphics-terminal-test.json',JSON.stringify({native_sha256:sha(readFileSync('build/graphics.bin')),bitmap_cases:cases,passed:true,columns:40,rows:24,framebuffer_bytes:6144},null,2)+'\n');
console.log(`${cases} complete bitmap comparisons passed: glyph packing, 40x24 bounds, controls, cursor, scrolling, register preservation, code canary and reset.`);
