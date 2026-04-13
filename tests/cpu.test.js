// cpu.test.js — Comprehensive MC6809E CPU tests
import { MC6809 } from '../cpu.js';
import { Debugger } from '../debug.js';
import { suite, test, eq, isTrue, isFalse, summary, setOutput } from './run.js';

setOutput(document.getElementById('output'));

// Helper: create a CPU with a small program loaded at addr
function makeCPU(program, startAddr = 0x0000) {
    const mem = new Uint8Array(0x10000);
    for (let i = 0; i < program.length; i++) {
        mem[(startAddr + i) & 0xFFFF] = program[i];
    }
    const cpu = new MC6809(
        addr => mem[addr & 0xFFFF],
        (addr, val) => { mem[addr & 0xFFFF] = val & 0xFF; }
    );
    cpu.pc = startAddr;
    cpu.mem = mem; // expose for test inspection
    return cpu;
}

// ===================================================================
// 8-bit Load / Store
// ===================================================================
suite('Load/Store 8-bit');

test('LDA immediate', () => {
    const cpu = makeCPU([0x86, 0x42]); // LDA #$42
    cpu.step();
    eq(cpu.a, 0x42, 'A');
    isFalse(cpu.flagN, 'N');
    isFalse(cpu.flagZ, 'Z');
    isFalse(cpu.flagV, 'V');
});

test('LDA immediate zero sets Z', () => {
    const cpu = makeCPU([0x86, 0x00]);
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagN, 'N');
});

test('LDA immediate negative sets N', () => {
    const cpu = makeCPU([0x86, 0x80]);
    cpu.step();
    eq(cpu.a, 0x80, 'A');
    isTrue(cpu.flagN, 'N');
    isFalse(cpu.flagZ, 'Z');
});

test('LDB immediate', () => {
    const cpu = makeCPU([0xC6, 0xFF]);
    cpu.step();
    eq(cpu.b, 0xFF, 'B');
    isTrue(cpu.flagN, 'N');
});

test('STA direct', () => {
    const cpu = makeCPU([0x97, 0x50]);
    cpu.a = 0x42;
    cpu.dp = 0x00;
    cpu.step();
    eq(cpu.mem[0x0050], 0x42, 'mem');
});

test('STB extended', () => {
    const cpu = makeCPU([0xF7, 0x12, 0x34]);
    cpu.b = 0xAB;
    cpu.step();
    eq(cpu.mem[0x1234], 0xAB, 'mem');
});

test('LDA direct', () => {
    const cpu = makeCPU([0x96, 0x50]);
    cpu.dp = 0x00;
    cpu.mem[0x0050] = 0x77;
    cpu.step();
    eq(cpu.a, 0x77, 'A');
});

test('LDA extended', () => {
    const cpu = makeCPU([0xB6, 0x20, 0x00]);
    cpu.mem[0x2000] = 0x99;
    cpu.step();
    eq(cpu.a, 0x99, 'A');
});

// ===================================================================
// 16-bit Load / Store
// ===================================================================
suite('Load/Store 16-bit');

test('LDD immediate', () => {
    const cpu = makeCPU([0xCC, 0x12, 0x34]);
    cpu.step();
    eq(cpu.a, 0x12, 'A');
    eq(cpu.b, 0x34, 'B');
    eq(cpu.d, 0x1234, 'D');
});

test('LDX immediate', () => {
    const cpu = makeCPU([0x8E, 0xAB, 0xCD]);
    cpu.step();
    eq(cpu.x, 0xABCD, 'X');
    isTrue(cpu.flagN, 'N');
});

test('LDU immediate', () => {
    const cpu = makeCPU([0xCE, 0x00, 0x00]);
    cpu.step();
    eq(cpu.u, 0x0000, 'U');
    isTrue(cpu.flagZ, 'Z');
});

test('STD direct', () => {
    const cpu = makeCPU([0xDD, 0x10]);
    cpu.dp = 0x00;
    cpu.a = 0xAB;
    cpu.b = 0xCD;
    cpu.step();
    eq(cpu.mem[0x0010], 0xAB, 'high byte');
    eq(cpu.mem[0x0011], 0xCD, 'low byte');
});

test('STX extended', () => {
    const cpu = makeCPU([0xBF, 0x30, 0x00]);
    cpu.x = 0x1234;
    cpu.step();
    eq(cpu.mem[0x3000], 0x12, 'high byte');
    eq(cpu.mem[0x3001], 0x34, 'low byte');
});

// ===================================================================
// 8-bit Arithmetic
// ===================================================================
suite('Arithmetic 8-bit');

test('ADDA immediate', () => {
    const cpu = makeCPU([0x8B, 0x10]);
    cpu.a = 0x20;
    cpu.step();
    eq(cpu.a, 0x30, 'A');
    isFalse(cpu.flagC, 'C');
    isFalse(cpu.flagV, 'V');
});

