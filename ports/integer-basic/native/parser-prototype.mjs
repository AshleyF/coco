// Isolated execution of the translated grammar recognizer, not a host parser.
import { readFileSync } from 'node:fs';
import { CoCo } from '../../../coco-machine.js';
const binary=readFileSync('build/parser-prototype.bin');
const symbols=Object.fromEntries(readFileSync('build/parser-prototype.sym','utf8').trim()
    .split('\n').map(line=>{const [,name,value]=/^(\w+) EQU \$([\da-f]+)$/i.exec(line.trim());return [name,parseInt(value,16)];}));
function parse(source) {
    if (source.length>127 || /[^\x20-\x7e]/.test(source)) throw new Error('Prototype expects one edited ASCII line, at most 127 characters');
    const machine=new CoCo();
    machine.loadDECB(binary,{execute:true});
    source=source.toUpperCase();
    for(let i=0;i<source.length;i++) machine.mem.ram[0x4e00+i]=source.charCodeAt(i)|128;
    machine.mem.ram[0x4e00+source.length]=0xdf;
    machine.mem.ram[0x4bff]=source.length;
    for(let steps=0;steps<1000000;steps++) {
        if(machine.cpu.pc===symbols.v_test_done) {
            const error=machine.mem.ram[0x4f03];
            if(error) return {error};
            const start=machine.mem.ram[0x4fc8]+Number(machine.cpu.flagC);
            const end=machine.mem.ram[0x4ff1]+1;
            return {error:0,start,tokens:Array.from(machine.mem.ram.slice(0x4e00+start,0x4e00+end))};
        }
        machine.cpu.step();
    }
    return {error:'budget',pc:machine.cpu.pc};
}
for(const source of JSON.parse(readFileSync(0,'utf8'))) console.log(JSON.stringify(parse(source)));
