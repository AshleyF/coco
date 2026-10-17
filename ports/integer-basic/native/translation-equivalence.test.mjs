// Compare translated instruction boundaries against a captured pre-optimization
// binary. X is address scratch; A/B/private Y, flags and BASIC memory are observable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../coco-machine.js';
import {readSymbols} from './console-runner.mjs';
const versions=['perf-before','prompt'].map(name=>{
 const binary=readFileSync(`build/${name}.bin`),symbols=readSymbols(readFileSync(`build/${name}.sym`,'utf8'));
 const machine=new CoCo();machine.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);
 machine.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);
 machine.loadDECB(binary,{execute:false});
 // Discover the internal DP/U ABI by executing only the generated bootstrap.
 machine.cpu.pc=symbols.t_boot;
 let bootSteps=0;
 while(machine.cpu.pc!==symbols.t_START&&bootSteps++<10000)machine.cpu.step();
 assert.ok(bootSteps<10000,'Bootstrap did not reach START');
 const manifest=name==='prompt'?'build/runtime-optimization.json':'build/perf-before-optimization.json';
 const optimization=existsSync(manifest)?JSON.parse(readFileSync(manifest,'utf8')):{carry_entries:{}};
 if(!existsSync(manifest))assert.equal(createHash('sha256').update(binary).digest('hex'),
  '74ad5ff039d62104dfac2be66bca93faf7df49a479805406e37a40e1c22e4c5a',
  'Capture perf-before-optimization.json alongside a new differential baseline');
 return {machine,symbols,binary,name,dp:machine.cpu.dp,u:machine.cpu.u,optimization};
});
const grammar=readFileSync('reference/a1basic.bin').subarray(0xc00,0xe00);
const optimization=JSON.parse(readFileSync('build/runtime-optimization.json','utf8'));
const privateBytes=Uint8Array.from({length:0x300},(_,i)=>(i*37+19)&255);
const arena=Uint8Array.from({length:0x2000},(_,i)=>(i*73+17)&255);
const supported=new Set(['LDA','STA','LDX','STX','LDY','STY','INC','DEC','ASL','LSR','ROL','CMP','CPX','CPY','ADC','SBC','AND','ORA','EOR','BIT']);
const branches=new Set(['BCC','BCS','BEQ','BNE','BPL','BMI','BVC','BVS']);
for(const op of branches)supported.add(op);
const rows=[],seen=new Set();
const originalLabels={},dataAddresses=new Set();
for(const line of readFileSync('build/a1basic.lst','utf8').split('\n')){
 if(!/^[0-9A-F]{6}  1/.test(line))continue;
 const address=parseInt(line.slice(0,6),16),text=line.slice(24).split(';')[0].trim();
 const label=/^(\w+):/.exec(text);if(label)originalLabels[label[1]]=address;
 const data=/\.byte\s+(.+)/.exec(text);
 if(data)for(let i=0;i<data[1].split(',').length;i++)dataAddresses.add(address+i);
}
for(const line of readFileSync('build/a1basic.lst','utf8').split('\n')){
 if(!/^[0-9A-F]{6}  1/.test(line))continue;
 const address=parseInt(line.slice(0,6),16),bytes=line.slice(11,24).trim().split(/\s+/);
 const text=line.slice(24).split(';')[0].trim().replace(/^\w+:\s*/,'');
 const [op,...parts]=text.split(/\s+/),arg=parts.join(' ');
 if(!supported.has(op)||!arg||arg==='DSP'||arg==='KBDCR'||arg==='KBD')continue;
 const next=address+bytes.length,label=`t_pc_${address.toString(16)}`,end=`t_pc_${next.toString(16)}`;
 if(versions.some(v=>v.symbols[label]===undefined||v.symbols[end]===undefined))continue;
 const key=op+' '+arg;if(seen.has(key))continue;seen.add(key);
 const target=branches.has(op)?originalLabels[arg]:undefined;
 const alternate=target===undefined?undefined:`t_pc_${target.toString(16)}`;
 if(branches.has(op)&&versions.some(v=>v.symbols[alternate]===undefined))continue;
 rows.push({address,op,arg,label,end,size:bytes.length,target,alternate});
}
const pointers=[0,0x2ff,0x4000,0x42ff,0x4bff,0x4c00,0x4dff,0x4fff,0x5000,0x6fff,0x7000,0xfffe];
let checked=0;
for(const row of rows)for(const a of [0,127,128,255])for(const index of [0,31,127,128,255])for(let flags=0;flags<16;flags++){
 // An out-of-range index beyond a source data table can read native code bytes,
 // which necessarily change when code is optimized. Those are not table entries.
 const table=/^(\w+)(?:([+-])(\d+))?,[XY]$/.exec(row.arg.replace('a:',''));
 if(table&&originalLabels[table[1]]>=0xe000){
  const offset=table[3]?Number(table[3])*(table[2]==='-'?-1:1):0;
  const base=originalLabels[table[1]]+offset;
  if(Array.from({length:index+1},(_,i)=>base+i).some(address=>!dataAddresses.has(address)))continue;
 }
 const states=versions.map(v=>{
  const {machine:m,symbols:s}=v,c=m.cpu,ram=m.mem.ram;
  ram.set(privateBytes,0x4000);ram.set(arena,0x5000);ram.set(grammar,0x4c00);
  ram[s.t_y]=index;
  const indirect=/^\((\w+)/.exec(row.arg);
  if(indirect){const ptr=pointers[(a+index+flags)%pointers.length],base=s['t_'+indirect[1]];ram[base]=ptr&255;ram[base+1]=ptr>>8;}
  c.pc=s[row.label];c.s=0x7ef0;c.a=a;c.b=index;c.x=0x1234;c.y=0x5678;c.u=v.u;
  c.dp=v.dp;
  c.cc=(0x50|flags)^(v.optimization.carry_entries[row.address]?1:0);
  let steps=0;
  do {c.step();steps++;}while(c.pc!==s[row.end]&&c.pc!==s[row.alternate]&&steps<1000);
  assert.ok(steps<1000,`${v.name}: ${row.label} did not reach next instruction`);
  const destination=c.pc===s[row.end]?row.address+row.size:row.target;
  let cc=c.cc;
  if(v.optimization.carry_entries[destination])cc^=1;
  // Dead flags may intentionally differ. All flags consumed by the continuation
  // and the interrupt masks must still agree with the captured implementation.
  const mask=0x50|(optimization.live_in[destination]??15);
  return {a:c.a,b:c.b,y:ram[s.t_y],cc:cc&mask,destination};
 });
 const context=`${row.label} ${row.op} ${row.arg} A=${a} index=${index} CC=${flags}`;
 assert.deepEqual(states[1],states[0],context);
 const ram=versions.map(v=>v.machine.mem.ram);
 for(const [start,length] of [[0x4000,0x300],[0x4c00,0x200],[0x5000,0x2000]])
  assert.equal(Buffer.compare(Buffer.from(ram[0].buffer,start,length),Buffer.from(ram[1].buffer,start,length)),0,context+' memory');
 checked++;
}
let routineCases=0;
for(let index=0;index<256;index++)for(let flags=0;flags<16;flags++)for(const pointer of [null,...pointers]){
 const states=versions.map(v=>{
  const {machine:m,symbols:s}=v,c=m.cpu,ram=m.mem.ram;
  ram.set(privateBytes,0x4000);ram.set(arena,0x5000);ram.set(grammar,0x4c00);ram[s.t_y]=255;
  const low=0x4000+((0x50+index)&255),high=0x4000+((0x78+index)&255);
  if(pointer===null){ram[low]=0x80;ram[0x4000+((0xa0+index)&255)]=0x7f;ram[high]=0;}
  else {ram[low]=pointer&255;ram[high]=pointer>>8;}
  c.pc=(s.t_fast_get16bit??s.t_get16bit);
  c.s=0x7ef0;c.pushS16(0x7fff);c.a=0xa5;c.b=index;c.x=0x1234;c.y=0x5678;c.u=v.u;
  c.dp=v.dp;c.cc=0x50|flags;
  let steps=0;while(c.pc!==0x7fff&&steps++<2000)c.step();
  assert.ok(steps<2000,`get16bit ${v.name} return`);
  return {a:c.a,b:c.b,y:ram[s.t_y],cc:c.cc&0x5f,s:c.s};
 });
 const context=`get16bit index=${index} CC=${flags} pointer=${pointer}`;
 assert.deepEqual(states[1],states[0],context);
 const ram=versions.map(v=>v.machine.mem.ram);
 for(const [start,length] of [[0x4000,0x300],[0x4c00,0x200],[0x5000,0x2000]])
  assert.equal(Buffer.compare(Buffer.from(ram[0].buffer,start,length),Buffer.from(ram[1].buffer,start,length)),0,context+' memory');
 routineCases++;
}
writeFileSync('build/translation-equivalence.json',JSON.stringify({
 baseline_sha256:createHash('sha256').update(versions[0].binary).digest('hex'),
 candidate_sha256:createHash('sha256').update(versions[1].binary).digest('hex'),
 distinct_instruction_forms:rows.length,cases:checked,passed:checked,
 noun_routine_cases:routineCases,noun_routine_passed:routineCases
},null,2)+'\n');
console.log(`${checked} instruction-boundary comparisons passed (${rows.length} forms, all NZVC inputs, signed-index and guarded-memory boundaries).`);
console.log(`${routineCases} full noun-reader comparisons passed (all 256 indices, flags, pointer boundaries and malformed-index fallback).`);
