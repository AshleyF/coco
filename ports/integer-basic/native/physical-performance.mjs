// Normal-speed stock-ROM keyboard timing. Observe CHROUT; replace no CPU work.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../coco-machine.js';
import {readSymbols} from './console-runner.mjs';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const binary=readFileSync(option('--binary','build/prompt.bin'));
const symbols=readSymbols(readFileSync(option('--symbols','build/prompt.sym'),'utf8'));
const tape=readFileSync('build/blackjack-program.cas');
const machine=new CoCo();
machine.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);
machine.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);machine.reset();
for(let i=0;i<120;i++)machine.stepFrame();
machine.loadDECB(binary,{execute:true});
const cpu=machine.cpu,charout=cpu.read16(0xa002),keyin=cpu.read16(0xa000),step=cpu.step.bind(cpu);
let output='',awaiting=false;
cpu.step=()=>{
 if(cpu.pc===keyin&&cpu.read16(cpu.s)===symbols.t_key_read_return)awaiting=true;
 if(cpu.pc===charout&&cpu.read16(cpu.s)===symbols.t_console_out_return){awaiting=false;const c=cpu.a&127;output+=c===13?'\n':String.fromCharCode(c);}
 return step();
};
function wait(pattern){
 for(let frames=0;frames<30000;frames++){
  if(awaiting&&pattern.test(output)&&!machine._typeQueue?.length&&machine._typePhase!=='hold')return frames;
  machine.stepFrame();
 }
 throw Error(`Timed out ${pattern}\n${output}`);
}
wait(/>$/);
machine.cassette.loadCAS(tape);machine.cassette.interceptEnabled=false;
const phases=[];
function phase(id,input,pattern){
 output='';awaiting=false;machine.startTyping(input+'\n');const frames=wait(pattern);
 phases.push({id,frames,seconds:frames/60,output});console.log(`${id}: ${(frames/60).toFixed(3)} target seconds`);
}
phase('load','LOAD "BLACKJAK"',/LOADED\n\n>/);
phase('run','RUN',/YOUR NAME\?/);
phase('name','ASHLEY',/BET\?/);
phase('deal','10',/HIT\?/);
phase('dealer','N',/WINNINGS: 10\n\nBET\?/);
phase('quit','0',/END--STOPPED AT 30\n\n>/);
const sha=b=>createHash('sha256').update(b).digest('hex');
writeFileSync(option('--report','build/physical-performance.json'),JSON.stringify({native_sha256:sha(binary),program_cas_sha256:sha(tape),scope:'Normal-speed 60 Hz frames, physical keyboard and stock ROM I/O. Includes typing/key release. Program LOAD disables tape shortcuts; application loaded directly before timing.',phases},null,2)+'\n');
