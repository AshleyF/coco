// Report language incompatibilities without altering or loading the game.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runNative} from '../../native/graphics-runner.mjs';
const source=readFileSync(new URL('./STTR1.original.bas',import.meta.url));
assert.equal(createHash('sha256').update(source).digest('hex'),
 '69dfa0122e3dd9299fbf5764419e13de1bf42fd34fb2d0a3104847c57b6ef396');
const probes=[
 ['integer division','PRINT 1/2','\n0\n'],
 ['fractional literal','PRINT .2','*** SYNTAX ERR'],
 ['two-dimensional array','10 DIM G[8,8]','*** SYNTAX ERR'],
 ['HP image format','20 IMAGE "HELLO"','*** SYNTAX ERR'],
 ['HP dispatch','30 GOTO A+1 OF 100,200','*** SYNTAX ERR'],
 ['HP user function','40 DEF FND(D)=SQR(D)','*** SYNTAX ERR'],
 ['HP matrix clearing','50 MAT D=ZER','*** SYNTAX ERR'],
 ['HP clock','PRINT TIM(0)','*** SYNTAX ERR'],
];
for(const [feature,input,expected] of probes){
 const result=runNative(input+'\n');
 assert.equal(result.status,0);
 assert.ok(result.output.includes(expected),`${feature}: ${result.output}`);
 console.log(JSON.stringify({feature,input,output:result.output}));
}
console.log('Source fingerprint verified; eight compatibility blockers reproduced. Game not ported.');
