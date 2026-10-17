// Enter the recovered source, then let native SAVE and the CoCo ROM write it.
// No separate host-side implementation of the program-file format.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runNative,symbols} from '../native/runner.mjs';
import {parseCAS,casToWAV} from '../../../cassette.js';

const target=process.argv[2];
assert.ok(/^build\/blackjack-program\.(cas|wav)$/.test(target),'Expected demo CAS/WAV output path');
const result=runNative(readFileSync('demos/blackjack.bas','utf8'),{budget:100_000_000});
assert.equal(result.status,0);
assert.doesNotMatch(result.output,/ERR/);
const machine=result.machine;
const word=a=>machine.mem.ram[a]+256*machine.mem.ram[a+1];
const program=Buffer.from(machine.mem.ram.slice(word(symbols.t_pp),word(symbols.t_himem)));
assert.ok(program.length>0 && program.length<=symbols.tt_max);
machine.cassette.startRecording();
machine.startTyping('SAVE "BLACKJAK"\n');
let saved=false;
for(let i=0;i<4000;i++){
    machine.stepFrame();
    if(/SAVED/.test(machine.readTextScreen())&&!machine._typeQueue.length&&machine._typePhase!=='hold'){
        saved=true;break;
    }
}
assert.ok(saved,'Native SAVE did not finish');
const cas=machine.cassette.stopRecording();
const blocks=parseCAS(cas);
assert.equal(Buffer.from(blocks[0].data.subarray(0,8)).toString(),'BLACKJAK');
assert.equal(blocks[0].data[8],1,'Program-only data file, not a machine-code application');
assert.equal(Buffer.from(blocks[1].data.subarray(0,4)).toString(),'WIB1');
assert.equal((blocks[1].data[4]<<8)|blocks[1].data[5],program.length);
assert.deepEqual(Buffer.concat(blocks.slice(2,-1).map(b=>Buffer.from(b.data))),program);
assert.equal(blocks.at(-1).type,255);
writeFileSync(target,target.endsWith('.wav')?Buffer.from(casToWAV(cas)):cas);
console.log(`${target}: ${program.length} tokenized game bytes, recorded by native SAVE.`);
