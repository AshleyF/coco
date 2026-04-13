// debug.js — Debugger for the MC6809E CPU
// Provides disassembly, stepping, breakpoints, tracing, memory inspection

// Disassembly tables
const MNEMONICS = {
    // Page 1 — direct/indexed/extended memory ops ($00-$0F, $60-$6F, $70-$7F)
    0x00: ['NEG', 'direct'],   0x03: ['COM', 'direct'],   0x04: ['LSR', 'direct'],
    0x06: ['ROR', 'direct'],   0x07: ['ASR', 'direct'],   0x08: ['ASL', 'direct'],
    0x09: ['ROL', 'direct'],   0x0A: ['DEC', 'direct'],   0x0C: ['INC', 'direct'],
    0x0D: ['TST', 'direct'],   0x0E: ['JMP', 'direct'],   0x0F: ['CLR', 'direct'],

    0x12: ['NOP', 'inherent'], 0x13: ['SYNC', 'inherent'],
    0x16: ['LBRA', 'rel16'],   0x17: ['LBSR', 'rel16'],
    0x19: ['DAA', 'inherent'], 0x1A: ['ORCC', 'imm8'],    0x1C: ['ANDCC', 'imm8'],
    0x1D: ['SEX', 'inherent'], 0x1E: ['EXG', 'r2r'],      0x1F: ['TFR', 'r2r'],

    // Short branches
    0x20: ['BRA', 'rel8'],  0x21: ['BRN', 'rel8'],  0x22: ['BHI', 'rel8'],  0x23: ['BLS', 'rel8'],
    0x24: ['BCC', 'rel8'],  0x25: ['BCS', 'rel8'],  0x26: ['BNE', 'rel8'],  0x27: ['BEQ', 'rel8'],
    0x28: ['BVC', 'rel8'],  0x29: ['BVS', 'rel8'],  0x2A: ['BPL', 'rel8'],  0x2B: ['BMI', 'rel8'],
    0x2C: ['BGE', 'rel8'],  0x2D: ['BLT', 'rel8'],  0x2E: ['BGT', 'rel8'],  0x2F: ['BLE', 'rel8'],

    // Misc
    0x30: ['LEAX', 'indexed'], 0x31: ['LEAY', 'indexed'], 0x32: ['LEAS', 'indexed'],
    0x33: ['LEAU', 'indexed'], 0x34: ['PSHS', 'reglist'], 0x35: ['PULS', 'reglist'],
    0x36: ['PSHU', 'reglist'], 0x37: ['PULU', 'reglist'],
    0x39: ['RTS', 'inherent'], 0x3A: ['ABX', 'inherent'], 0x3B: ['RTI', 'inherent'],
    0x3C: ['CWAI', 'imm8'],   0x3D: ['MUL', 'inherent'], 0x3F: ['SWI', 'inherent'],

    // A inherent
    0x40: ['NEGA', 'inherent'], 0x43: ['COMA', 'inherent'], 0x44: ['LSRA', 'inherent'],
    0x46: ['RORA', 'inherent'], 0x47: ['ASRA', 'inherent'], 0x48: ['ASLA', 'inherent'],
    0x49: ['ROLA', 'inherent'], 0x4A: ['DECA', 'inherent'], 0x4C: ['INCA', 'inherent'],
    0x4D: ['TSTA', 'inherent'], 0x4F: ['CLRA', 'inherent'],

    // B inherent
    0x50: ['NEGB', 'inherent'], 0x53: ['COMB', 'inherent'], 0x54: ['LSRB', 'inherent'],
    0x56: ['RORB', 'inherent'], 0x57: ['ASRB', 'inherent'], 0x58: ['ASLB', 'inherent'],
    0x59: ['ROLB', 'inherent'], 0x5A: ['DECB', 'inherent'], 0x5C: ['INCB', 'inherent'],
    0x5D: ['TSTB', 'inherent'], 0x5F: ['CLRB', 'inherent'],

    // Indexed mem ops
    0x60: ['NEG', 'indexed'], 0x63: ['COM', 'indexed'], 0x64: ['LSR', 'indexed'],
    0x66: ['ROR', 'indexed'], 0x67: ['ASR', 'indexed'], 0x68: ['ASL', 'indexed'],
    0x69: ['ROL', 'indexed'], 0x6A: ['DEC', 'indexed'], 0x6C: ['INC', 'indexed'],
    0x6D: ['TST', 'indexed'], 0x6E: ['JMP', 'indexed'], 0x6F: ['CLR', 'indexed'],

    // Extended mem ops
    0x70: ['NEG', 'extended'], 0x73: ['COM', 'extended'], 0x74: ['LSR', 'extended'],
    0x76: ['ROR', 'extended'], 0x77: ['ASR', 'extended'], 0x78: ['ASL', 'extended'],
    0x79: ['ROL', 'extended'], 0x7A: ['DEC', 'extended'], 0x7C: ['INC', 'extended'],
    0x7D: ['TST', 'extended'], 0x7E: ['JMP', 'extended'], 0x7F: ['CLR', 'extended'],

    // A-group: imm/direct/indexed/extended
    0x80: ['SUBA', 'imm8'],   0x81: ['CMPA', 'imm8'],   0x82: ['SBCA', 'imm8'],
    0x83: ['SUBD', 'imm16'],  0x84: ['ANDA', 'imm8'],   0x85: ['BITA', 'imm8'],
    0x86: ['LDA', 'imm8'],    0x88: ['EORA', 'imm8'],   0x89: ['ADCA', 'imm8'],
    0x8A: ['ORA', 'imm8'],    0x8B: ['ADDA', 'imm8'],   0x8C: ['CMPX', 'imm16'],
    0x8D: ['BSR', 'rel8'],    0x8E: ['LDX', 'imm16'],

    0x90: ['SUBA', 'direct'], 0x91: ['CMPA', 'direct'], 0x92: ['SBCA', 'direct'],
    0x93: ['SUBD', 'direct'], 0x94: ['ANDA', 'direct'], 0x95: ['BITA', 'direct'],
    0x96: ['LDA', 'direct'],  0x97: ['STA', 'direct'],  0x98: ['EORA', 'direct'],
    0x99: ['ADCA', 'direct'], 0x9A: ['ORA', 'direct'],  0x9B: ['ADDA', 'direct'],
    0x9C: ['CMPX', 'direct'], 0x9D: ['JSR', 'direct'],  0x9E: ['LDX', 'direct'],
    0x9F: ['STX', 'direct'],

    0xA0: ['SUBA', 'indexed'], 0xA1: ['CMPA', 'indexed'], 0xA2: ['SBCA', 'indexed'],
    0xA3: ['SUBD', 'indexed'], 0xA4: ['ANDA', 'indexed'], 0xA5: ['BITA', 'indexed'],
    0xA6: ['LDA', 'indexed'],  0xA7: ['STA', 'indexed'],  0xA8: ['EORA', 'indexed'],
    0xA9: ['ADCA', 'indexed'], 0xAA: ['ORA', 'indexed'],  0xAB: ['ADDA', 'indexed'],
    0xAC: ['CMPX', 'indexed'], 0xAD: ['JSR', 'indexed'],  0xAE: ['LDX', 'indexed'],
    0xAF: ['STX', 'indexed'],

    0xB0: ['SUBA', 'extended'], 0xB1: ['CMPA', 'extended'], 0xB2: ['SBCA', 'extended'],
    0xB3: ['SUBD', 'extended'], 0xB4: ['ANDA', 'extended'], 0xB5: ['BITA', 'extended'],
    0xB6: ['LDA', 'extended'],  0xB7: ['STA', 'extended'],  0xB8: ['EORA', 'extended'],
    0xB9: ['ADCA', 'extended'], 0xBA: ['ORA', 'extended'],  0xBB: ['ADDA', 'extended'],
    0xBC: ['CMPX', 'extended'], 0xBD: ['JSR', 'extended'],  0xBE: ['LDX', 'extended'],
    0xBF: ['STX', 'extended'],

    // B-group: imm/direct/indexed/extended
    0xC0: ['SUBB', 'imm8'],   0xC1: ['CMPB', 'imm8'],   0xC2: ['SBCB', 'imm8'],
    0xC3: ['ADDD', 'imm16'],  0xC4: ['ANDB', 'imm8'],   0xC5: ['BITB', 'imm8'],
    0xC6: ['LDB', 'imm8'],    0xC8: ['EORB', 'imm8'],   0xC9: ['ADCB', 'imm8'],
    0xCA: ['ORB', 'imm8'],    0xCB: ['ADDB', 'imm8'],   0xCC: ['LDD', 'imm16'],
    0xCE: ['LDU', 'imm16'],

    0xD0: ['SUBB', 'direct'], 0xD1: ['CMPB', 'direct'], 0xD2: ['SBCB', 'direct'],
    0xD3: ['ADDD', 'direct'], 0xD4: ['ANDB', 'direct'], 0xD5: ['BITB', 'direct'],
    0xD6: ['LDB', 'direct'],  0xD7: ['STB', 'direct'],  0xD8: ['EORB', 'direct'],
    0xD9: ['ADCB', 'direct'], 0xDA: ['ORB', 'direct'],  0xDB: ['ADDB', 'direct'],
    0xDC: ['LDD', 'direct'],  0xDD: ['STD', 'direct'],  0xDE: ['LDU', 'direct'],
    0xDF: ['STU', 'direct'],

    0xE0: ['SUBB', 'indexed'], 0xE1: ['CMPB', 'indexed'], 0xE2: ['SBCB', 'indexed'],
    0xE3: ['ADDD', 'indexed'], 0xE4: ['ANDB', 'indexed'], 0xE5: ['BITB', 'indexed'],
    0xE6: ['LDB', 'indexed'],  0xE7: ['STB', 'indexed'],  0xE8: ['EORB', 'indexed'],
    0xE9: ['ADCB', 'indexed'], 0xEA: ['ORB', 'indexed'],  0xEB: ['ADDB', 'indexed'],
    0xEC: ['LDD', 'indexed'],  0xED: ['STD', 'indexed'],  0xEE: ['LDU', 'indexed'],
    0xEF: ['STU', 'indexed'],

    0xF0: ['SUBB', 'extended'], 0xF1: ['CMPB', 'extended'], 0xF2: ['SBCB', 'extended'],
    0xF3: ['ADDD', 'extended'], 0xF4: ['ANDB', 'extended'], 0xF5: ['BITB', 'extended'],
    0xF6: ['LDB', 'extended'],  0xF7: ['STB', 'extended'],  0xF8: ['EORB', 'extended'],
    0xF9: ['ADCB', 'extended'], 0xFA: ['ORB', 'extended'],  0xFB: ['ADDB', 'extended'],
    0xFC: ['LDD', 'extended'],  0xFD: ['STD', 'extended'],  0xFE: ['LDU', 'extended'],
    0xFF: ['STU', 'extended'],
};