test('ADDA carry', () => {
    const cpu = makeCPU([0x8B, 0x01]);
    cpu.a = 0xFF;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('ADDA overflow', () => {
    const cpu = makeCPU([0x8B, 0x50]);
    cpu.a = 0x50; // 80 + 80 = 160 > 127, signed overflow
    cpu.step();
    eq(cpu.a, 0xA0, 'A');
    isTrue(cpu.flagV, 'V');
    isTrue(cpu.flagN, 'N');
});

test('ADDA half carry', () => {
    const cpu = makeCPU([0x8B, 0x08]);
    cpu.a = 0x08; // 8 + 8 = 16, carry from bit 3
    cpu.step();
    eq(cpu.a, 0x10, 'A');
    isTrue(cpu.flagH, 'H');
});

test('ADDB immediate', () => {
    const cpu = makeCPU([0xCB, 0x05]);
    cpu.b = 0x03;
    cpu.step();
    eq(cpu.b, 0x08, 'B');
});

test('SUBA immediate', () => {
    const cpu = makeCPU([0x80, 0x03]);
    cpu.a = 0x10;
    cpu.step();
    eq(cpu.a, 0x0D, 'A');
    isFalse(cpu.flagC, 'C');
});

test('SUBA borrow', () => {
    const cpu = makeCPU([0x80, 0x05]);
    cpu.a = 0x03;
    cpu.step();
    eq(cpu.a, 0xFE, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagN, 'N');
});

test('SUBA overflow', () => {
    const cpu = makeCPU([0x80, 0x81]); // $80 - $81 (-128 - (-127)) = -1
    cpu.a = 0x80;
    // Actually: 0x80 - 0x81 = -1, which is fine for signed. Let me pick a real overflow case.
    // Overflow: positive - negative = negative result (crossed)
    // 0x50 - 0xD0: 80 - (-48) = 128 > 127
    const cpu2 = makeCPU([0x80, 0xD0]);
    cpu2.a = 0x50;
    cpu2.step();
    eq(cpu2.a, 0x80, 'A');
    isTrue(cpu2.flagV, 'V');
});

test('ADCA with carry', () => {
    const cpu = makeCPU([0x89, 0x01]);
    cpu.a = 0x10;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0x12, 'A'); // 0x10 + 0x01 + carry = 0x12
});

test('SBCA with carry', () => {
    const cpu = makeCPU([0x82, 0x01]);
    cpu.a = 0x10;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0x0E, 'A'); // 0x10 - 0x01 - carry = 0x0E
});

test('CMPA immediate equal', () => {
    const cpu = makeCPU([0x81, 0x42]);
    cpu.a = 0x42;
    cpu.step();
    eq(cpu.a, 0x42, 'A unchanged');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagC, 'C');
});

test('CMPA immediate less', () => {
    const cpu = makeCPU([0x81, 0x50]);
    cpu.a = 0x20;
    cpu.step();
    isTrue(cpu.flagC, 'C'); // borrow
    isFalse(cpu.flagZ, 'Z');
});

// ===================================================================
// 16-bit Arithmetic
// ===================================================================
suite('Arithmetic 16-bit');

test('ADDD immediate', () => {
    const cpu = makeCPU([0xC3, 0x10, 0x00]);
    cpu.a = 0x01; cpu.b = 0x00; // D = $0100
    cpu.step();
    eq(cpu.d, 0x1100, 'D');
    isFalse(cpu.flagC, 'C');
});

test('ADDD carry', () => {
    const cpu = makeCPU([0xC3, 0x00, 0x01]);
    cpu.a = 0xFF; cpu.b = 0xFF; // D = $FFFF
    cpu.step();
    eq(cpu.d, 0x0000, 'D');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('SUBD immediate', () => {
    const cpu = makeCPU([0x83, 0x00, 0x10]);
    cpu.a = 0x01; cpu.b = 0x00; // D = $0100
    cpu.step();
    eq(cpu.d, 0x00F0, 'D');
});

test('CMPX immediate', () => {
    const cpu = makeCPU([0x8C, 0x10, 0x00]);
    cpu.x = 0x1000;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
    eq(cpu.x, 0x1000, 'X unchanged');
});

// ===================================================================
// Logic
// ===================================================================
suite('Logic');

test('ANDA immediate', () => {
    const cpu = makeCPU([0x84, 0x0F]);
    cpu.a = 0xAB;
    cpu.step();
    eq(cpu.a, 0x0B, 'A');
    isFalse(cpu.flagV, 'V cleared');
});

test('ORA immediate', () => {
    const cpu = makeCPU([0x8A, 0xF0]);
    cpu.a = 0x0A;
    cpu.step();
    eq(cpu.a, 0xFA, 'A');
    isTrue(cpu.flagN, 'N');
});

test('EORA immediate', () => {
    const cpu = makeCPU([0x88, 0xFF]);
    cpu.a = 0xAA;
    cpu.step();
    eq(cpu.a, 0x55, 'A');
    isFalse(cpu.flagN, 'N');
});

test('BITA immediate', () => {
    const cpu = makeCPU([0x85, 0x80]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x80, 'A unchanged');
    isTrue(cpu.flagN, 'N');
    isFalse(cpu.flagZ, 'Z');
});

test('BITA zero result', () => {
    const cpu = makeCPU([0x85, 0x0F]);
    cpu.a = 0xF0;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
});

test('ANDB immediate', () => {
    const cpu = makeCPU([0xC4, 0x55]);
    cpu.b = 0xFF;
    cpu.step();
    eq(cpu.b, 0x55, 'B');
});

// ===================================================================
// Shifts and Rotates
// ===================================================================
suite('Shifts & Rotates');

test('ASLA', () => {
    const cpu = makeCPU([0x48]);
    cpu.a = 0x55; // 01010101 → 10101010
    cpu.step();
    eq(cpu.a, 0xAA, 'A');
    isFalse(cpu.flagC, 'C');
    isTrue(cpu.flagN, 'N');
});

test('ASLA carry out', () => {
    const cpu = makeCPU([0x48]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
    isTrue(cpu.flagZ, 'Z');
});

test('LSRA', () => {
    const cpu = makeCPU([0x44]);
    cpu.a = 0xAA; // 10101010 → 01010101
    cpu.step();
    eq(cpu.a, 0x55, 'A');
    isFalse(cpu.flagC, 'C');
    isFalse(cpu.flagN, 'N');
});

test('LSRA carry out', () => {
    const cpu = makeCPU([0x44]);
    cpu.a = 0x01;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagC, 'C');
});

test('ASRA preserves sign', () => {
    const cpu = makeCPU([0x47]);
    cpu.a = 0x80; // 10000000 → 11000000
    cpu.step();
    eq(cpu.a, 0xC0, 'A');
    isTrue(cpu.flagN, 'N');
});

test('ROLA through carry', () => {
    const cpu = makeCPU([0x49]);
    cpu.a = 0x55;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0xAB, 'A'); // 01010101 << 1 | C=1 → 10101011
    isFalse(cpu.flagC, 'C');
});

test('RORA through carry', () => {
    const cpu = makeCPU([0x46]);
    cpu.a = 0xAA;
    cpu.flagC = true;
    cpu.step();
    eq(cpu.a, 0xD5, 'A'); // C=1→bit7, 10101010>>1 → 11010101
    isFalse(cpu.flagC, 'C');
});

test('ASL memory direct', () => {
    const cpu = makeCPU([0x08, 0x50]);
    cpu.dp = 0x00;
    cpu.mem[0x0050] = 0x40;
    cpu.step();
    eq(cpu.mem[0x0050], 0x80, 'mem');
    isFalse(cpu.flagC, 'C');
});

// ===================================================================
// Inc / Dec / Neg / Com / Clr / Tst
// ===================================================================
suite('Inc/Dec/Neg/Com/Clr/Tst');

test('INCA', () => {
    const cpu = makeCPU([0x4C]);
    cpu.a = 0x41;
    cpu.step();
    eq(cpu.a, 0x42, 'A');
});

test('INCA overflow', () => {
    const cpu = makeCPU([0x4C]);
    cpu.a = 0x7F;
    cpu.step();
    eq(cpu.a, 0x80, 'A');
    isTrue(cpu.flagV, 'V');
    isTrue(cpu.flagN, 'N');
});

test('INCA wrap', () => {
    const cpu = makeCPU([0x4C]);
    cpu.a = 0xFF;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagV, 'V');
});

