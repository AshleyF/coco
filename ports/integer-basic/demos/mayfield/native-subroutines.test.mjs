// Run the derived game's actual helper statements on the native MC6809 target.
// This does not load or claim to validate the full game on the current CoCo map.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runNative} from '../../native/graphics-runner.mjs';
const source=readFileSync(new URL('./STTR1.integer.bas',import.meta.url),'utf8');
const section=(lo,hi)=>source.split('\n').filter(l=>{const n=parseInt(l);return n>=lo&&n<=hi;}).join('\n')+'\n';
function run(code){
 const r=runNative('HIMEM=28672\n'+code+'RUN 9000\n',{budget:500_000_000});
 assert.equal(r.status,0);assert.doesNotMatch(r.output,/ERR/);
 return r.output.split('>RUN 9000\n')[1];
}
const distance=section(7220,7250)+'9000 FOR U0=-7 TO 7:FOR U1=-7 TO 7:GOSUB 7220:PRINT U3:NEXT U1:NEXT U0:END\n';
const expected=[];for(let x=-7;x<=7;x++)for(let y=-7;y<=7;y++)expected.push(Math.floor(Math.sqrt((x*x+y*y)*100)));
assert.deepEqual(run(distance).split('\n').filter(l=>/^\d+$/.test(l)).map(Number),expected);
console.log('Native MC6809: all 225 sector-distance inputs, including coincident points, passed.');
const cells=section(5510,5600)+'9000 DIM Q$(72),R$(72),S$(48),U$(72),A$(3)\n9001 Q$="'+' '.repeat(72)+'":R$=Q$:S$=Q$(1,48)\n9002 FOR Z1=1 TO 8:FOR Z2=1 TO 8:A$="+++":GOSUB 5510:NEXT Z2:NEXT Z1\n9003 PRINT LEN(Q$);",";LEN(R$);",";LEN(S$):PRINT Q$:PRINT R$:PRINT S$:END\n';
const out=run(cells);assert.ok(out.includes('72,72,48\n'+'+'.repeat(72)+'\n'+'+'.repeat(72)+'\n'+'+'.repeat(48)+'\n'));
console.log('Native MC6809: 64 sector replacements preserve suffixes and all three string lengths.');
