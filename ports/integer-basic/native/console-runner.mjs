// Shared logical console; all BASIC semantics execute in the supplied native binary.
import {readFileSync} from 'node:fs';
import {CoCo} from '../../../coco-machine.js';

export function readSymbols(text) {
 return Object.fromEntries(text.trim().split('\n').map(line=>{
  const match=/^(\w+) EQU \$([\da-f]+)$/i.exec(line.trim());
  if(!match)throw Error('Invalid assembler symbol: '+line);
  return[match[1],parseInt(match[2],16)];
 }));
}

export function createRunner(binary,symbols) {
return function runNative(source, { budget = 50_000_000, event = null } = {}) {
    if (event && (!event.after || event.after.length >= 256 ||
            [...event.after].some(ch => ch.charCodeAt(0)>127) ||
            !Number.isInteger(event.key) || event.key<1 || event.key>127)) {
        throw new Error('Key events require an ASCII output anchor below 256 bytes and key 1..127');
    }
    const machine = new CoCo();
    machine.mem.loadROM(readFileSync(new URL('../../../roms/bas13.rom', import.meta.url)), 0xa000);
    machine.mem.loadROM(readFileSync(new URL('../../../roms/extbas11.rom', import.meta.url)), 0x8000);
    machine.reset();
    for (let i = 0; i < 120; i++) {
        machine.stepFrame();
        // Color BASIC has completed hardware/console initialization before OK.
        if (machine.readTextScreen().includes('OK')) break;
    }
    if (!machine.readTextScreen().includes('OK')) throw new Error('Color BASIC did not boot');
    machine.loadDECB(binary, { execute: true });
    const cpu = machine.cpu;
    const keyin = cpu.read16(0xa000);
    const charout = cpu.read16(0xa002);
    let cursor = 0, output = '', eventDelivered = false;
    for (let steps = 0; steps < budget; steps++) {
        // Supply keyboard bytes at the Color BASIC ABI entry. This is the only
        // replaced ROM service; the stack return and A/Z contract match KEYIN.
        if (cpu.pc === keyin) {
            const polling = cpu.read16(cpu.s) === symbols.t_key_poll_return;
            let key;
            if (event && !eventDelivered && output.includes(event.after)) {
                key = event.key;
                eventDelivered = true;
            } else if (polling) {
                key = 0;
            } else {
                if (cursor === source.length) return { output, status: 0, machine };
                key = source.charCodeAt(cursor++);
            }
            if (key > 127) throw new Error('Transcript input must be ASCII');
            if (key === 10) key = 13;
            cpu.a = key;
            cpu.flagZ = key === 0;
            cpu.flagN = !!(key & 0x80);
            cpu.flagV = false;
            cpu.pc = cpu.pullS16();
            continue;
        }
        // Observe the native cout call BEFORE Color BASIC's physical wrapping
        // and scrolling. Still execute CHROUT so screen behavior is exercised.
        if (cpu.pc === charout && cpu.read16(cpu.s) === symbols.t_console_out_return) {
            const ch = cpu.a & 0x7f;
            output += ch === 13 ? '\n' : String.fromCharCode(ch);
        }
        cpu.step();
    }
    return { output, status: 2, machine };
}
;
}

export function runCLI(runNative) {
    try {
        const after = process.env.BASIC_KEY_AFTER_OUTPUT;
        const key = process.env.BASIC_KEY_BYTE;
        if ((after === undefined) !== (key === undefined)) throw new Error('Both key event fields are required');
        const event = after === undefined ? null : {after,key:Number(key)};
        const result = runNative(readFileSync(0, 'utf8'),{event});
        process.stdout.write(result.output);
        process.exitCode = result.status;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