test('DECA', () => {
    const cpu = makeCPU([0x4A]);
    cpu.a = 0x01;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
});

test('DECA overflow', () => {
    const cpu = makeCPU([0x4A]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x7F, 'A');
    isTrue(cpu.flagV, 'V');
});

test('NEGA', () => {
    const cpu = makeCPU([0x40]);
    cpu.a = 0x05;
    cpu.step();
    eq(cpu.a, 0xFB, 'A'); // -5 = $FB
    isTrue(cpu.flagN, 'N');
    isTrue(cpu.flagC, 'C');
});

test('NEGA zero', () => {
    const cpu = makeCPU([0x40]);
    cpu.a = 0x00;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagC, 'C');
});

test('NEGA $80 overflow', () => {
    const cpu = makeCPU([0x40]);
    cpu.a = 0x80;
    cpu.step();
    eq(cpu.a, 0x80, 'A');
    isTrue(cpu.flagV, 'V');
});

test('COMA', () => {
    const cpu = makeCPU([0x43]);
    cpu.a = 0x55;
    cpu.step();
    eq(cpu.a, 0xAA, 'A');
    isTrue(cpu.flagC, 'C set');
    isFalse(cpu.flagV, 'V cleared');
});

test('CLRA', () => {
    const cpu = makeCPU([0x4F]);
    cpu.a = 0xFF;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    isTrue(cpu.flagZ, 'Z');
    isFalse(cpu.flagN, 'N');
    isFalse(cpu.flagC, 'C');
    isFalse(cpu.flagV, 'V');
});

test('TSTA positive', () => {
    const cpu = makeCPU([0x4D]);
    cpu.a = 0x42;
    cpu.step();
    isFalse(cpu.flagZ, 'Z');
    isFalse(cpu.flagN, 'N');
    isFalse(cpu.flagV, 'V');
});

test('TSTA zero', () => {
    const cpu = makeCPU([0x4D]);
    cpu.a = 0x00;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
});

test('INCB', () => {
    const cpu = makeCPU([0x5C]);
    cpu.b = 0x09;
    cpu.step();
    eq(cpu.b, 0x0A, 'B');
});

test('INC memory direct', () => {
    const cpu = makeCPU([0x0C, 0x50]);
    cpu.dp = 0x00;
    cpu.mem[0x0050] = 0x41;
    cpu.step();
    eq(cpu.mem[0x0050], 0x42, 'mem');
});

test('DEC memory extended', () => {
    const cpu = makeCPU([0x7A, 0x10, 0x00]);
    cpu.mem[0x1000] = 0x01;
    cpu.step();
    eq(cpu.mem[0x1000], 0x00, 'mem');
    isTrue(cpu.flagZ, 'Z');
});

// ===================================================================
// Branches
// ===================================================================
suite('Branches');

test('BRA forward', () => {
    const cpu = makeCPU([0x20, 0x05]); // BRA +5
    cpu.step();
    eq(cpu.pc, 0x07, 'PC'); // 0 + 2 (instruction) + 5 (offset)
});

test('BRA backward', () => {
    const cpu = makeCPU([0x12, 0x12, 0x20, 0xFD], 0x0000); // NOP, NOP, BRA -3
    cpu.pc = 0x0002; // start at BRA
    cpu.step();
    eq(cpu.pc, 0x01, 'PC'); // 2 + 2 + (-3) = 1
});

test('BEQ taken', () => {
    const cpu = makeCPU([0x27, 0x04]);
    cpu.flagZ = true;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BEQ not taken', () => {
    const cpu = makeCPU([0x27, 0x04]);
    cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x02, 'PC');
});