const PAGE2_MNEMONICS = {
    0x21: ['LBRN', 'rel16'], 0x22: ['LBHI', 'rel16'], 0x23: ['LBLS', 'rel16'],
    0x24: ['LBCC', 'rel16'], 0x25: ['LBCS', 'rel16'], 0x26: ['LBNE', 'rel16'],
    0x27: ['LBEQ', 'rel16'], 0x28: ['LBVC', 'rel16'], 0x29: ['LBVS', 'rel16'],
    0x2A: ['LBPL', 'rel16'], 0x2B: ['LBMI', 'rel16'], 0x2C: ['LBGE', 'rel16'],
    0x2D: ['LBLT', 'rel16'], 0x2E: ['LBGT', 'rel16'], 0x2F: ['LBLE', 'rel16'],
    0x3F: ['SWI2', 'inherent'],
    0x83: ['CMPD', 'imm16'], 0x93: ['CMPD', 'direct'], 0xA3: ['CMPD', 'indexed'], 0xB3: ['CMPD', 'extended'],
    0x8C: ['CMPY', 'imm16'], 0x9C: ['CMPY', 'direct'], 0xAC: ['CMPY', 'indexed'], 0xBC: ['CMPY', 'extended'],
    0x8E: ['LDY', 'imm16'],  0x9E: ['LDY', 'direct'],  0xAE: ['LDY', 'indexed'],  0xBE: ['LDY', 'extended'],
    0x9F: ['STY', 'direct'],  0xAF: ['STY', 'indexed'],  0xBF: ['STY', 'extended'],
    0xCE: ['LDS', 'imm16'],  0xDE: ['LDS', 'direct'],  0xEE: ['LDS', 'indexed'],  0xFE: ['LDS', 'extended'],
    0xDF: ['STS', 'direct'],  0xEF: ['STS', 'indexed'],  0xFF: ['STS', 'extended'],
};

