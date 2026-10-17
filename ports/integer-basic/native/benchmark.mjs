// Deterministic target CPU cycles, not host wall time. Only the existing KEYIN
// ABI is supplied by the host; CHROUT and every BASIC algorithm still execute.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../coco-machine.js';
import {readSymbols} from './console-runner.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const binary=readFileSync(option('--binary','build/prompt.bin'));
const symbols=readSymbols(readFileSync(option('--symbols','build/prompt.sym'),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const cases=[
 ['counting-loop','10 FOR I=1 TO 600\n20 NEXT I\n30 PRINT I\n40 END\nRUN\n'],
 ['integer-arithmetic','10 A=0\n20 FOR I=1 TO 100\n30 A=A+((I*7)/3 MOD 97)\n40 NEXT I\n50 PRINT A\n60 END\nRUN\n'],
 ['arrays','10 DIM A(32)\n20 S=0\n30 FOR I=1 TO 32\n40 A(I)=I*7:S=S+A(I)\n50 NEXT I\n60 PRINT S;":";A(32)\n70 END\nRUN\n'],
 ['strings','10 DIM A$(20),B$(20)\n20 A$="ABCDEFGHIJ"\n30 FOR I=1 TO 100\n40 B$=A$(2,5)\n50 NEXT I\n60 PRINT B$;":";LEN(B$)\n70 END\nRUN\n'],
 ['subroutines','10 A=0\n20 FOR I=1 TO 100\n30 GOSUB 100\n40 NEXT I\n50 PRINT A\n60 END\n100 A=A+3:RETURN\nRUN\n'],
 ['parser-edit-list',Array.from({length:80},(_,i)=>`${(i+1)*10} A=${i}+2*3`).join('\n')+'\nLIST\n'],
 ['blackjack',readFileSync('demos/blackjack.bas','utf8')+'RUN\nASHLEY\n10\nN\n0\n'],
];
const sourceLabels=Object.entries(symbols).filter(([name])=>/^t_pc_[\da-f]{4}$/.test(name)).sort((a,b)=>a[1]-b[1]);
const sourceAt=new Uint16Array(65536);
for(let i=0;i<sourceLabels.length;i++){
 const [name,address]=sourceLabels[i];if(address>=0x4000)continue;
 const helpers=symbols.t_fast_get16bit??symbols.t_read_internal;
 const end=Math.min(sourceLabels[i+1]?.[1]??helpers,helpers);
 sourceAt.fill(parseInt(name.slice(5),16),address,end);
}
const profiles=[];
for(const [id,input] of cases){
 const original=spawnSync('build/apple1',['reference/a1basic.bin','100000000'],{input,encoding:'utf8'});
 assert.equal(original.status,0,original.stderr);
 const m=new CoCo();m.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);m.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);m.reset();
 for(let i=0;i<120&&!m.readTextScreen().includes('OK');i++)m.stepFrame();
 m.loadDECB(binary,{execute:true});
 const cpu=m.cpu,keyin=cpu.read16(0xa000),charout=cpu.read16(0xa002);
 const pcCycles=new Float64Array(65536),sourceCycles=new Float64Array(65536);
 let cursor=0,output='',cycles=0,steps=0,stackCycles=0,done=false;
 const marks={};
 for(;steps<100_000_000;steps++){
  if(cpu.pc===keyin){
   const polling=cpu.read16(cpu.s)===symbols.t_key_poll_return;
   if(!polling&&cursor===input.length){done=true;break;}
   let key=polling?0:input.charCodeAt(cursor++);if(key===10)key=13;
   cpu.a=key;cpu.flagZ=key===0;cpu.flagN=!!(key&128);cpu.flagV=false;cpu.pc=cpu.pullS16();continue;
  }
  if(cpu.pc===charout&&cpu.read16(cpu.s)===symbols.t_console_out_return){
   const ch=cpu.a&127;output+=ch===13?'\n':String.fromCharCode(ch);
   if(id==='blackjack')for(const [name,ending] of [['bet','BET?'],['hit','HIT?'],['nextBet','WINNINGS: 10\n\nBET?']])
    if(marks[name]===undefined&&output.endsWith(ending))marks[name]=cycles;
  }
  const pc=cpu.pc,op=cpu.read(pc),c=cpu.step();cycles+=c;pcCycles[pc]+=c;
  if(sourceAt[pc])sourceCycles[sourceAt[pc]]+=c;
  if(op>=0x34&&op<=0x37)stackCycles+=c;
 }
 assert.ok(done,`${id}: budget exhausted`);assert.equal(output,original.stdout,`${id}: original transcript changed`);
 const sum=(start,end)=>pcCycles.slice(start,end).reduce((a,b)=>a+b,0);
 const top=[...sourceCycles].map((c,a)=>({address:'$'+a.toString(16),cycles:c})).filter(x=>x.cycles).sort((a,b)=>b.cycles-a.cycles).slice(0,10);
 const row={id,input_sha256:sha(input),cycles,steps,seconds_at_894886_hz:cycles/894886,
  carry_helper_cycles:sum(symbols.t_invert_carry,symbols.t_bit_operand),
  internal_memory_helper_cycles:sum(symbols.t_read_internal,symbols.t_guard_arena),stack_instruction_cycles:stackCycles,
  noun_helper_cycles:symbols.t_fast_get16bit?sum(symbols.t_fast_get16bit,symbols.t_read_internal):0,
  original_transcript_matches:true,top_source_sites:top};
 if(id==='blackjack')row.phases={deal_cycles:marks.hit-marks.bet,dealer_cycles:marks.nextBet-marks.hit};
 profiles.push(row);console.log(`${id}: ${cycles} cycles; ${(cycles/894886).toFixed(3)} target seconds; carry ${(100*row.carry_helper_cycles/cycles).toFixed(1)}%, stack ${(100*stackCycles/cycles).toFixed(1)}%`);
}
const baselinePath=option('--baseline',null);
if(baselinePath){
 const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));
 for(const row of profiles){const before=baseline.cases.find(x=>x.id===row.id);assert.equal(before.input_sha256,row.input_sha256);row.before_cycles=before.cycles;row.speedup=before.cycles/row.cycles;assert.ok(row.cycles<=before.cycles*1.02,`${row.id}: cycle regression`);}
}
const report={native_sha256:sha(binary),reference_rom_sha256:sha(readFileSync('reference/a1basic.bin')),
 scope:'Target cycles; logical KEYIN supplied, actual CHROUT. Excludes human input waits and ROM keyboard scanning; physical timing is measured separately.',
 engine_bytes:symbols.t_code_end-0x0800,cases:profiles};
writeFileSync(option('--report','build/native-performance.json'),JSON.stringify(report,null,2)+'\n');
