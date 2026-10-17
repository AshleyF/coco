// Fresh interpreter -> program LOAD -> play -> SAVE -> SCR -> LOAD -> play.
// All input uses the keyboard matrix; output is observed, never replaced.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CoCo} from '../../../coco-machine.js';
import {parseCAS} from '../../../cassette.js';
import {attachPCM} from '../../../tests/pcm-tape-source.mjs';
import {readSymbols} from '../native/console-runner.mjs';

const graphics=process.argv.includes('--graphics');
const symbols=readSymbols(readFileSync(graphics?'build/graphics.sym':'build/prompt.sym','utf8'));
const source=readFileSync('demos/blackjack.bas','utf8');
// Compare complete game sessions to the unchanged original, including the RNG
// state continuing across two RUNs. The tape commands have no original analogue.
const moves=['ASHLEY\n10\nN\n0\n','ASHLEY\n3500\n10\nY\n0\n'];
const originalInput=source+'LIST\n'+moves.map(s=>'RUN\n'+s).join('');
const original=spawnSync('build/apple1',['reference/a1basic.bin','100000000'],{
    input:originalInput,encoding:'utf8'});
assert.equal(original.status,0,original.stderr);
const independent=spawnSync('python3',['-c',
    'import sys; sys.path.insert(0,"oracle"); from py65_runner import run; r=run(sys.stdin.read(),100000000); sys.stdout.write(r["output"]); sys.exit(r["status"])'],
    {input:originalInput,encoding:'utf8'});
