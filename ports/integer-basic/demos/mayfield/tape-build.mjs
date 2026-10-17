// Create the data tape with the native port's SAVE; no host token-file encoder.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runNative,symbols} from '../../native/large-runner.mjs';
import {parseCAS,casToWAV} from '../../../../cassette.js';
const source=readFileSync(new URL('./STTR1.compact.bas',import.meta.url),'utf8').trim().split('\n').reverse().join('\n')+'\n';
const r=runNative(source,{budget:1_000_000_000});assert.equal(r.status,0);assert.doesNotMatch(r.output,/ERR/);
const m=r.machine,w=a=>m.mem.ram[a]+256*m.mem.ram[a+1];
const program=Buffer.from(m.mem.ram.slice(w(symbols.t_pp),w(symbols.t_himem)));
assert.ok(program.length<symbols.tt_max);
m.cassette.startRecording();m.startTyping('SAVE "MIKETREK"\n');
let output='';const step=m.cpu.step.bind(m.cpu);
m.cpu.step=()=>{if(m.cpu.pc===symbols.gt_write&&m.cpu.read16(m.cpu.s)===symbols.t_console_out_return)output+=String.fromCharCode(m.cpu.a&127);return step();};
let saved=false;for(let i=0;i<10000;i++){m.stepFrame();if(output.includes('SAVED')&&!m.isTyping){saved=true;break;}}
assert.ok(saved,'Native SAVE did not finish');
const cas=m.cassette.stopRecording(),blocks=parseCAS(cas);
assert.equal(blocks.at(-1).type,255);assert.equal(Buffer.from(blocks[0].data.slice(0,8)).toString(),'MIKETREK');
assert.deepEqual(Buffer.concat(blocks.slice(2,-1).map(b=>Buffer.from(b.data))),program);
writeFileSync('build/mayfield-program.cas',cas);writeFileSync('build/mayfield-program.wav',Buffer.from(casToWAV(cas)));
console.log(`Mayfield: ${program.length} token bytes, native SAVE cassette produced.`);
