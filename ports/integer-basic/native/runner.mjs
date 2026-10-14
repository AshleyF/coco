// Logical console adapter. All BASIC work is performed by the loaded 6809 code.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CoCo } from '../../../coco-machine.js';

const binary = readFileSync(new URL('../build/prompt.bin', import.meta.url));
const symbols = Object.fromEntries(readFileSync(new URL('../build/prompt.sym', import.meta.url), 'utf8')
    .trim().split('\n').map(line => {
        const m = /^(\w+) EQU \$([\da-f]+)$/i.exec(line.trim());
        if (!m) throw new Error(`Unexpected assembler symbol: ${line}`);
        return [m[1], parseInt(m[2],16)];
    }));

export function runNative(source, { budget = 5_000_000 } = {}) {
    const machine = new CoCo();
    machine.mem.loadROM(readFileSync(new URL('../../../roms/bas13.rom', import.meta.url)), 0xa000);
    machine.mem.loadROM(readFileSync(new URL('../../../roms/extbas11.rom', import.meta.url)), 0x8000);
    machine.reset();
    for (let i = 0; i < 120; i++) machine.stepFrame();
    if (!machine.readTextScreen().includes('OK')) throw new Error('Color BASIC did not boot');
    machine.loadDECB(binary, { execute: true });
    const cpu = machine.cpu;
    const keyin = cpu.read16(0xa000);
    const charout = cpu.read16(0xa002);
    let cursor = 0, output = '';
    for (let steps = 0; steps < budget; steps++) {
        // Supply keyboard bytes at the Color BASIC ABI entry. This is the only
        // replaced ROM service; the stack return and A/Z contract match KEYIN.
        if (cpu.pc === keyin) {
            if (cursor === source.length) return { output, status: 0, machine };
            let key = source.charCodeAt(cursor++);
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
        if (cpu.pc === charout && cpu.read16(cpu.s) === symbols.cout_return) {
            const ch = cpu.a & 0x7f;
            output += ch === 13 ? '\n' : String.fromCharCode(ch);
        }
        cpu.step();
    }
    return { output, status: 2, machine };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const result = runNative(readFileSync(0, 'utf8'));
        process.stdout.write(result.output);
        process.exitCode = result.status;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
