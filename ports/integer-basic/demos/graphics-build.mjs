// Same historical source, compiled by the graphics-console native interpreter.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runNative,symbols} from '../native/graphics-runner.mjs';
import {cocoSource} from './star-trek-source.mjs';
const game=process.argv[2];assert.ok(['blackjack','star-trek'].includes(game));
const source=game==='blackjack'?readFileSync('demos/blackjack.bas','utf8'):cocoSource.replace('HIMEM=23808','HIMEM=27904');
const result=runNative(source,{budget:100000000});assert.equal(result.status,0);assert.doesNotMatch(result.output,/ERR/);
const payload=result.machine.mem.ram.slice(0x2000,0x7000),data=[];
for(let i=0;i<payload.length;i+=16)data.push('        fcb '+Array.from(payload.slice(i,i+16),b=>'$'+b.toString(16).padStart(2,'0')).join(','));
writeFileSync(`build/graphics-${game}.asm`,`; Native 40x24 terminal + historical ${game}.
        org $2000
${data.join('\n')}
        org $7000
demo_graphics_start
        orcc #$50
        lds #$7f00
        lda #$50
        tfr a,dp
        ldu #$5080
        jsr $${symbols.gt_init.toString(16)}
        jmp $${symbols.t_warm.toString(16)}
        end demo_graphics_start
`);
