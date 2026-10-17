import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readGraphicsScreen} from '../native/graphics-screen.mjs';
const graphics=process.argv.includes('--graphics');
const {runNative,symbols}=await import(graphics?'../native/graphics-runner.mjs':'../native/runner.mjs');
import {CoCo} from '../../../coco-machine.js';
import {attachPCM} from '../../../tests/pcm-tape-source.mjs';
import {appleSource,cocoSource as textCocoSource,originalSource} from './star-trek-source.mjs';
const cocoSource=graphics?textCocoSource.replace('HIMEM=23808','HIMEM=27904'):textCocoSource;
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(readFileSync('demos/star-trek.original.bas')),'9fa8a2bdfbd49b2f169bfc393b282446d35d3ba9ef917072c92a1ca7b6f0420c');
assert.equal(cocoSource,appleSource.replace('LOMEM = 768',graphics?'HIMEM=27904':'HIMEM=23808').replace('Q=640:S=704:','Q=1536:S=1600:'));
const cases=[
 {id:'sensors-status-navigation',moves:'1\n5\n1\n1\n2\n0\n100,100\n',expected:['REMAINING KLINGONS =    7','SHORT RANGE SENSOR SCAN','LONG RANGE SENSOR SCAN','-- OUT OF GALAXY --']},
 {id:'phaser-battle',moves:'1\n0\n0,-16\n1\n3\n100\n4\n5\n1\n0\n100,100\n',expected:['CONDITION: RED!','2 UNITS OF PHASER DAMAGE','*** BOOM ***','REMAINING KLINGONS =    6','REMAINING ENERGY =      357','YOU LEFT 6 KLINGONS']},
 {id:'map-empty-weapons-local-move',moves:'1\n3\n4\n5\n0\n0\n1,0\n5\n1\n0\n100,100\n',expected:['NOTHING TO SHOOT AT!','GALACTIC MAP','REMAINING STARDATES =   15','REMAINING ENERGY =      499']},
 {id:'torpedo-and-energy',moves:'1\n0\n0,-16\n4\n5\n1\n0\n100,100\n',expected:['CONDITION: RED!','REMAINING TORPEDOES =   2','-- OUT OF GALAXY --']},
 {id:'energy-loss',moves:'1\n0\n0,-16\n3\n1000\n',expected:['FIRE ?1000','-- OUT OF ENERGY --','YOU LEFT 7 KLINGONS']},
];
function original(input){const r=spawnSync('build/apple1',['reference/a1basic.bin','100000000'],{input,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
const list=output=>output.split('>LIST\n')[1];
assert.equal(list(original(originalSource+'\nLIST\n')),list(original(appleSource+'LIST\n')),'Whitespace compaction must retain exact original tokens/LIST');
const results=[];
for(const c of cases){
 const input=appleSource+'RUN\n'+c.moves,output=original(input);
 const py=spawnSync('python3',['-c','import sys; sys.path.insert(0,"oracle"); from py65_runner import run; r=run(sys.stdin.read(),100000000); sys.stdout.write(r["output"]); sys.exit(r["status"])'],{input,encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);assert.equal(py.stdout,output,'Independent original CPU: '+c.id);
 c.transcript=output.split('>RUN\n')[1];assert.ok(c.transcript);
 for(const fragment of c.expected)assert.ok(c.transcript.includes(fragment),`${c.id}: missing ${fragment}`);
 const n=runNative(cocoSource+'RUN\n'+c.moves,{budget:100000000});assert.equal(n.status,0);
 assert.doesNotMatch(n.output,/ERR/);assert.equal(n.output.split('>RUN\n')[1],c.transcript,c.id);
 results.push({id:c.id,passed:true,transcript:c.transcript});console.log(c.id+': original C / independent py65 / native exact transcript passed.');
}
const cassetteResults=[];
for(const format of ['cas','wav','all-in-one']){
 const m=new CoCo();m.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);m.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);m.reset();
 const cpu=m.cpu,charout=symbols.gt_write??cpu.read16(0xa002),keyin=cpu.read16(0xa000),step=cpu.step.bind(cpu);let output='',awaiting=false;
 cpu.step=()=>{if(cpu.pc===keyin&&cpu.read16(cpu.s)===symbols.t_key_read_return)awaiting=true;
  if(cpu.pc===charout&&cpu.read16(cpu.s)===symbols.t_console_out_return){awaiting=false;const c=cpu.a&127;output+=c===13?'\n':String.fromCharCode(c);}return step();};
 function wait(pattern,screen=false){for(let i=0;i<60000;i++){
  if((screen||awaiting)&&pattern.test(screen?m.readTextScreen():output)&&!m.isTyping)return;m.stepFrame();
 }throw Error(`${format}: ${pattern}\n${output}\n${m.readTextScreen()}`);}
 function type(text){awaiting=false;m.startTyping(text+'\n');}
 function command(text,pattern=/>\s*$/){output='';type(text);wait(pattern);return output;}
 for(let i=0;i<120;i++)m.stepFrame();
 m.cassette.loadCAS(readFileSync(format==='all-in-one'?(graphics?'build/graphics-star-trek.cas':'build/star-trek.cas'):(graphics?'build/graphics.cas':'build/prompt.cas')));
 type('CLOADM');wait(/F (INTBASIC|STARTR[E]?K)\s*\nOK/,true);command('EXEC');
 if(format!=='all-in-one'){
  command(graphics?'HIMEM=27904':'HIMEM=23808');
  if(format==='wav')attachPCM(m,readFileSync('build/star-trek-program.wav'));
  else{m.cassette.loadCAS(readFileSync('build/star-trek-program.cas'));m.cassette.interceptEnabled=false;}
  command('LOAD "STARTREK"',/LOADED\n\n>/);
 }
 // RUN immediately after LOAD: no LIST or other command may prime the engine.
 output='';type('RUN');wait(/TYPE A NUMBER \?/);type('1');wait(/COMMAND \?/);
 type('5');wait(/COMPUTER REQUEST \?/);type('1');wait(/REMAINING ENERGY =      500\n\nCOMMAND \?/);
 type('1');wait(/SHORT RANGE SENSOR SCAN[\s\S]*COMMAND \?/);
 if(graphics){const screen=readGraphicsScreen(m);assert.match(screen,/SHORT RANGE SENSOR SCAN/);assert.equal((screen.match(/\+---\+---\+---\+---\+---\+---\+---\+---\+/g)||[]).length,2,'Both 33-column borders visible together');assert.equal(m.sam.videoMode,6);assert.equal(m.sam.videoOffset,0x800);}
 type('2');wait(/LONG RANGE SENSOR SCAN[\s\S]*COMMAND \?/);
 type('0');wait(/VECTOR \?/);type('100,100');wait(/YOU LEFT 7 KLINGONS\n\n>/);
 assert.equal(output,'RUN\n'+cases[0].transcript,`${format}: entire physical-input game transcript`);
 cassetteResults.push({format,passed:true});console.log(format+': physical cassette, RUN directly after LOAD, exact game transcript passed.');
}
writeFileSync(graphics?'build/graphics-star-trek-test.json':'build/star-trek-test.json',JSON.stringify({native_sha256:sha(readFileSync(graphics?'build/graphics.bin':'build/prompt.bin')),original_source_sha256:sha(readFileSync('demos/star-trek.original.bas')),reference_rom_sha256:sha(readFileSync('reference/a1basic.bin')),program_cas_sha256:sha(readFileSync('build/star-trek-program.cas')),results,cassetteResults},null,2)+'\n');
