import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../../coco-machine.js';
import {symbols} from '../../native/large-runner.mjs';
import {readGraphicsScreen} from '../../native/graphics-screen.mjs';
const m=new CoCo();m.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);m.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);m.reset();
let frames=0;let output='',waiting=false;const step=m.cpu.step.bind(m.cpu);
m.cpu.step=()=>{if(m.cpu.pc===m.cpu.read16(0xa000)&&m.cpu.read16(m.cpu.s)===symbols.t_key_read_return)waiting=true;
 if(m.cpu.pc===symbols.gt_write&&m.cpu.read16(m.cpu.s)===symbols.t_console_out_return){output+=String.fromCharCode(m.cpu.a&127).replace('\r','\n');waiting=false;}return step();};
function wait(re,screen=false){for(let i=0;i<60000;i++){if((screen||waiting)&&re.test(screen?m.readTextScreen():output)&&!m.isTyping)return;m.stepFrame();frames++;}throw Error('Timeout '+re+'\n'+output.slice(-2000));}
function type(s){waiting=false;m.startTyping(s+'\n');}
for(let i=0;i<120;i++)m.stepFrame();m.cassette.loadCAS(readFileSync('build/graphics64.cas'));m.cassette.interceptEnabled=false;
type('CLOADM');wait(/F INTBASIC[\s\S]*OK/,true);
type('EXEC');wait(/>$/);assert.ok(m.sam.bits&0x8000);
m.cassette.loadCAS(readFileSync('build/mayfield-program.cas'));m.cassette.interceptEnabled=false;
type('LOAD "MIKETREK"');wait(/LOADED\n\n>$/);
type('RUN');wait(/DO YOU WANT INSTRUCTIONS/);const startFrames=frames;type('NO');wait(/COMMAND:\?$/);const initializationSeconds=(frames-startFrames)/60;
assert.match(output,/BY MIKE MAYFIELD, CENTERLINE ENGINEERING/);
assert.match(output,/DESTROY 16 KLINGONS IN 30 STARDATES/);
for(const [s,re] of [['1',/COMMAND:\?$/],['2',/COMMAND:\?$/],['7',/COMPUTER ACTIVE.*COMMAND\?$/],['1',/NUMBER OF KLINGONS LEFT = 16[\s\S]*COMMAND:\?$/]]){output='';type(s);wait(re);}
const screen=readGraphicsScreen(m);assert.match(screen,/NUMBER OF KLINGONS LEFT = 16/);
m.reset();for(let i=0;i<180;i++)m.stepFrame();assert.equal(m.sam.bits&0x8000,0);assert.match(m.readTextScreen(),/OK/);
writeFileSync('build/mayfield-cassette-test.json',JSON.stringify({native_sha256:createHash('sha256').update(readFileSync('build/graphics64.bin')).digest('hex'),program_cas_sha256:createHash('sha256').update(readFileSync('build/mayfield-program.cas')).digest('hex'),passed:true,physical_keyboard:true,rom_cassette_read:true,fast_tape_disabled:true,game_initialized:true,initialization_seconds_at_60hz:initializationSeconds,reset_passed:true},null,2)+'\n');
console.log('64K BASIC CLOADM/EXEC, separate Mayfield LOAD, game/scans/status, and Reset passed with ROM cassette decoder.');
