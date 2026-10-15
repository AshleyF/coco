import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runNative} from './runner.mjs';
const symbols=Object.fromEntries(readFileSync('build/runtime-prototype.sym','utf8').trim()
    .split('\n').map(line=>{const [,name,hex]=/^(\w+) EQU \$([\da-f]+)$/i.exec(line.trim());return[name,parseInt(hex,16)];}));
const word=(r,name)=>r.machine.mem.ram[symbols[name]]+256*r.machine.mem.ram[symbols[name]+1];
const fresh=runNative('');
assert.equal(word(fresh,'t_lomem'),0x5000);
assert.equal(word(fresh,'t_himem'),0x5800);
assert.ok(symbols.t_code_end<0x4000,'Native code overlaps relocated private workspace');
for(const value of [1,255,256,32767,-1,-256,-32767]) {
    const r=runNative(`A=${value}\nPRINT A\n`);
    assert.equal(r.status,0);
    assert.match(r.output,new RegExp(`\\n${value}\\n`));
    // Original numeric record: encoded name, next/end pointer, then LE value.
    assert.deepEqual([...r.machine.mem.ram.slice(0x5004,0x5006)],[value&255,(value>>8)&255]);
}
const edited=runNative('PRINT 1\b2\n');
assert.equal(edited.status,0);
assert.match(edited.output,/>PRINT 1_2\n2\n/);
for(const address of [0,768,0x4000,0x4fff,0x7001,0x7f00,32767]) {
    for(const command of ['LOMEM','HIMEM']) {
        const r=runNative(`A=7\n${command}=${address}\nPRINT A\n`);
        assert.equal(r.status,0);
        assert.equal((r.output.match(/RANGE ERR/g)||[]).length,1);
        assert.match(r.output,/\n7\n/);
        assert.equal(word(r,'t_lomem'),0x5000);
        assert.equal(word(r,'t_himem'),0x5800);
    }
}
const grow=runNative('10 PRINT 42\n20 END\nDIM A(2),B$(5)\nA(1)=7\nA(2)=9\nB$="HI"\n'
    +'HIMEM=28672\nPRINT A(1)\nPRINT A(2)\nPRINT B$\nLIST\nRUN\n');
assert.equal(grow.status,0);
assert.doesNotMatch(grow.output,/ERR/);
assert.equal(word(grow,'t_himem'),0x7000);
assert.deepEqual(grow.output.split('\n').filter(x=>/^-?\d+$/.test(x)),['7','9','42']);
assert.match(grow.output,/\nHI\n/);
assert.match(grow.output,/   10 PRINT 42\n/);
const loop=runNative('10 DIM I(2)\n20 FOR I=1 TO 2\n30 PRINT I\n40 NEXT I\n50 END\n'
    +'RUN\nIMEM=28672\nGOTO 40\nPRINT I\n',{event:{after:'\n1\n',key:72}});
assert.equal(loop.status,0);
assert.doesNotMatch(loop.output,/ERR/);
assert.deepEqual(loop.output.split('\n').filter(x=>/^-?\d+$/.test(x)),['1','2','3']);
assert.equal(word(loop,'t_himem'),0x7000);
// Same 172-byte arena on each platform. Keep original failed-DIM behavior,
// including the descriptor left behind and its subsequent DIM/RANGE errors.
const source=(hi,lo)=>`HIMEM=${hi}\nLOMEM=${lo}\nA=17\nDIM B(100)\nPRINT A\n`
    +'DIM C(2)\nC(2)=9\nPRINT C(2)\nDIM B(2)\nB(2)=23\nPRINT B(2)\n';
const apple=spawnSync('./build/apple1',['reference/a1basic.bin','1000000'],
    {input:source(4096,3924),encoding:'utf8'});
assert.equal(apple.status,0);
const exhausted=runNative(source(28672,28500));
assert.equal(exhausted.status,0);
const observations=s=>s.split('\n').filter(x=>/^-?\d+$|^\*\*\*/.test(x));
assert.deepEqual(observations(exhausted.output),observations(apple.stdout));
assert.deepEqual(observations(exhausted.output),['*** MEM FULL ERR','17','9',
    '*** DIM ERR','*** RANGE ERR','*** RANGE ERR']);
const call=runNative('POKE 768,134\nPOKE 769,42\nPOKE 770,183\nPOKE 771,3\n'
    +'POKE 772,32\nPOKE 773,57\nCALL 768\nPRINT PEEK(800)\nPRINT 17\n');
assert.equal(call.status,0);
assert.match(call.output,/\n42\n/);
assert.match(call.output,/\n17\n/);
console.log('Full native engine: layout, LE values, backspace, bounds, heap growth, active FOR, original failed-DIM behavior, and native CALL passed.');

// These accepted-but-broken getters underflow the original noun stack. Their
// resulting pointers refer to unbacked Apple memory, not the CoCo's BASIC ROM.
// Keep this platform-specific check outside the portable language contracts.
for(const name of ['HIMEM','LOMEM','COLOR']) {
    const input=`A=7\nPRINT ABS(${name})\nPRINT A\nPRINT 17\n`;
    const original=spawnSync('./build/apple1',['reference/a1basic.bin','1000000'],{input,encoding:'utf8'});
    const independent=spawnSync('python3',['oracle/py65_runner.py'],{input,encoding:'utf8'});
    const actual=runNative(input);
    assert.equal(original.status,0);
    assert.equal(independent.status,0);
    assert.equal(actual.status,0);
    assert.equal(actual.output,original.stdout);
    assert.equal(actual.output,independent.stdout);
    assert.deepEqual(observations(actual.output),['0','7','17']);
}
const peek=runNative('PRINT PEEK(-24576)\n'); // $A000: real CoCo ROM, not private memory.
assert.equal(peek.status,0);
assert.deepEqual(observations(peek.output),[String(readFileSync('../../roms/bas13.rom')[0])]);
console.log('Broken getter reads match both original CPU oracles; explicit PEEK still reads CoCo ROM.');