test('BNE taken', () => {
    const cpu = makeCPU([0x26, 0x04]);
    cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BCS taken', () => {
    const cpu = makeCPU([0x25, 0x04]);
    cpu.flagC = true;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BCC taken', () => {
    const cpu = makeCPU([0x24, 0x04]);
    cpu.flagC = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BMI taken', () => {
    const cpu = makeCPU([0x2B, 0x04]);
    cpu.flagN = true;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BPL taken', () => {
    const cpu = makeCPU([0x2A, 0x04]);
    cpu.flagN = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BGT taken (N=V, Z=0)', () => {
    const cpu = makeCPU([0x2E, 0x04]);
    cpu.flagN = false; cpu.flagV = false; cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BGT not taken (Z=1)', () => {
    const cpu = makeCPU([0x2E, 0x04]);
    cpu.flagN = false; cpu.flagV = false; cpu.flagZ = true;
    cpu.step();
    eq(cpu.pc, 0x02, 'PC');
});

test('BLE taken (Z=1)', () => {
    const cpu = makeCPU([0x2F, 0x04]);
    cpu.flagZ = true;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BHI taken (!C && !Z)', () => {
    const cpu = makeCPU([0x22, 0x04]);
    cpu.flagC = false; cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('BLS taken (C || Z)', () => {
    const cpu = makeCPU([0x23, 0x04]);
    cpu.flagC = true; cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x06, 'PC');
});

test('LBRA forward', () => {
    const cpu = makeCPU([0x16, 0x01, 0x00]);
    cpu.step();
    eq(cpu.pc, 0x0103, 'PC'); // 0 + 3 + $100
});

test('LBEQ taken', () => {
    const cpu = makeCPU([0x10, 0x27, 0x01, 0x00]);
    cpu.flagZ = true;
    cpu.step();
    eq(cpu.pc, 0x0104, 'PC');
});

test('LBEQ not taken', () => {
    const cpu = makeCPU([0x10, 0x27, 0x01, 0x00]);
    cpu.flagZ = false;
    cpu.step();
    eq(cpu.pc, 0x04, 'PC');
});

// ===================================================================
// Subroutine Calls
// ===================================================================
suite('Subroutine Calls');

test('BSR and RTS', () => {
    // BSR +4, then at target: LDA #$42, RTS
    const cpu = makeCPU([
        0x8D, 0x04,             // $0000: BSR $0006
        0xC6, 0x99,             // $0002: LDB #$99 (return here)
        0x12, 0x12,             // $0004: NOP NOP (padding)
        0x86, 0x42,             // $0006: LDA #$42
        0x39,                   // $0008: RTS
    ]);
    cpu.s = 0x1000;
    cpu.step();                 // BSR
    eq(cpu.pc, 0x06, 'PC after BSR');
    cpu.step();                 // LDA #$42
    eq(cpu.a, 0x42, 'A');
    cpu.step();                 // RTS
    eq(cpu.pc, 0x02, 'PC after RTS');
    cpu.step();                 // LDB #$99
    eq(cpu.b, 0x99, 'B');
});

test('JSR extended and RTS', () => {
    const cpu = makeCPU([
        0xBD, 0x00, 0x10,      // $0000: JSR $0010
        0x12,                   // $0003: NOP (return point)
    ]);
    cpu.s = 0x1000;
    cpu.mem[0x0010] = 0x86;    // LDA #$55
    cpu.mem[0x0011] = 0x55;
    cpu.mem[0x0012] = 0x39;    // RTS
    cpu.step();                 // JSR
    eq(cpu.pc, 0x10, 'PC after JSR');
    cpu.step();                 // LDA #$55
    cpu.step();                 // RTS
    eq(cpu.pc, 0x03, 'PC after RTS');
});

test('LBSR', () => {
    const cpu = makeCPU([0x17, 0x00, 0x10]); // LBSR +$10
    cpu.s = 0x1000;
    cpu.step();
    eq(cpu.pc, 0x13, 'PC');
    // Return address $0003 should be on stack
    eq(cpu.mem[0x0FFE], 0x00, 'ret hi');
    eq(cpu.mem[0x0FFF], 0x03, 'ret lo');
});

// ===================================================================
// Stack Operations
// ===================================================================
suite('Stack Operations');

test('PSHS/PULS single register', () => {
    const cpu = makeCPU([0x34, 0x02, 0x35, 0x02]); // PSHS A, PULS A
    cpu.s = 0x1000;
    cpu.a = 0x42;
    cpu.step();                 // PSHS A
    eq(cpu.s, 0x0FFF, 'S after push');
    eq(cpu.mem[0x0FFF], 0x42, 'stack');
    cpu.a = 0x00;
    cpu.step();                 // PULS A
    eq(cpu.a, 0x42, 'A restored');
    eq(cpu.s, 0x1000, 'S after pull');
});

test('PSHS multiple registers', () => {
    const cpu = makeCPU([0x34, 0x16]); // PSHS A,B,X  (bits: A=0x02, B=0x04, X=0x10 → 0x16)
    cpu.s = 0x1000;
    cpu.a = 0x11; cpu.b = 0x22; cpu.x = 0x3344;
    cpu.step();
    // Push order: X first (highest bit), then B, then A (lowest bit)
    // Stack grows down, so A ends up at top (lowest addr)
    eq(cpu.mem[0x0FFC], 0x11, 'A (top of stack)');
    eq(cpu.mem[0x0FFD], 0x22, 'B');
    eq(cpu.mem[0x0FFE], 0x33, 'X hi');
    eq(cpu.mem[0x0FFF], 0x44, 'X lo');
    eq(cpu.s, 0x0FFC, 'S');
});

test('PULS PC acts as jump', () => {
    const cpu = makeCPU([0x35, 0x80]); // PULS PC
    cpu.s = 0x0FFE;
    cpu.mem[0x0FFE] = 0x12;
    cpu.mem[0x0FFF] = 0x34;
    cpu.step();
    eq(cpu.pc, 0x1234, 'PC');
});

test('PSHU/PULU', () => {
    const cpu = makeCPU([0x36, 0x04, 0x37, 0x04]); // PSHU B, PULU B
    cpu.u = 0x2000;
    cpu.b = 0x77;
    cpu.step();
    eq(cpu.u, 0x1FFF, 'U after push');
    cpu.b = 0x00;
    cpu.step();
    eq(cpu.b, 0x77, 'B restored');
});

// ===================================================================
// TFR / EXG
// ===================================================================
suite('TFR / EXG');

test('TFR A,B', () => {
    const cpu = makeCPU([0x1F, 0x89]); // TFR A,B
    cpu.a = 0x42;
    cpu.step();
    eq(cpu.b, 0x42, 'B');
    eq(cpu.a, 0x42, 'A unchanged');
});

test('TFR X,Y', () => {
    const cpu = makeCPU([0x1F, 0x12]); // TFR X,Y
    cpu.x = 0x1234;
    cpu.step();
    eq(cpu.y, 0x1234, 'Y');
});

test('EXG A,B', () => {
    const cpu = makeCPU([0x1E, 0x89]); // EXG A,B
    cpu.a = 0x11; cpu.b = 0x22;
    cpu.step();
    eq(cpu.a, 0x22, 'A');
    eq(cpu.b, 0x11, 'B');
});

test('EXG X,Y', () => {
    const cpu = makeCPU([0x1E, 0x12]); // EXG X,Y
    cpu.x = 0x1111; cpu.y = 0x2222;
    cpu.step();
    eq(cpu.x, 0x2222, 'X');
    eq(cpu.y, 0x1111, 'Y');
});

test('TFR D,X', () => {
    const cpu = makeCPU([0x1F, 0x01]); // TFR D,X
    cpu.a = 0xAB; cpu.b = 0xCD;
    cpu.step();
    eq(cpu.x, 0xABCD, 'X');
});

// ===================================================================
// LEA
// ===================================================================
suite('LEA');

test('LEAX offset', () => {
    const cpu = makeCPU([0x30, 0x88, 0x10]); // LEAX $10,X (8-bit offset indexed by X)
    cpu.x = 0x1000;
    cpu.step();
    eq(cpu.x, 0x1010, 'X');
    isFalse(cpu.flagZ, 'Z');
});

test('LEAX zero result sets Z', () => {
    const cpu = makeCPU([0x30, 0x84]); // LEAX ,X (zero offset)
    cpu.x = 0x0000;
    cpu.step();
    eq(cpu.x, 0x0000, 'X');
    isTrue(cpu.flagZ, 'Z');
});

test('LEAY negative offset', () => {
    const cpu = makeCPU([0x31, 0xA8, 0xFC]); // LEAY -4,Y (8-bit signed offset)
    cpu.y = 0x1000;
    cpu.step();
    eq(cpu.y, 0x0FFC, 'Y');
});

test('LEAS 2,S (advance stack by 2)', () => {
    const cpu = makeCPU([0x32, 0xE8, 0x02]); // LEAS 2,S (8-bit offset from S)
    cpu.s = 0x1000;
    cpu.step();
    eq(cpu.s, 0x1002, 'S');
});

// ===================================================================
// Indexed Addressing
// ===================================================================
suite('Indexed Addressing');

test('LDA ,X (zero offset)', () => {
    const cpu = makeCPU([0xA6, 0x84]); // LDA ,X (postbyte $84 = 1 00 0 0100)
    cpu.x = 0x2000;
    cpu.mem[0x2000] = 0x55;
    cpu.step();
    eq(cpu.a, 0x55, 'A');
});

test('LDA 5-bit offset ,X', () => {
    const cpu = makeCPU([0xA6, 0x05]); // LDA 5,X (postbyte $05 = 0 00 00101)
    cpu.x = 0x1000;
    cpu.mem[0x1005] = 0x77;
    cpu.step();
    eq(cpu.a, 0x77, 'A');
});

test('LDA negative 5-bit offset ,X', () => {
    const cpu = makeCPU([0xA6, 0x1F]); // LDA -1,X (postbyte $1F = 0 00 11111)
    cpu.x = 0x1000;
    cpu.mem[0x0FFF] = 0x33;
    cpu.step();
    eq(cpu.a, 0x33, 'A');
});

test('LDA ,X+ (post-increment)', () => {
    const cpu = makeCPU([0xA6, 0x80]); // postbyte $80 = 1 00 0 0000
    cpu.x = 0x2000;
    cpu.mem[0x2000] = 0xAA;
    cpu.step();
    eq(cpu.a, 0xAA, 'A');
    eq(cpu.x, 0x2001, 'X incremented');
});

test('LDA ,X++ (post-increment by 2)', () => {
    const cpu = makeCPU([0xA6, 0x81]); // postbyte $81
    cpu.x = 0x2000;
    cpu.mem[0x2000] = 0xBB;
    cpu.step();
    eq(cpu.a, 0xBB, 'A');
    eq(cpu.x, 0x2002, 'X incremented by 2');
});

test('LDA ,-X (pre-decrement)', () => {
    const cpu = makeCPU([0xA6, 0x82]); // postbyte $82
    cpu.x = 0x2001;
    cpu.mem[0x2000] = 0xCC;
    cpu.step();
    eq(cpu.a, 0xCC, 'A');
    eq(cpu.x, 0x2000, 'X decremented');
});

test('LDA ,--X (pre-decrement by 2)', () => {
    const cpu = makeCPU([0xA6, 0x83]); // postbyte $83
    cpu.x = 0x2002;
    cpu.mem[0x2000] = 0xDD;
    cpu.step();
    eq(cpu.a, 0xDD, 'A');
    eq(cpu.x, 0x2000, 'X decremented by 2');
});

test('LDA B,X (B offset)', () => {
    const cpu = makeCPU([0xA6, 0x85]); // postbyte $85
    cpu.x = 0x1000;
    cpu.b = 0x05;
    cpu.mem[0x1005] = 0xEE;
    cpu.step();
    eq(cpu.a, 0xEE, 'A');
});

test('LDA A,X (A offset)', () => {
    const cpu = makeCPU([0xA6, 0x86]); // postbyte $86
    cpu.x = 0x1000;
    cpu.a = 0x03;
    cpu.mem[0x1003] = 0x44;
    cpu.step();
    eq(cpu.a, 0x44, 'A');
});

test('LDA 8-bit offset,Y', () => {
    const cpu = makeCPU([0xA6, 0xA8, 0x10]); // postbyte $A8 = 1 01 0 1000, 8-bit offset
    cpu.y = 0x3000;
    cpu.mem[0x3010] = 0x55;
    cpu.step();
    eq(cpu.a, 0x55, 'A');
});

test('LDA 16-bit offset,X', () => {
    const cpu = makeCPU([0xA6, 0x89, 0x10, 0x00]); // postbyte $89, 16-bit offset
    cpu.x = 0x1000;
    cpu.mem[0x2000] = 0x66;
    cpu.step();
    eq(cpu.a, 0x66, 'A');
});

test('LDA D,X (D offset)', () => {
    const cpu = makeCPU([0xA6, 0x8B]); // postbyte $8B
    cpu.x = 0x1000;
    cpu.a = 0x00; cpu.b = 0x20; // D = $0020
    cpu.mem[0x1020] = 0x77;
    cpu.step();
    eq(cpu.a, 0x77, 'A');
});

test('LDA n,PCR (8-bit PC-relative)', () => {
    const cpu = makeCPU([0xA6, 0x8C, 0x02]); // postbyte $8C, offset +2
    // After fetching postbyte and offset, PC = 0x0003. EA = PC + 2 = 0x0005
    cpu.mem[0x0005] = 0x88;
    cpu.step();
    eq(cpu.a, 0x88, 'A');
});

test('STA ,Y indexed', () => {
    const cpu = makeCPU([0xA7, 0xA4]); // STA ,Y (postbyte $A4 = 1 01 0 0100)
    cpu.y = 0x4000;
    cpu.a = 0x42;
    cpu.step();
    eq(cpu.mem[0x4000], 0x42, 'mem');
});

// ===================================================================
// Indirect Indexed
// ===================================================================
suite('Indirect Indexed');

test('LDA [,X] (indirect zero offset)', () => {
    const cpu = makeCPU([0xA6, 0x94]); // postbyte $94 = 1 00 1 0100
    cpu.x = 0x2000;
    // pointer at $2000 → $3000
    cpu.mem[0x2000] = 0x30;
    cpu.mem[0x2001] = 0x00;
    cpu.mem[0x3000] = 0xAA;
    cpu.step();
    eq(cpu.a, 0xAA, 'A');
});

test('LDA [n16] (extended indirect)', () => {
    const cpu = makeCPU([0xA6, 0x9F, 0x20, 0x00]); // postbyte $9F, addr $2000
    cpu.mem[0x2000] = 0x40;
    cpu.mem[0x2001] = 0x00;
    cpu.mem[0x4000] = 0xBB;
    cpu.step();
    eq(cpu.a, 0xBB, 'A');
});

// ===================================================================
// MUL / ABX / SEX / DAA
// ===================================================================
suite('Misc Operations');

test('MUL', () => {
    const cpu = makeCPU([0x3D]);
    cpu.a = 0x0A; cpu.b = 0x0A; // 10 * 10 = 100
    cpu.step();
    eq(cpu.d, 100, 'D');
    isFalse(cpu.flagZ, 'Z');
});

test('MUL zero', () => {
    const cpu = makeCPU([0x3D]);
    cpu.a = 0x00; cpu.b = 0xFF;
    cpu.step();
    eq(cpu.d, 0, 'D');
    isTrue(cpu.flagZ, 'Z');
});

test('MUL carry (bit 7 of B)', () => {
    const cpu = makeCPU([0x3D]);
    cpu.a = 0xFF; cpu.b = 0xFF; // 255 * 255 = 65025 = $FE01
    cpu.step();
    eq(cpu.d, 0xFE01, 'D');
    isFalse(cpu.flagC, 'C'); // bit 7 of result B ($01) = 0
});

test('ABX', () => {
    const cpu = makeCPU([0x3A]);
    cpu.x = 0x1000;
    cpu.b = 0x42;
    cpu.step();
    eq(cpu.x, 0x1042, 'X');
});

test('ABX unsigned', () => {
    const cpu = makeCPU([0x3A]);
    cpu.x = 0x1000;
    cpu.b = 0xFF; // unsigned: 255
    cpu.step();
    eq(cpu.x, 0x10FF, 'X');
});

test('SEX positive', () => {
    const cpu = makeCPU([0x1D]);
    cpu.b = 0x42;
    cpu.step();
    eq(cpu.a, 0x00, 'A');
    eq(cpu.d, 0x0042, 'D');
});

test('SEX negative', () => {
    const cpu = makeCPU([0x1D]);
    cpu.b = 0x80;
    cpu.step();
    eq(cpu.a, 0xFF, 'A');
    eq(cpu.d, 0xFF80, 'D');
    isTrue(cpu.flagN, 'N');
});

test('NOP', () => {
    const cpu = makeCPU([0x12]);
    const cycles = cpu.step();
    eq(cpu.pc, 0x01, 'PC');
    eq(cycles, 2, 'cycles');
});

test('ORCC', () => {
    const cpu = makeCPU([0x1A, 0x50]); // ORCC #$50 → set I and F
    cpu.cc = 0x00;
    cpu.step();
    isTrue(cpu.flagF, 'F');
    isTrue(cpu.flagI, 'I');
});

test('ANDCC', () => {
    const cpu = makeCPU([0x1C, 0xAF]); // ANDCC #$AF → clear I and F (bits 4,6)
    cpu.cc = 0xFF;
    cpu.step();
    isFalse(cpu.flagF, 'F');
    isFalse(cpu.flagI, 'I');
    isTrue(cpu.flagE, 'E kept');
});

// ===================================================================
// SWI / RTI
// ===================================================================
suite('SWI / RTI');

test('SWI pushes state and jumps to vector', () => {
    const cpu = makeCPU([0x3F]); // SWI
    cpu.s = 0x1000;
    cpu.a = 0x11; cpu.b = 0x22;
    cpu.x = 0x3344; cpu.y = 0x5566;
    cpu.u = 0x7788; cpu.dp = 0x99;
    cpu.cc = 0x00;
    // SWI vector at $FFFA-$FFFB
    cpu.mem[0xFFFA] = 0x40;
    cpu.mem[0xFFFB] = 0x00;
    cpu.step();
    eq(cpu.pc, 0x4000, 'PC = SWI vector');
    isTrue(cpu.flagI, 'I set');
    isTrue(cpu.flagF, 'F set');
    isTrue(cpu.flagE, 'E set');
});

test('RTI restores full state (E=1)', () => {
    const cpu = makeCPU([0x3B]); // RTI
    cpu.s = 0x0FF4;
    // Push state manually: CC, A, B, DP, X(hi,lo), Y(hi,lo), U(hi,lo), PC(hi,lo)
    // CC with E=1 (0x80) at top of stack
    const state = [0x80, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0x00, 0x50];
    for (let i = 0; i < state.length; i++) cpu.mem[0x0FF4 + i] = state[i];
    cpu.step();
    isTrue(cpu.flagE, 'E');
    eq(cpu.a, 0x11, 'A');
    eq(cpu.b, 0x22, 'B');
    eq(cpu.dp, 0x33, 'DP');
    eq(cpu.x, 0x4455, 'X');
    eq(cpu.y, 0x6677, 'Y');
    eq(cpu.u, 0x8899, 'U');
    eq(cpu.pc, 0x0050, 'PC');
});

test('RTI fast return (E=0)', () => {
    const cpu = makeCPU([0x3B]); // RTI
    cpu.s = 0x0FFD;
    // CC with E=0, then PC
    cpu.mem[0x0FFD] = 0x01; // CC = just C flag
    cpu.mem[0x0FFE] = 0x12;
    cpu.mem[0x0FFF] = 0x34;
    cpu.step();
    isFalse(cpu.flagE, 'E');
    isTrue(cpu.flagC, 'C restored');
    eq(cpu.pc, 0x1234, 'PC');
});

// ===================================================================
// Page 2 instructions (prefix $10)
// ===================================================================
suite('Page 2 ($10) Instructions');

test('CMPD immediate', () => {
    const cpu = makeCPU([0x10, 0x83, 0x10, 0x00]);
    cpu.a = 0x10; cpu.b = 0x00; // D = $1000
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
    eq(cpu.d, 0x1000, 'D unchanged');
});

test('CMPY immediate', () => {
    const cpu = makeCPU([0x10, 0x8C, 0x20, 0x00]);
    cpu.y = 0x1000;
    cpu.step();
    isTrue(cpu.flagC, 'C (Y < operand)');
    isFalse(cpu.flagZ, 'Z');
});

test('LDY immediate', () => {
    const cpu = makeCPU([0x10, 0x8E, 0xAB, 0xCD]);
    cpu.step();
    eq(cpu.y, 0xABCD, 'Y');
});

test('STY direct', () => {
    const cpu = makeCPU([0x10, 0x9F, 0x50]);
    cpu.dp = 0x00;
    cpu.y = 0x1234;
    cpu.step();
    eq(cpu.mem[0x0050], 0x12, 'hi');
    eq(cpu.mem[0x0051], 0x34, 'lo');
});

test('LDS immediate', () => {
    const cpu = makeCPU([0x10, 0xCE, 0x10, 0x00]);
    cpu.step();
    eq(cpu.s, 0x1000, 'S');
});

// ===================================================================
// Page 3 instructions (prefix $11)
// ===================================================================
suite('Page 3 ($11) Instructions');

test('CMPU immediate', () => {
    const cpu = makeCPU([0x11, 0x83, 0x10, 0x00]);
    cpu.u = 0x1000;
    cpu.step();
    isTrue(cpu.flagZ, 'Z');
});

test('CMPS immediate', () => {
    const cpu = makeCPU([0x11, 0x8C, 0x20, 0x00]);
    cpu.s = 0x3000;
    cpu.step();
    isFalse(cpu.flagC, 'C (S > operand)');
    isFalse(cpu.flagZ, 'Z');
});

// ===================================================================
// Cycle counting
// ===================================================================
suite('Cycle Counting');

test('LDA immediate = 2 cycles', () => {
    const cpu = makeCPU([0x86, 0x00]);
    const c = cpu.step();
    eq(c, 2, 'cycles');
});

test('LDA direct = 4 cycles', () => {
    const cpu = makeCPU([0x96, 0x00]);
    const c = cpu.step();
    eq(c, 4, 'cycles');
});

test('LDA extended = 5 cycles', () => {
    const cpu = makeCPU([0xB6, 0x00, 0x00]);
    const c = cpu.step();
    eq(c, 5, 'cycles');
});

test('ADDD immediate = 4 cycles', () => {
    const cpu = makeCPU([0xC3, 0x00, 0x00]);
    const c = cpu.step();
    eq(c, 4, 'cycles');
});

test('PSHS A = 6 cycles (5 base + 1)', () => {
    const cpu = makeCPU([0x34, 0x02]);
    cpu.s = 0x1000;
    const c = cpu.step();
    eq(c, 6, 'cycles');
});

test('PSHS X = 7 cycles (5 base + 2)', () => {
    const cpu = makeCPU([0x34, 0x10]);
    cpu.s = 0x1000;
    const c = cpu.step();
    eq(c, 7, 'cycles');
});

test('JSR extended = 8 cycles', () => {
    const cpu = makeCPU([0xBD, 0x10, 0x00]);
    cpu.s = 0x1000;
    const c = cpu.step();
    eq(c, 8, 'cycles');
});

test('MUL = 11 cycles', () => {
    const cpu = makeCPU([0x3D]);
    const c = cpu.step();
    eq(c, 11, 'cycles');
});

test('Cumulative cycles tracked', () => {
    const cpu = makeCPU([0x12, 0x12, 0x12]); // 3 NOPs
    cpu.step(); cpu.step(); cpu.step();
    eq(cpu.cycles, 6, 'total cycles');
});

// ===================================================================
// Multi-instruction programs
// ===================================================================
suite('Multi-instruction Programs');

test('Count down loop', () => {
    // LDB #5; loop: DECB; BNE loop
    const cpu = makeCPU([
        0xC6, 0x05,         // LDB #5
        0x5A,               // DECB
        0x26, 0xFD,         // BNE -3 (back to DECB)
    ]);
    cpu.step();             // LDB #5
    eq(cpu.b, 5, 'B=5');
    for (let i = 4; i >= 1; i--) {
        cpu.step();         // DECB
        eq(cpu.b, i, `B=${i}`);
        cpu.step();         // BNE (taken)
        eq(cpu.pc, 0x02, 'PC back to DECB');
    }
    cpu.step();             // DECB → B=0
    eq(cpu.b, 0, 'B=0');
    cpu.step();             // BNE (not taken)
    eq(cpu.pc, 0x05, 'PC past BNE');
});

test('Add array of bytes', () => {
    // Sum 3 bytes at $0020 using LDA, ADDA, ADDA
    const cpu = makeCPU([
        0xB6, 0x00, 0x20,  // LDA $0020
        0xBB, 0x00, 0x21,  // ADDA $0021
        0xBB, 0x00, 0x22,  // ADDA $0022
    ]);
    cpu.mem[0x0020] = 10;
    cpu.mem[0x0021] = 20;
    cpu.mem[0x0022] = 30;
    cpu.step(); cpu.step(); cpu.step();
    eq(cpu.a, 60, 'A = 10+20+30');
});

test('16-bit counter', () => {
    // LDD #0; ADDD #1; ADDD #1; ADDD #1
    const cpu = makeCPU([
        0xCC, 0x00, 0x00,  // LDD #0
        0xC3, 0x00, 0x01,  // ADDD #1
        0xC3, 0x00, 0x01,  // ADDD #1
        0xC3, 0x00, 0x01,  // ADDD #1
    ]);
    cpu.step(); cpu.step(); cpu.step(); cpu.step();
    eq(cpu.d, 3, 'D=3');
});

// ===================================================================
// Debugger
// ===================================================================
suite('Debugger');

test('Disassemble LDA immediate', () => {
    const cpu = makeCPU([0x86, 0x42]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'LDA #$42', 'text');
    eq(d.bytes, 2, 'bytes');
});

test('Disassemble BRA', () => {
    const cpu = makeCPU([0x20, 0x10]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'BRA $0012', 'text');
});

test('Disassemble PSHS', () => {
    const cpu = makeCPU([0x34, 0x06]); // PSHS A,B
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'PSHS A,B', 'text');
});

