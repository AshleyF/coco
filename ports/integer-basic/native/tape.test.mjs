// Native extension + actual ROM block routines; no host LOAD/SAVE semantics.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {CoCo} from '../../../coco-machine.js';
import {parseCAS,buildCAS,casToWAV} from '../../../cassette.js';
import {attachPCM} from '../../../tests/pcm-tape-source.mjs';
import {readSymbols} from './console-runner.mjs';
const symbols=readSymbols(readFileSync('build/prompt.sym','utf8'));
const m=new CoCo();
m.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);
m.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);
m.reset();
const frames=n=>{for(let i=0;i<n;i++)m.stepFrame();};
frames(120);m.loadDECB(readFileSync('build/prompt.bin'),{execute:true});frames(10);
let output='';
const charout=m.cpu.read16(0xa002),originalStep=m.cpu.step.bind(m.cpu);
m.cpu.step=()=>{if(m.cpu.pc===charout&&m.cpu.read16(m.cpu.s)===symbols.t_console_out_return){let c=m.cpu.a&127;output+=c===13?'\n':String.fromCharCode(c);}return originalStep();};
function waitFor(pattern,max=30000){for(let i=0;i<max;i++){if(pattern.test(output)&&!m._typeQueue.length&&m._typePhase!=='hold')return;m.stepFrame();}throw Error('Timed out: '+pattern+'\n'+output+'\n'+m.cpu.pc.toString(16));}
function command(s,pattern=/>\s*$/){output='';m.startTyping(s+'\n');frames(2);waitFor(pattern);return output;}
const word=a=>m.mem.ram[a]+256*m.mem.ram[a+1];
const program=()=>Buffer.from(m.mem.ram.slice(word(symbols.t_pp),word(symbols.t_himem)));
for(const line of ['10 DIM A(2),B$(5)','20 B$="HI"','30 FOR I=1 TO 2','40 A(I)=I*7:GOSUB 100','50 NEXT I','60 END','100 PRINT B$;A(I):RETURN'])command(line);
const expected=program();
command('RUN',/HI7\nHI14\n\n>/);
m.cassette.startRecording();command('SAVE "ROUND"',/SAVED\n\n>/);
const tape=m.cassette.stopRecording();writeFileSync('build/program-roundtrip.cas',tape);
let blocks=parseCAS(tape);assert.equal(blocks[0].type,0);assert.equal(blocks[0].data[8],1);
assert.equal(Buffer.from(blocks[1].data.subarray(0,4)).toString(),'WIB1');
assert.deepEqual(Buffer.concat(blocks.slice(2,-1).map(b=>Buffer.from(b.data))),expected);
assert.equal(blocks.at(-1).type,255);
command('SCR');assert.equal(program().length,0);
m.cassette.loadCAS(tape);command('LOAD "ROUND"',/LOADED\n\n>/);
assert.deepEqual(program(),expected);assert.equal(word(symbols.t_pv),word(symbols.t_lomem));
assert.match(command('LIST'),/100 PRINT B\$;A\(I\): RETURN/);
command('RUN',/HI7\nHI14\n\n>/);
const stable=program(),pv=word(symbols.t_pv),variables=Buffer.from(m.mem.ram.slice(0x5000,pv));
function rejected(cas,message,cmd='LOAD'){
 m.cassette.loadCAS(cas);command(cmd,new RegExp(message+'\\n\\n>'));
 assert.deepEqual(program(),stable);assert.equal(word(symbols.t_pv),pv);
 assert.deepEqual(Buffer.from(m.mem.ram.slice(0x5000,pv)),variables);assert.equal(m.cassette.motorOn,false);
}
rejected(tape,'TAPE NAME ERR','LOAD "OTHER"');
const changed=(index,fn)=>{const b=parseCAS(tape).map(x=>({type:x.type,data:Uint8Array.from(x.data)}));fn(b[index].data,b);return buildCAS(b);};
rejected(changed(1,d=>d[3]=50),'TAPE FORMAT ERR');
rejected(changed(1,d=>{d[4]=15;d[5]=0;}),'TAPE TOO LARGE');
rejected(changed(2,d=>d[4]^=1),'TAPE I/O ERR');
rejected(changed(2,(d,b)=>{d[0]=255;let sum=b.slice(2,-1).flatMap(x=>[...x.data]).reduce((a,v)=>(a+v)&65535,0);b[1].data[6]=sum>>8;b[1].data[7]=sum&255;}),'TAPE FORMAT ERR');
const corrupt=Uint8Array.from(tape);let sync=corrupt.indexOf(0x3c);corrupt[sync+3]^=1;
rejected(corrupt,'TAPE I/O ERR');
assert.match(command('SAVE "TOOLONGNAME"'),/TAPE SYNTAX ERR/);
for(const source of ['SAVE=7:PRINT SAVE','LOAD=9:PRINT LOAD','10 SAVE "X"','10 LOAD "X"','IF1THENSAVE']) {
 const reference=spawnSync('build/apple1',['build/a1basic.bin'],{input:source+'\n',encoding:'utf8'});
 assert.equal(command(source),reference.stdout.replace(/^\n>/,''));
}
command('SCR');
m.cassette.startRecording();command('SAVE',/SAVED\n\n>/);
const emptyTape=m.cassette.stopRecording();
command('10 PRINT 99');m.cassette.loadCAS(emptyTape);
command('LOAD',/LOADED\n\n>/);assert.equal(program().length,0);
command('SCR');for(let i=1;i<=60;i++)command(`${i*10} PRINT ${i}`);
const large=program();assert.ok(large.length>255);
m.cassette.startRecording();command('SAVE',/SAVED\n\n>/);const largeTape=m.cassette.stopRecording();
command('SCR');m.cassette.loadCAS(largeTape);command('LOAD',/LOADED\n\n>/);assert.deepEqual(program(),large);
for(const mode of ['cas','pcm']){
 command('SCR');m.cassette.interceptEnabled=false;
 if(mode==='cas')m.cassette.loadCAS(tape);else attachPCM(m,casToWAV(tape));
 command('LOAD',/LOADED\n\n>/);assert.deepEqual(program(),expected);
 command('RUN',/HI7\nHI14\n\n>/);
 console.log(`${mode}: program LOAD through ROM FSK, then arrays/strings/FOR/GOSUB passed.`);
}
console.log('Native SAVE/SCR/LOAD, exact token bytes, clear variables, multi-block files and atomic error recovery passed.');
if(process.env.BASIC_EXTERNAL_PROGRAM_WAV){
 command('SCR');attachPCM(m,readFileSync(process.env.BASIC_EXTERNAL_PROGRAM_WAV));
 command('LOAD "XROAR"',/LOADED\n\n>/);
 assert.match(command('LIST'),/10 PRINT 42/);command('RUN',/\n42\n\n>/);
 console.log('Independent XRoar SAVE waveform -> native LOAD via actual PCM -> RUN 42 passed.');
}
