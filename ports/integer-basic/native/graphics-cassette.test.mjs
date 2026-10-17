// Real ROM cassette and keyboard path; pixels are only observed by the host.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../coco-machine.js';
import {attachPCM} from '../../../tests/pcm-tape-source.mjs';
import {readGraphicsScreen} from './graphics-screen.mjs';
import {symbols as s} from './graphics-runner.mjs';
const results=[];
for(const format of (process.env.BASIC_EXTERNAL_PROGRAM_WAV?['cas']:['cas','pcm'])){
 const m=new CoCo();m.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);m.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);m.reset();
 for(let i=0;i<120;i++)m.stepFrame();
 const cpu=m.cpu,keyin=cpu.read16(0xa000),step=cpu.step.bind(cpu);let output='',awaiting=false;
 cpu.step=()=>{
  if(cpu.pc===keyin&&cpu.read16(cpu.s)===s.t_key_read_return)awaiting=true;
  if(cpu.pc===s.gt_write&&cpu.read16(cpu.s)===s.t_console_out_return){awaiting=false;const ch=cpu.a&127;output+=ch===13?'\n':String.fromCharCode(ch);}
  return step();
 };
 function wait(pattern,textScreen=false){for(let i=0;i<60000;i++){
  if((textScreen||awaiting)&&pattern.test(textScreen?m.readTextScreen():output)&&!m.isTyping)return;m.stepFrame();
 }throw Error(`${format}: ${pattern}\n${output}\n${readGraphicsScreen(m)}`);}
 function command(text,pattern=/>\s*$/){output='';awaiting=false;m.startTyping(text+'\n');wait(pattern);return output;}
 if(format==='pcm')attachPCM(m,readFileSync('build/graphics.wav'));
 else{m.cassette.loadCAS(readFileSync('build/graphics.cas'));m.cassette.interceptEnabled=false;}
 m.startTyping('CLOADM\n');wait(/F INTBASIC\s*\nOK/,true);
 const binary=readFileSync('build/graphics.bin');
 for(let offset=0;binary[offset]===0;){const len=binary.readUInt16BE(offset+1),address=binary.readUInt16BE(offset+3);assert.deepEqual(Buffer.from(m.mem.ram.slice(address,address+len)),binary.subarray(offset+5,offset+5+len));offset+=5+len;}
 command('EXEC');assert.equal(m.sam.videoMode,6);assert.equal(m.sam.videoOffset,0x800);assert.equal(m.pia1.dataB&0xf8,0xf8);
 command('PRINT 6*7');assert.match(readGraphicsScreen(m),/>PRINT 6\*7\s*\n42/);
 function key(name){m.keyboard.keyDown({key:name});for(let i=0;i<4;i++)m.stepFrame();m.keyboard.keyUp({key:name});for(let i=0;i<8;i++)m.stepFrame();}
 function partial(text){m.startTyping(text);m._typeQueue.pop();for(let i=0;i<2000&&m.isTyping;i++)m.stepFrame();assert.ok(!m.isTyping);}
 output='';partial('PRINT 1');key('Backspace');key('2');key('Enter');wait(/2\n\n>/);
 assert.match(output,/PRINT 1_2\n2/);assert.match(readGraphicsScreen(m),/>PRINT 1_2\s*\n2/);
 output='';partial('PRINT 99');key('Escape');command('PRINT 7');assert.doesNotMatch(output,/\n99\n/);assert.match(output,/\n7\n/);
 command('10 FOR I=1 TO 30');command('20 PRINT I');command('30 NEXT I');command('40 END');
 command('RUN');const screen=readGraphicsScreen(m);assert.equal(screen.split('\n').length,24);assert.match(screen,/\n30\s*\n\s*\n>/);
 // SAVE uses native code and the ROM byte-recording shortcut, as in the UI.
 // Re-loading disables shortcuts and exercises physical FSK decoding.
 if(format==='pcm'){delete m.cassette.advanceCycles;delete m.cassette.readBit;}
 m.cassette.interceptEnabled=true;m.cassette.startRecording();command('SAVE "GFXTEST"',/SAVED\n\n>/);
 const tape=m.cassette.stopRecording();m.cassette.interceptEnabled=false;command('SCR');m.cassette.loadCAS(tape);command('LOAD "GFXTEST"',/LOADED\n\n>/);
 command('RUN');assert.match(output,/\n1\n[\s\S]*\n30\n\n>/);assert.equal(m.sam.videoMode,6);assert.equal(m.sam.videoOffset,0x800);assert.equal(m.pia1.dataB&0xf8,0xf8);
 if(process.env.BASIC_EXTERNAL_PROGRAM_WAV){
  command('SCR');attachPCM(m,readFileSync(process.env.BASIC_EXTERNAL_PROGRAM_WAV));command('LOAD "XROAR"',/LOADED\n\n>/);command('RUN');assert.match(output,/\n42\n\n>/);assert.match(readGraphicsScreen(m),/\n42\s*\n/);
  console.log('Independent graphics XRoar SAVE WAV -> native PCM LOAD -> RUN 42 passed.');
 }
 results.push({format,passed:true,screen:readGraphicsScreen(m)});console.log(`${format}: all native segments, real CLOADM/EXEC, physical editing, 24-row scroll, SAVE/SCR/LOAD and RG6 state passed.`);
}
writeFileSync(process.env.BASIC_EXTERNAL_PROGRAM_WAV?'build/graphics-external-cassette-test.json':'build/graphics-cassette-test.json',JSON.stringify({native_sha256:createHash('sha256').update(readFileSync('build/graphics.bin')).digest('hex'),results},null,2)+'\n');