const PAGE3_MNEMONICS = {
    0x3F: ['SWI3', 'inherent'],
    0x83: ['CMPU', 'imm16'], 0x93: ['CMPU', 'direct'], 0xA3: ['CMPU', 'indexed'], 0xB3: ['CMPU', 'extended'],
    0x8C: ['CMPS', 'imm16'], 0x9C: ['CMPS', 'direct'], 0xAC: ['CMPS', 'indexed'], 0xBC: ['CMPS', 'extended'],
};

const REG_NAMES = ['D', 'X', 'Y', 'U', 'S', 'PC', '?', '?', 'A', 'B', 'CC', 'DP'];
const IDX_REGS = ['X', 'Y', 'U', 'S'];

const PSH_REGS_S = ['CC', 'A', 'B', 'DP', 'X', 'Y', 'U', 'PC'];
const PSH_REGS_U = ['CC', 'A', 'B', 'DP', 'X', 'Y', 'S', 'PC'];

function hex8(v) { return '$' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
function hex16(v) { return '$' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); }

function formatRegList(postbyte, isU) {
    const names = isU ? PSH_REGS_U : PSH_REGS_S;
    const regs = [];
    for (let i = 0; i < 8; i++) {
        if (postbyte & (1 << i)) regs.push(names[i]);
    }
    return regs.join(',');
}

