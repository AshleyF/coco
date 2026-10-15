// Repeated architectural state proves these original quirks are closed cycles.
// Budget exhaustion alone would be weaker and ISA-dependent evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runNative,symbols} from './runner.mjs';
const cases=JSON.parse(readFileSync('oracle/cycles.json','utf8'));
const independent=spawnSync('python3',['oracle/cycle_check.py'],{encoding:'utf8'});
assert.equal(independent.status,0,independent.stderr);
const originals=JSON.parse(independent.stdout);
const results=[];
for(const [index,case_] of cases.entries()) {
    const expected=originals[index];
    const original=spawnSync('./build/apple1',['reference/a1basic.bin','1000000'],
        {input:case_.input,encoding:'utf8'});
    assert.equal(original.status,2);
    assert.equal(original.stdout,expected.output);
    const result=runNative(case_.input,{budget:1_000_000});
    assert.equal(result.status,2);
    assert.equal(result.output,expected.output);
    assert.doesNotMatch(result.output,/>PRINT 17|\n17\n/);
    const cpu=result.machine.cpu,checkpoint=cpu.pc,seen=new Map();
    let period=0;
    for(let step=0;step<1_000_000;step++) {
        if(cpu.pc===cpu.read16(0xa000)) {
            // Continue the same empty nonblocking KEYIN ABI as the adapter.
            // A blocking read would invalidate this closed-cycle witness.
            assert.equal(cpu.read16(cpu.s),symbols.t_key_poll_return);
            cpu.a=0;cpu.flagZ=true;cpu.flagN=false;cpu.flagV=false;
            cpu.pc=cpu.pullS16();continue;
        }
        assert.notEqual(cpu.pc,cpu.read16(0xa002),'Expected a silent cycle');
        if(cpu.pc===checkpoint) {
            const state=[cpu.a,cpu.b,cpu.dp,cpu.x,cpu.y,cpu.u,cpu.s,cpu.cc,
                createHash('sha256').update(result.machine.mem.ram).digest('hex')].join(':');
            if(seen.has(state)) {period=step-seen.get(state);break;}
            seen.set(state,step);
        }
        cpu.step();
    }
    assert.ok(period>0,'Native state did not repeat: '+case_.id);
    results.push({id:case_.id,original_cycle_steps:expected.cycle_steps,native_cycle_steps:period,
        output:result.output});
    console.log(`${case_.id}: C/py65/native transcript agrees; original and native closed state cycles proved.`);
}
writeFileSync('build/native-cycles.json',JSON.stringify({
    artifact_sha256:createHash('sha256').update(readFileSync('build/prompt.bin')).digest('hex'),results
},null,2)+'\n');
