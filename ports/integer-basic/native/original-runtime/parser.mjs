// Routine-level probe of the parser in the actual complete native engine.
// All token/error decisions execute as 6809 instructions from that binary.
import {readFileSync} from 'node:fs';
import {CoCo} from '../../../../coco-machine.js';
const binary=readFileSync('build/prompt.bin');
const symbols=Object.fromEntries(readFileSync('build/prompt.sym','utf8').trim()
    .split('\n').map(line=>{const [,name,hex]=/^(\w+) EQU \$([\da-f]+)$/i.exec(line.trim());return[name,parseInt(hex,16)];}));
function parse(source) {
    if(source.length>127||/[^\x20-\x7e]/.test(source))throw Error('Expected one edited ASCII line');
    const machine=new CoCo();
    machine.loadDECB(binary);
    source=source.toUpperCase();
    for(let i=0;i<source.length;i++)machine.mem.ram[symbols.t_buffer+i]=source.charCodeAt(i)|128;
    machine.mem.ram[symbols.t_buffer+source.length]=0xdf;
    machine.mem.ram[symbols.t_text_index]=0xff;
    machine.mem.ram[symbols.t_token_index]=source.length;
    const cpu=machine.cpu;
    cpu.s=0x7f00;
    cpu.pushS16(0x0700); // Stop before executing this synthetic return address.
    cpu.pc=symbols.t_Se491;
    cpu.a=0xff;
    cpu.b=0x20;
    for(let step=0;step<3_000_000;step++) {
        if(cpu.pc===0x0700) {
            const start=machine.mem.ram[symbols.t_text_index]+Number(cpu.flagC);
            const end=machine.mem.ram[symbols.t_token_index]+1;
            return {error:0,start,tokens:[...machine.mem.ram.slice(symbols.t_buffer+start,symbols.t_buffer+end)]};
        }
        if(cpu.pc===symbols.t_print_err_msg) {
            const y=machine.mem.ram[symbols.t_y];
            return {error:y===6?9:y===0?2:1};
        }
        cpu.step();
    }
    return {error:'budget',pc:cpu.pc};
}
for(const source of JSON.parse(readFileSync(0,'utf8')))console.log(JSON.stringify(parse(source)));