function formatIndexed(read, addr) {
    const post = read(addr);
    let len = 1;
    const regBits = (post >> 5) & 0x03;
    const reg = IDX_REGS[regBits];

    if ((post & 0x80) === 0) {
        let off = post & 0x1F;
        if (off & 0x10) off = off - 32;
        return [off === 0 ? `,${reg}` : `${off},${reg}`, len];
    }

    const indirect = !!(post & 0x10);
    const type = post & 0x0F;
    let text;

    switch (type) {
        case 0x00: text = `,${reg}+`; break;
        case 0x01: text = `,${reg}++`; break;
        case 0x02: text = `,-${reg}`; break;
        case 0x03: text = `,--${reg}`; break;
        case 0x04: text = `,${reg}`; break;
        case 0x05: text = `B,${reg}`; break;
        case 0x06: text = `A,${reg}`; break;
        case 0x08: {
            const off = read(addr + 1);
            const soff = (off & 0x80) ? off - 256 : off;
            text = `${soff},${reg}`;
            len = 2;
            break;
        }
        case 0x09: {
            const off = (read(addr + 1) << 8) | read(addr + 2);
            text = `${hex16(off)},${reg}`;
            len = 3;
            break;
        }
        case 0x0B: text = `D,${reg}`; break;
        case 0x0C: {
            const off = read(addr + 1);
            const soff = (off & 0x80) ? off - 256 : off;
            text = `${soff},PCR`;
            len = 2;
            break;
        }
        case 0x0D: {
            const off = (read(addr + 1) << 8) | read(addr + 2);
            text = `${hex16(off)},PCR`;
            len = 3;
            break;
        }
        case 0x0F: {
            const off = (read(addr + 1) << 8) | read(addr + 2);
            return [`[${hex16(off)}]`, 3];
        }
        default: text = '???'; break;
    }

    if (indirect) text = `[${text}]`;
    return [text, len];
}