assert.equal(independent.status,0,independent.stderr);
assert.equal(independent.stdout,original.stdout,'Independent py65 validates both original sessions');
const expected=original.stdout.split('>RUN\n').slice(1).map(s=>'RUN\n'+s+(s.endsWith('>')?'':'>'));
const expectedListing='LIST\n'+original.stdout.split('>LIST\n')[1].split('>RUN\n')[0]+'>';
assert.equal(expected.length,2);
const referenceCAS=readFileSync('build/blackjack-program.cas');
const tokenBytes=Buffer.concat(parseCAS(referenceCAS).slice(2,-1).map(b=>Buffer.from(b.data)));
const results=[];
for(const format of ['cas','wav']){
    const machine=new CoCo();
    machine.mem.loadROM(readFileSync('../../roms/bas13.rom'),0xa000);
    machine.mem.loadROM(readFileSync('../../roms/extbas11.rom'),0x8000);
    machine.reset();
    const frames=n=>{for(let i=0;i<n;i++)machine.stepFrame();};
    let output='',awaitingInput=false;
    const charout=symbols.gt_write??machine.cpu.read16(0xa002),keyin=machine.cpu.read16(0xa000),step=machine.cpu.step.bind(machine.cpu);
    machine.cpu.step=()=>{
        if(machine.cpu.pc===keyin&&machine.cpu.read16(machine.cpu.s)===symbols.t_key_read_return)awaitingInput=true;
        if(machine.cpu.pc===charout&&machine.cpu.read16(machine.cpu.s)===symbols.t_console_out_return){
            awaitingInput=false;
            const c=machine.cpu.a&127;output+=c===13?'\n':String.fromCharCode(c);
        }
        return step();
    };
    function waitFor(pattern,screen=false){
        for(let i=0;i<30000;i++){
            if((screen||awaitingInput)&&pattern.test(screen?machine.readTextScreen():output)&&!machine._typeQueue.length&&machine._typePhase!=='hold')return;
            machine.stepFrame();
        }
        throw Error(`${format}: timed out ${pattern}\n${output}\n${machine.readTextScreen()}`);
    }
    function type(s){awaitingInput=false;machine.startTyping(s);frames(2);}
    function command(s,pattern=/>\s*$/){output='';type(s+'\n');waitFor(pattern);return output;}
    const word=a=>machine.mem.ram[a]+256*machine.mem.ram[a+1];
    const program=()=>Buffer.from(machine.mem.ram.slice(word(symbols.t_pp),word(symbols.t_himem)));
    frames(120);
    machine.cassette.loadCAS(readFileSync(graphics?'build/graphics.cas':'build/prompt.cas'));
    type('CLOADM\n');waitFor(/F INTBASIC\s*\nOK/,true);
    command('EXEC');assert.equal(program().length,0,'Interpreter must start empty');
    if(format==='cas'){
        machine.cassette.loadCAS(referenceCAS);
        machine.cassette.interceptEnabled=false;
    }else attachPCM(machine,readFileSync('build/blackjack-program.wav'));
    command('LOAD "BLACKJAK"',/LOADED\n\n>/);
    assert.deepEqual(program(),tokenBytes);
    const listing=command('LIST');assert.doesNotMatch(listing,/ERR/);
    assert.equal(listing,expectedListing,'Entire LIST must match unchanged original');
    function play(index){
        output='';type('RUN\n');waitFor(/YOUR NAME\?/);
        type('ASHLEY\n');waitFor(/BET\?/);
        if(index===1){type('3500\n');waitFor(/LIMIT IS \$3000\. .*BET\?/s);}
        type('10\n');waitFor(/HIT\?/);
        type(index===0?'N\n':'Y\n');
        waitFor(/WINNINGS: -?\d+\n\nBET\?/);
        type('0\n');waitFor(/END--STOPPED AT 30\n\n>/);
        assert.equal(output,expected[index],`${format}: full original game transcript ${index+1}`);
        assert.doesNotMatch(output,/ERR/);
        return output;
    }
    const first=play(0);
    assert.match(first,/YOU WIN/);assert.match(first,/WINNINGS: 10/);
    // PCM input is detached before recording; SAVE uses the actual native
    // extension and ROM output, with only the emulator's existing byte shortcut.
    machine.cassette.interceptEnabled=true;
    machine.cassette.startRecording();command('SAVE "MY21"',/SAVED\n\n>/);
    const saved=machine.cassette.stopRecording();
    assert.deepEqual(Buffer.concat(parseCAS(saved).slice(2,-1).map(b=>Buffer.from(b.data))),tokenBytes);
    command('SCR');assert.equal(program().length,0);
    assert.doesNotMatch(command('LIST'),/^\s*10 /m);
    // CAS loading uses playBuffer; restore the standard cassette methods after
    // the test-only PCM source overrode them.
    if(format==='wav'){
        delete machine.cassette.advanceCycles;delete machine.cassette.readBit;
    }
    machine.cassette.loadCAS(saved);
    command('LOAD "MY21"',/LOADED\n\n>/);
    assert.deepEqual(program(),tokenBytes);
    assert.equal(command('LIST'),listing,'Reload must preserve the entire listing');
    assert.equal(word(symbols.t_pv),word(symbols.t_lomem),'Load clears gameplay variables');
    const second=play(1);
    assert.match(second,/LIMIT IS \$3000/);assert.match(second,/BUSTED/);
    assert.match(second,/WINNINGS: -10/);
    writeFileSync(`build/blackjack-roundtrip-${format}.cas`,saved);
    results.push({format,passed:true,program_bytes:tokenBytes.length,first,second});
    console.log(`${format}: empty interpreter, LOAD, full original game, SAVE/SCR/LOAD, exact LIST and second original game passed.`);
}
const sha=data=>createHash('sha256').update(data).digest('hex');
writeFileSync(graphics?'build/graphics-blackjack-test.json':'build/blackjack-program-test.json',JSON.stringify({
    native_sha256:sha(readFileSync(graphics?'build/graphics.bin':'build/prompt.bin')),
    source_sha256:sha(source),reference_rom_sha256:sha(readFileSync('reference/a1basic.bin')),
    cas_sha256:sha(referenceCAS),wav_sha256:sha(readFileSync('build/blackjack-program.wav')),results
},null,2)+'\n');
