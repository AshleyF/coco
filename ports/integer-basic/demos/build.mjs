// Build-time source entry creates native program records, never 6502 code.
// The cassette contains the native interpreter plus the unexecuted game.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runNative} from '../native/runner.mjs';
const source=readFileSync('demos/blackjack.bas','utf8');
const result=runNative(source,{budget:100_000_000});
assert.equal(result.status,0);
assert.doesNotMatch(result.output,/ERR/);
const match=/^t_warm EQU \$([\da-f]+)$/im.exec(readFileSync('build/prompt.sym','utf8'));
assert.ok(match,'Native warm entry missing');
const payload=result.machine.mem.ram.slice(0x0800,0x7000);
writeFileSync('build/blackjack.ram',payload);
const data=[];
for(let i=0;i<payload.length;i+=16)
    data.push('        fcb '+Array.from(payload.slice(i,i+16),b=>'$'+b.toString(16).padStart(2,'0')).join(','));
writeFileSync('build/blackjack.asm',`; Generated native BASIC + recovered Blackjack. See demos/README.md.
        org $0800
${data.join('\n')}
        org $7000
demo_start
        orcc #$50
        lds #$7f00
        clra
        tfr a,dp
        jmp $${match[1]}
        end demo_start
`);
console.log('Native Blackjack cassette source prepared.');