export class Debugger {
    constructor(cpu, read) {
        this.cpu = cpu;
        this.read = read;
        this.breakpoints = new Set();
        this.traceLog = [];
        this.tracing = false;
        this.maxTraceSize = 10000;
    }

    // Disassemble one instruction at addr, return { text, bytes, addr, nextAddr }
    disassembleAt(addr) {
        const startAddr = addr;
        let opcode = this.read(addr++);
        let mnemoTable = MNEMONICS;

        // Handle page prefixes
        let prefix = '';
        if (opcode === 0x10) {
            prefix = '10 ';
            mnemoTable = PAGE2_MNEMONICS;
            opcode = this.read(addr++);
        } else if (opcode === 0x11) {
            prefix = '11 ';
            mnemoTable = PAGE3_MNEMONICS;
            opcode = this.read(addr++);
        }

        const entry = mnemoTable[opcode];
        if (!entry) {
            return {
                text: `??? ${prefix}${hex8(opcode)}`,
                bytes: addr - startAddr,
                addr: startAddr,
                nextAddr: addr
            };
        }

        const [mnemonic, mode] = entry;
        let operand = '';

        switch (mode) {
            case 'inherent':
                break;
            case 'imm8':
                operand = ' #' + hex8(this.read(addr++));
                break;
            case 'imm16':
                operand = ' #' + hex16((this.read(addr) << 8) | this.read(addr + 1));
                addr += 2;
                break;
            case 'direct':
                operand = ' <' + hex8(this.read(addr++));
                break;
            case 'extended':
                operand = ' ' + hex16((this.read(addr) << 8) | this.read(addr + 1));
                addr += 2;
                break;
            case 'indexed': {
                const [text, len] = formatIndexed(this.read, addr);
                operand = ' ' + text;
                addr += len;
                break;
            }
            case 'rel8': {
                const off = this.read(addr++);
                const target = (addr + ((off & 0x80) ? off - 256 : off)) & 0xFFFF;
                operand = ' ' + hex16(target);
                break;
            }
            case 'rel16': {
                const off = (this.read(addr) << 8) | this.read(addr + 1);
                addr += 2;
                const target = (addr + ((off & 0x8000) ? off - 0x10000 : off)) & 0xFFFF;
                operand = ' ' + hex16(target);
                break;
            }
            case 'r2r': {
                const post = this.read(addr++);
                const src = REG_NAMES[(post >> 4) & 0x0F] || '?';
                const dst = REG_NAMES[post & 0x0F] || '?';
                operand = ` ${src},${dst}`;
                break;
            }
            case 'reglist': {
                const post = this.read(addr++);
                const isU = mnemonic.includes('U');
                operand = ' ' + formatRegList(post, isU);
                break;
            }
        }

        return {
            text: `${mnemonic}${operand}`,
            bytes: addr - startAddr,
            addr: startAddr,
            nextAddr: addr
        };
    }

    // Disassemble n instructions starting at addr
    disassemble(addr, count = 10) {
        const lines = [];
        for (let i = 0; i < count; i++) {
            const d = this.disassembleAt(addr);
            // Build hex byte dump
            let hexBytes = '';
            for (let j = 0; j < d.bytes; j++) {
                hexBytes += this.read(d.addr + j).toString(16).toUpperCase().padStart(2, '0') + ' ';
            }
            lines.push({
                addr: d.addr,
                hex: hexBytes.trim(),
                text: d.text,
                nextAddr: d.nextAddr
            });
            addr = d.nextAddr;
        }
        return lines;
    }

