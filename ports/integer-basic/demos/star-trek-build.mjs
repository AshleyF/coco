import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runNative,symbols} from '../native/runner.mjs';
import {parseCAS,casToWAV} from '../../../cassette.js';
import {cocoSource} from './star-trek-source.mjs';
const target=process.argv[2];
assert.ok(['build/star-trek.asm','build/star-trek-program.cas','build/star-trek-program.wav'].includes(target));
const result=runNative(cocoSource,{budget:100000000});
assert.equal(result.status,0);assert.doesNotMatch(result.output,/ERR/);
const m=result.machine,word=a=>m.mem.ram[a]+256*m.mem.ram[a+1];
const program=Buffer.from(m.mem.ram.slice(word(symbols.t_pp),word(symbols.t_himem)));
assert.ok(program.length>0&&program.length<=symbols.tt_max);
if(target.endsWith('.asm')){
 const payload=m.mem.ram.slice(0x0800,0x7000),data=[];
 for(let i=0;i<payload.length;i+=16)data.push('        fcb '+Array.from(payload.slice(i,i+16),b=>'$'+b.toString(16).padStart(2,'0')).join(','));
 writeFileSync(target,`; Native BASIC + Robert J. Bishop's Apple Star-Trek. See demos/STAR-TREK.md.
        org $0800
${data.join('\n')}
        org $7000
trek_start
        orcc #$50
        lds #$7f00
        lda #$40
        tfr a,dp
        ldu #$4080
        jmp $${symbols.t_warm.toString(16)}
        end trek_start
`);
}else{
 m.cassette.startRecording();m.startTyping('SAVE "STARTREK"\n');let saved=false;
 for(let i=0;i<4000;i++){
  m.stepFrame();if(/SAVED/.test(m.readTextScreen())&&!m.isTyping){saved=true;break;}
 }
 assert.ok(saved,'Native SAVE failed');const cas=m.cassette.stopRecording(),blocks=parseCAS(cas);
 assert.equal(Buffer.from(blocks[0].data.slice(0,8)).toString(),'STARTREK');
 assert.deepEqual(Buffer.concat(blocks.slice(2,-1).map(b=>Buffer.from(b.data))),program);
 writeFileSync(target,target.endsWith('.wav')?Buffer.from(casToWAV(cas)):cas);
}
console.log(`${target}: ${program.length} program bytes; source memory addresses adapted for CoCo.`);