test('Disassemble TFR', () => {
    const cpu = makeCPU([0x1F, 0x01]); // TFR D,X
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'TFR D,X', 'text');
});

test('Disassemble indexed ,X', () => {
    const cpu = makeCPU([0xA6, 0x84]); // LDA ,X
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'LDA ,X', 'text');
});

test('Disassemble page 2 LDY', () => {
    const cpu = makeCPU([0x10, 0x8E, 0x12, 0x34]);
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const d = dbg.disassembleAt(0x0000);
    eq(d.text, 'LDY #$1234', 'text');
    eq(d.bytes, 4, 'bytes');
});

test('Register dump', () => {
    const cpu = makeCPU([]);
    cpu.a = 0x42; cpu.b = 0x99; cpu.x = 0x1234;
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const dump = dbg.dumpRegisters();
    isTrue(dump.includes('A=$42'), 'has A');
    isTrue(dump.includes('X=$1234'), 'has X');
});

test('Memory dump', () => {
    const cpu = makeCPU([0x41, 0x42, 0x43]); // ABC
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    const dump = dbg.dumpMemory(0x0000, 16);
    isTrue(dump.includes('ABC'), 'has ASCII');
});

test('Breakpoint and run', () => {
    const cpu = makeCPU([0x12, 0x12, 0x12, 0x12, 0x12]); // 5 NOPs
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    dbg.addBreakpoint(0x0003);
    const result = dbg.runUntilBreak();
    eq(result.reason, 'breakpoint', 'reason');
    eq(result.addr, 0x0003, 'addr');
});

test('Trace log', () => {
    const cpu = makeCPU([0x86, 0x42, 0xC6, 0x99]); // LDA #$42, LDB #$99
    const dbg = new Debugger(cpu, addr => cpu.mem[addr & 0xFFFF]);
    dbg.enableTrace();
    dbg.stepDebug();
    dbg.stepDebug();
    eq(dbg.traceLog.length, 2, 'trace entries');
    eq(dbg.traceLog[0].instruction, 'LDA #$42', 'first instruction');
    eq(dbg.traceLog[1].instruction, 'LDB #$99', 'second instruction');
});

// ===================================================================
// Done!
// ===================================================================
summary();