    // Format register dump as a string
    dumpRegisters() {
        const c = this.cpu;
        const ccStr = [
            c.flagE ? 'E' : '-', c.flagF ? 'F' : '-',
            c.flagH ? 'H' : '-', c.flagI ? 'I' : '-',
            c.flagN ? 'N' : '-', c.flagZ ? 'Z' : '-',
            c.flagV ? 'V' : '-', c.flagC ? 'C' : '-',
        ].join('');
        return [
            `PC=${hex16(c.pc)} A=${hex8(c.a)} B=${hex8(c.b)} D=${hex16(c.d)}`,
            `X=${hex16(c.x)} Y=${hex16(c.y)} U=${hex16(c.u)} S=${hex16(c.s)}`,
            `DP=${hex8(c.dp)} CC=${hex8(c.cc)} [${ccStr}]`,
            `Cycles=${c.cycles}`
        ].join('\n');
    }

    // Hex dump of memory
    dumpMemory(start, length = 64) {
        const lines = [];
        for (let i = 0; i < length; i += 16) {
            const addr = (start + i) & 0xFFFF;
            let hex = '';
            let ascii = '';
            for (let j = 0; j < 16 && (i + j) < length; j++) {
                const b = this.read((addr + j) & 0xFFFF);
                hex += b.toString(16).toUpperCase().padStart(2, '0') + ' ';
                ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
            }
            lines.push(`${hex16(addr)}: ${hex.padEnd(48)}${ascii}`);
        }
        return lines.join('\n');
    }

    // Breakpoints
    addBreakpoint(addr) { this.breakpoints.add(addr & 0xFFFF); }
    removeBreakpoint(addr) { this.breakpoints.delete(addr & 0xFFFF); }
    clearBreakpoints() { this.breakpoints.clear(); }

    // Step one instruction, return { instruction, cycles, regs }
    stepDebug() {
        const pc = this.cpu.pc;
        const dis = this.disassembleAt(pc);
        const cycles = this.cpu.step();
        const entry = {
            addr: pc,
            instruction: dis.text,
            cycles,
            regs: this.getRegsSnapshot()
        };
        if (this.tracing) {
            this.traceLog.push(entry);
            if (this.traceLog.length > this.maxTraceSize) {
                this.traceLog.shift();
            }
        }
        return entry;
    }

    // Run until breakpoint or maxCycles
    runUntilBreak(maxCycles = 1000000) {
        let total = 0;
        while (total < maxCycles) {
            if (this.breakpoints.has(this.cpu.pc)) {
                return { reason: 'breakpoint', addr: this.cpu.pc, cycles: total };
            }
            total += this.cpu.step();
        }
        return { reason: 'maxCycles', cycles: total };
    }

    // Snapshot of registers
    getRegsSnapshot() {
        const c = this.cpu;
        return {
            pc: c.pc, a: c.a, b: c.b, d: c.d,
            x: c.x, y: c.y, u: c.u, s: c.s,
            dp: c.dp, cc: c.cc,
            flagE: c.flagE, flagF: c.flagF, flagH: c.flagH, flagI: c.flagI,
            flagN: c.flagN, flagZ: c.flagZ, flagV: c.flagV, flagC: c.flagC,
            cycles: c.cycles
        };
    }

    // Trace on/off
    enableTrace() { this.tracing = true; }
    disableTrace() { this.tracing = false; }
    clearTrace() { this.traceLog = []; }

    // Format trace log
    formatTrace(count) {
        const entries = count ? this.traceLog.slice(-count) : this.traceLog;
        return entries.map(e =>
            `${hex16(e.addr)} ${e.instruction.padEnd(20)} [${e.cycles}c]`
        ).join('\n');
    }
}
