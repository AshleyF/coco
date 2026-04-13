// cpu.js — MC6809E CPU Emulation
// Full instruction set with cycle-accurate counting

export class MC6809 {
    constructor(read, write) {
        this.read = read;
        this.write = write;

        // 8-bit registers
        this.a = 0;
        this.b = 0;
        this.dp = 0;

        // 16-bit registers
        this.x = 0;
        this.y = 0;
        this.u = 0;
        this.s = 0;
        this.pc = 0;

        // CC flags (stored individually for speed)
        this.flagE = false; // bit 7: Entire state saved
        this.flagF = false; // bit 6: FIRQ mask
        this.flagH = false; // bit 5: Half carry
        this.flagI = false; // bit 4: IRQ mask
        this.flagN = false; // bit 3: Negative
        this.flagZ = false; // bit 2: Zero
        this.flagV = false; // bit 1: Overflow
        this.flagC = false; // bit 0: Carry

        // Internal state
        this.cycles = 0;
        this.halted = false;
        this.waitingForInterrupt = false;
        this.idxExtra = 0; // extra cycles from indexed addressing

        // IRQ/FIRQ/NMI input lines
        this.irqLine = false;
        this.firqLine = false;
        this.nmiLine = false;
        this.nmiPrevious = false;

        // Opcode dispatch tables
        this.ops = this._buildPage1();
        this.ops10 = this._buildPage2();
        this.ops11 = this._buildPage3();
    }

    // === D register (A:B combined) ===
    get d() { return (this.a << 8) | this.b; }
    set d(v) { this.a = (v >> 8) & 0xFF; this.b = v & 0xFF; }

    // === CC register (packed byte) ===
    get cc() {
        return (this.flagE ? 0x80 : 0) | (this.flagF ? 0x40 : 0) |
               (this.flagH ? 0x20 : 0) | (this.flagI ? 0x10 : 0) |
               (this.flagN ? 0x08 : 0) | (this.flagZ ? 0x04 : 0) |
               (this.flagV ? 0x02 : 0) | (this.flagC ? 0x01 : 0);
    }
    set cc(v) {
        this.flagE = !!(v & 0x80);
        this.flagF = !!(v & 0x40);
        this.flagH = !!(v & 0x20);
        this.flagI = !!(v & 0x10);
        this.flagN = !!(v & 0x08);
        this.flagZ = !!(v & 0x04);
        this.flagV = !!(v & 0x02);
        this.flagC = !!(v & 0x01);
    }

    // === Memory access helpers ===
    fetch() {
        const v = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return v;
    }

    fetch16() {
        const hi = this.fetch();
        const lo = this.fetch();
        return (hi << 8) | lo;
    }

    read16(addr) {
        return (this.read(addr) << 8) | this.read((addr + 1) & 0xFFFF);
    }

    write16(addr, val) {
        this.write(addr, (val >> 8) & 0xFF);
        this.write((addr + 1) & 0xFFFF, val & 0xFF);
    }

    pushS8(val) { this.s = (this.s - 1) & 0xFFFF; this.write(this.s, val & 0xFF); }
    pushS16(val) { this.pushS8(val); this.pushS8(val >> 8); }
    pullS8() { const v = this.read(this.s); this.s = (this.s + 1) & 0xFFFF; return v; }
    pullS16() { const hi = this.pullS8(); return (hi << 8) | this.pullS8(); }

    pushU8(val) { this.u = (this.u - 1) & 0xFFFF; this.write(this.u, val & 0xFF); }
    pushU16(val) { this.pushU8(val); this.pushU8(val >> 8); }
    pullU8() { const v = this.read(this.u); this.u = (this.u + 1) & 0xFFFF; return v; }
    pullU16() { const hi = this.pullU8(); return (hi << 8) | this.pullU8(); }

    // === Addressing modes ===
    addrDirect() {
        return (this.dp << 8) | this.fetch();
    }

    addrExtended() {
        return this.fetch16();
    }

    addrIndexed() {
        const post = this.fetch();
        const regBits = (post >> 5) & 0x03;
        let reg;
        switch (regBits) {
            case 0: reg = this.x; break;
            case 1: reg = this.y; break;
            case 2: reg = this.u; break;
            case 3: reg = this.s; break;
        }

        let addr;
        this.idxExtra = 0;

        if ((post & 0x80) === 0) {
            // 5-bit signed offset
            let offset = post & 0x1F;
            if (offset & 0x10) offset |= 0xFFE0; // sign extend
            addr = (reg + offset) & 0xFFFF;
            this.idxExtra = 1;
            return addr;
        }

        const indirect = !!(post & 0x10);
        const type = post & 0x0F;

        switch (type) {
            case 0x00: // ,R+
                addr = reg;
                this._setIdxReg(regBits, (reg + 1) & 0xFFFF);
                this.idxExtra = 2;
                break;
            case 0x01: // ,R++
                addr = reg;
                this._setIdxReg(regBits, (reg + 2) & 0xFFFF);
                this.idxExtra = indirect ? 6 : 3;
                break;
            case 0x02: // ,-R
                reg = (reg - 1) & 0xFFFF;
                this._setIdxReg(regBits, reg);
                addr = reg;
                this.idxExtra = 2;
                break;
            case 0x03: // ,--R
                reg = (reg - 2) & 0xFFFF;
                this._setIdxReg(regBits, reg);
                addr = reg;
                this.idxExtra = indirect ? 6 : 3;
                break;
            case 0x04: // ,R (no offset)
                addr = reg;
                this.idxExtra = indirect ? 3 : 0;
                break;
            case 0x05: // B,R
                addr = (reg + this._signExtend8(this.b)) & 0xFFFF;
                this.idxExtra = indirect ? 4 : 1;
                break;
            case 0x06: // A,R
                addr = (reg + this._signExtend8(this.a)) & 0xFFFF;
                this.idxExtra = indirect ? 4 : 1;
                break;
            case 0x08: { // n8,R
                const off = this._signExtend8(this.fetch());
                addr = (reg + off) & 0xFFFF;
                this.idxExtra = indirect ? 4 : 1;
                break;
            }
            case 0x09: { // n16,R
                const off = this._signExtend16(this.fetch16());
                addr = (reg + off) & 0xFFFF;
                this.idxExtra = indirect ? 7 : 4;
                break;
            }
            case 0x0B: // D,R
                addr = (reg + this._signExtend16(this.d)) & 0xFFFF;
                this.idxExtra = indirect ? 7 : 4;
                break;
            case 0x0C: { // n8,PCR
                const off = this._signExtend8(this.fetch());
                addr = (this.pc + off) & 0xFFFF;
                this.idxExtra = indirect ? 4 : 1;
                break;
            }
            case 0x0D: { // n16,PCR
                const off = this._signExtend16(this.fetch16());
                addr = (this.pc + off) & 0xFFFF;
                this.idxExtra = indirect ? 8 : 5;
                break;
            }
            case 0x0F: // [n16] extended indirect
                addr = this.fetch16();
                this.idxExtra = 5;
                // Always indirect
                return this.read16(addr);
            default:
                addr = 0; // undefined indexed mode
                break;
        }

        if (indirect && type !== 0x0F) {
            addr = this.read16(addr);
        }
        return addr;
    }

    _setIdxReg(bits, val) {
        switch (bits) {
            case 0: this.x = val; break;
            case 1: this.y = val; break;
            case 2: this.u = val; break;
            case 3: this.s = val; break;
        }
    }

    _signExtend8(val) {
        return (val & 0x80) ? (val | 0xFFFFFF00) : val;
    }

    _signExtend16(val) {
        return (val & 0x8000) ? (val | 0xFFFF0000) : val;
    }

    // === Flag helpers ===
    _flagsNZ8(val) {
        this.flagN = !!(val & 0x80);
        this.flagZ = (val & 0xFF) === 0;
    }

    _flagsNZ16(val) {
        this.flagN = !!(val & 0x8000);
        this.flagZ = (val & 0xFFFF) === 0;
    }

    // === 8-bit ALU operations ===
    // Each returns the 8-bit result and sets appropriate flags

    _add8(a, b) {
        const r = a + b;
        this.flagH = !!((a ^ b ^ r) & 0x10);
        this.flagN = !!(r & 0x80);
        this.flagZ = (r & 0xFF) === 0;
        this.flagV = !!((a ^ r) & (b ^ r) & 0x80);
        this.flagC = !!(r & 0x100);
        return r & 0xFF;
    }

    _adc8(a, b) {
        return this._add8(a, b + (this.flagC ? 1 : 0));
    }

    _sub8(a, b) {
        const r = a - b;
        this.flagN = !!(r & 0x80);
        this.flagZ = (r & 0xFF) === 0;
        this.flagV = !!((a ^ b) & (a ^ r) & 0x80);
        this.flagC = !!(r & 0x100); // borrow
        return r & 0xFF;
    }

    _sbc8(a, b) {
        return this._sub8(a, b + (this.flagC ? 1 : 0));
    }

    _and8(a, b) {
        const r = a & b;
        this._flagsNZ8(r);
        this.flagV = false;
        return r;
    }

    _or8(a, b) {
        const r = a | b;
        this._flagsNZ8(r);
        this.flagV = false;
        return r;
    }

    _eor8(a, b) {
        const r = a ^ b;
        this._flagsNZ8(r);
        this.flagV = false;
        return r;
    }

    // === 16-bit ALU operations ===

    _add16(a, b) {
        const r = a + b;
        this._flagsNZ16(r);
        this.flagV = !!((a ^ r) & (b ^ r) & 0x8000);
        this.flagC = !!(r & 0x10000);
        return r & 0xFFFF;
    }

    _sub16(a, b) {
        const r = a - b;
        this._flagsNZ16(r);
        this.flagV = !!((a ^ b) & (a ^ r) & 0x8000);
        this.flagC = !!(r & 0x10000);
        return r & 0xFFFF;
    }

    // === Memory-modify operations ===
    // Used by direct/indexed/extended addressing and inherent (A/B) modes

    _neg(val) {
        const r = (-val) & 0xFF;
        this.flagN = !!(r & 0x80);
        this.flagZ = r === 0;
        this.flagV = r === 0x80;
        this.flagC = r !== 0;
        return r;
    }

    _com(val) {
        const r = (~val) & 0xFF;
        this._flagsNZ8(r);
        this.flagV = false;
        this.flagC = true;
        return r;
    }

    _lsr(val) {
        this.flagC = !!(val & 0x01);
        const r = (val >> 1) & 0xFF;
        this.flagN = false;
        this.flagZ = r === 0;
        return r;
    }

    _ror(val) {
        const oldC = this.flagC;
        this.flagC = !!(val & 0x01);
        const r = ((val >> 1) | (oldC ? 0x80 : 0)) & 0xFF;
        this._flagsNZ8(r);
        return r;
    }

    _asr(val) {
        this.flagC = !!(val & 0x01);
        const r = ((val >> 1) | (val & 0x80)) & 0xFF;
        this._flagsNZ8(r);
        return r;
    }

    _asl(val) {
        this.flagC = !!(val & 0x80);
        const r = (val << 1) & 0xFF;
        this._flagsNZ8(r);
        this.flagV = this.flagN !== this.flagC;
        return r;
    }

    _rol(val) {
        const oldC = this.flagC;
        this.flagC = !!(val & 0x80);
        const r = ((val << 1) | (oldC ? 1 : 0)) & 0xFF;
        this._flagsNZ8(r);
        this.flagV = this.flagN !== this.flagC;
        return r;
    }

    _dec(val) {
        const r = (val - 1) & 0xFF;
        this.flagN = !!(r & 0x80);
        this.flagZ = r === 0;
        this.flagV = val === 0x80;
        return r;
    }

    _inc(val) {
        const r = (val + 1) & 0xFF;
        this.flagN = !!(r & 0x80);
        this.flagZ = r === 0;
        this.flagV = val === 0x7F;
        return r;
    }

    _tst(val) {
        this._flagsNZ8(val);
        this.flagV = false;
    }

    _clr() {
        this.flagN = false;
        this.flagZ = true;
        this.flagV = false;
        this.flagC = false;
        return 0;
    }

    // === Branch helper ===
    _branchCond(cond) {
        const offset = this._signExtend8(this.fetch());
        if (cond) this.pc = (this.pc + offset) & 0xFFFF;
        return 3;
    }

    _lbranchCond(cond) {
        const offset = this._signExtend16(this.fetch16());
        if (cond) {
            this.pc = (this.pc + offset) & 0xFFFF;
            return 6;
        }
        return 5;
    }

    // === TFR/EXG register access ===
    _getRegByCode(code) {
        switch (code) {
            case 0x0: return this.d;
            case 0x1: return this.x;
            case 0x2: return this.y;
            case 0x3: return this.u;
            case 0x4: return this.s;
            case 0x5: return this.pc;
            case 0x8: return this.a;
            case 0x9: return this.b;
            case 0xA: return this.cc;
            case 0xB: return this.dp;
            default: return 0xFF;
        }
    }

    _setRegByCode(code, val) {
        switch (code) {
            case 0x0: this.d = val & 0xFFFF; break;
            case 0x1: this.x = val & 0xFFFF; break;
            case 0x2: this.y = val & 0xFFFF; break;
            case 0x3: this.u = val & 0xFFFF; break;
            case 0x4: this.s = val & 0xFFFF; break;
            case 0x5: this.pc = val & 0xFFFF; break;
            case 0x8: this.a = val & 0xFF; break;
            case 0x9: this.b = val & 0xFF; break;
            case 0xA: this.cc = val & 0xFF; break;
            case 0xB: this.dp = val & 0xFF; break;
        }
    }

    _is16bitReg(code) {
        return code <= 0x05;
    }

    // === PSH/PUL helpers ===
    _pushRegs(postbyte, pushFn, otherStack) {
        let cycles = 0;
        if (postbyte & 0x80) { pushFn.call(this, this.pc); cycles += 2; }        // PC
        if (postbyte & 0x40) { pushFn.call(this, otherStack); cycles += 2; }     // U or S
        if (postbyte & 0x20) { pushFn.call(this, this.y); cycles += 2; }         // Y
        if (postbyte & 0x10) { pushFn.call(this, this.x); cycles += 2; }         // X
        if (postbyte & 0x08) { this._push8For(pushFn, this.dp); cycles += 1; }   // DP
        if (postbyte & 0x04) { this._push8For(pushFn, this.b); cycles += 1; }    // B
        if (postbyte & 0x02) { this._push8For(pushFn, this.a); cycles += 1; }    // A
        if (postbyte & 0x01) { this._push8For(pushFn, this.cc); cycles += 1; }   // CC
        return cycles;
    }

    _push8For(pushFn, val) {
        // Determine which stack based on pushFn
        if (pushFn === this.pushS16) {
            this.pushS8(val);
        } else {
            this.pushU8(val);
        }
    }

    _pshsHelper(postbyte) {
        let cycles = 0;
        if (postbyte & 0x80) { this.pushS16(this.pc); cycles += 2; }
        if (postbyte & 0x40) { this.pushS16(this.u);  cycles += 2; }
        if (postbyte & 0x20) { this.pushS16(this.y);  cycles += 2; }
        if (postbyte & 0x10) { this.pushS16(this.x);  cycles += 2; }
        if (postbyte & 0x08) { this.pushS8(this.dp);  cycles += 1; }
        if (postbyte & 0x04) { this.pushS8(this.b);   cycles += 1; }
        if (postbyte & 0x02) { this.pushS8(this.a);   cycles += 1; }
        if (postbyte & 0x01) { this.pushS8(this.cc);  cycles += 1; }
        return cycles;
    }

    _pulsHelper(postbyte) {
        let cycles = 0;
        if (postbyte & 0x01) { this.cc = this.pullS8(); cycles += 1; }
        if (postbyte & 0x02) { this.a  = this.pullS8(); cycles += 1; }
        if (postbyte & 0x04) { this.b  = this.pullS8(); cycles += 1; }
        if (postbyte & 0x08) { this.dp = this.pullS8(); cycles += 1; }
        if (postbyte & 0x10) { this.x  = this.pullS16(); cycles += 2; }
        if (postbyte & 0x20) { this.y  = this.pullS16(); cycles += 2; }
        if (postbyte & 0x40) { this.u  = this.pullS16(); cycles += 2; }
        if (postbyte & 0x80) { this.pc = this.pullS16(); cycles += 2; }
        return cycles;
    }

    _pshuHelper(postbyte) {
        let cycles = 0;
        if (postbyte & 0x80) { this.pushU16(this.pc); cycles += 2; }
        if (postbyte & 0x40) { this.pushU16(this.s);  cycles += 2; }
        if (postbyte & 0x20) { this.pushU16(this.y);  cycles += 2; }
        if (postbyte & 0x10) { this.pushU16(this.x);  cycles += 2; }
        if (postbyte & 0x08) { this.pushU8(this.dp);  cycles += 1; }
        if (postbyte & 0x04) { this.pushU8(this.b);   cycles += 1; }
        if (postbyte & 0x02) { this.pushU8(this.a);   cycles += 1; }
        if (postbyte & 0x01) { this.pushU8(this.cc);  cycles += 1; }
        return cycles;
    }

    _puluHelper(postbyte) {
        let cycles = 0;
        if (postbyte & 0x01) { this.cc = this.pullU8(); cycles += 1; }
        if (postbyte & 0x02) { this.a  = this.pullU8(); cycles += 1; }
        if (postbyte & 0x04) { this.b  = this.pullU8(); cycles += 1; }
        if (postbyte & 0x08) { this.dp = this.pullU8(); cycles += 1; }
        if (postbyte & 0x10) { this.x  = this.pullU16(); cycles += 2; }
        if (postbyte & 0x20) { this.y  = this.pullU16(); cycles += 2; }
        if (postbyte & 0x40) { this.s  = this.pullU16(); cycles += 2; }
        if (postbyte & 0x80) { this.pc = this.pullU16(); cycles += 2; }
        return cycles;
    }

    // ===================================================================
    // Opcode table builders
    // ===================================================================

    _buildPage1() {
        const o = new Array(256).fill(null);

        // --- $00-$0F: Direct page memory operations ---
        o[0x00] = () => { const a = this.addrDirect(); this.write(a, this._neg(this.read(a))); return 6; };
        o[0x03] = () => { const a = this.addrDirect(); this.write(a, this._com(this.read(a))); return 6; };
        o[0x04] = () => { const a = this.addrDirect(); this.write(a, this._lsr(this.read(a))); return 6; };
        o[0x06] = () => { const a = this.addrDirect(); this.write(a, this._ror(this.read(a))); return 6; };
        o[0x07] = () => { const a = this.addrDirect(); this.write(a, this._asr(this.read(a))); return 6; };
        o[0x08] = () => { const a = this.addrDirect(); this.write(a, this._asl(this.read(a))); return 6; };
        o[0x09] = () => { const a = this.addrDirect(); this.write(a, this._rol(this.read(a))); return 6; };
        o[0x0A] = () => { const a = this.addrDirect(); this.write(a, this._dec(this.read(a))); return 6; };
        o[0x0C] = () => { const a = this.addrDirect(); this.write(a, this._inc(this.read(a))); return 6; };
        o[0x0D] = () => { this._tst(this.read(this.addrDirect())); return 6; };
        o[0x0E] = () => { this.pc = this.addrDirect(); return 3; };
        o[0x0F] = () => { const a = this.addrDirect(); this.write(a, this._clr()); return 6; };

        // --- $10/$11: Page 2/3 prefixes (handled in step()) ---

        // --- $12-$1F: Misc ---
        o[0x12] = () => 2;  // NOP
        o[0x13] = () => { this.waitingForInterrupt = true; return 4; };  // SYNC
        o[0x16] = () => { // LBRA
            const off = this._signExtend16(this.fetch16());
            this.pc = (this.pc + off) & 0xFFFF;
            return 5;
        };
        o[0x17] = () => { // LBSR
            const off = this._signExtend16(this.fetch16());
            this.pushS16(this.pc);
            this.pc = (this.pc + off) & 0xFFFF;
            return 9;
        };
        o[0x19] = () => { // DAA
            let msn = this.a & 0xF0;
            let lsn = this.a & 0x0F;
            let correction = 0;
            if (lsn > 0x09 || this.flagH) correction |= 0x06;
            if (msn > 0x90 || this.flagC || (msn > 0x80 && lsn > 0x09)) correction |= 0x60;
            const r = this.a + correction;
            if (correction & 0x60) this.flagC = true;
            this.a = r & 0xFF;
            this._flagsNZ8(this.a);
            return 2;
        };
        o[0x1A] = () => { this.cc = this.cc | this.fetch(); return 3; };   // ORCC
        o[0x1C] = () => { this.cc = this.cc & this.fetch(); return 3; };   // ANDCC
        o[0x1D] = () => { // SEX
            this.a = (this.b & 0x80) ? 0xFF : 0x00;
            this._flagsNZ16(this.d);
            this.flagV = false;
            return 2;
        };
        o[0x1E] = () => { // EXG
            const post = this.fetch();
            const src = (post >> 4) & 0x0F;
            const dst = post & 0x0F;
            const srcVal = this._getRegByCode(src);
            const dstVal = this._getRegByCode(dst);
            this._setRegByCode(src, dstVal);
            this._setRegByCode(dst, srcVal);
            return 8;
        };
        o[0x1F] = () => { // TFR
            const post = this.fetch();
            const src = (post >> 4) & 0x0F;
            const dst = post & 0x0F;
            this._setRegByCode(dst, this._getRegByCode(src));
            return 6;
        };

        // --- $20-$2F: Short branches ---
        o[0x20] = () => { // BRA
            const off = this._signExtend8(this.fetch());
            this.pc = (this.pc + off) & 0xFFFF;
            return 3;
        };
        o[0x21] = () => { this.fetch(); return 3; };                                    // BRN
        o[0x22] = () => this._branchCond(!this.flagC && !this.flagZ);                    // BHI
        o[0x23] = () => this._branchCond(this.flagC || this.flagZ);                      // BLS
        o[0x24] = () => this._branchCond(!this.flagC);                                   // BCC/BHS
        o[0x25] = () => this._branchCond(this.flagC);                                    // BCS/BLO
        o[0x26] = () => this._branchCond(!this.flagZ);                                   // BNE
        o[0x27] = () => this._branchCond(this.flagZ);                                    // BEQ
        o[0x28] = () => this._branchCond(!this.flagV);                                   // BVC
        o[0x29] = () => this._branchCond(this.flagV);                                    // BVS
        o[0x2A] = () => this._branchCond(!this.flagN);                                   // BPL
        o[0x2B] = () => this._branchCond(this.flagN);                                    // BMI
        o[0x2C] = () => this._branchCond(this.flagN === this.flagV);                     // BGE
        o[0x2D] = () => this._branchCond(this.flagN !== this.flagV);                     // BLT
        o[0x2E] = () => this._branchCond(!this.flagZ && this.flagN === this.flagV);      // BGT
        o[0x2F] = () => this._branchCond(this.flagZ || this.flagN !== this.flagV);       // BLE

        // --- $30-$3F: Misc ---
        o[0x30] = () => { // LEAX
            this.x = this.addrIndexed();
            this.flagZ = this.x === 0;
            return 4 + this.idxExtra;
        };
        o[0x31] = () => { // LEAY
            this.y = this.addrIndexed();
            this.flagZ = this.y === 0;
            return 4 + this.idxExtra;
        };
        o[0x32] = () => { this.s = this.addrIndexed(); return 4 + this.idxExtra; };     // LEAS
        o[0x33] = () => { this.u = this.addrIndexed(); return 4 + this.idxExtra; };     // LEAU
        o[0x34] = () => { const p = this.fetch(); return 5 + this._pshsHelper(p); };    // PSHS
        o[0x35] = () => { const p = this.fetch(); return 5 + this._pulsHelper(p); };    // PULS
        o[0x36] = () => { const p = this.fetch(); return 5 + this._pshuHelper(p); };    // PSHU
        o[0x37] = () => { const p = this.fetch(); return 5 + this._puluHelper(p); };    // PULU
        o[0x39] = () => { this.pc = this.pullS16(); return 5; };                        // RTS
        o[0x3A] = () => { this.x = (this.x + this.b) & 0xFFFF; return 3; };            // ABX
        o[0x3B] = () => { // RTI
            this.cc = this.pullS8();
            if (this.flagE) {
                this.a  = this.pullS8();
                this.b  = this.pullS8();
                this.dp = this.pullS8();
                this.x  = this.pullS16();
                this.y  = this.pullS16();
                this.u  = this.pullS16();
                this.pc = this.pullS16();
                return 15;
            }
            this.pc = this.pullS16();
            return 6;
        };
        o[0x3C] = () => { // CWAI
            this.cc = this.cc & this.fetch();
            this.flagE = true;
            this._pshsHelper(0xFF); // push all registers
            this.waitingForInterrupt = true;
            return 20;
        };
        o[0x3D] = () => { // MUL
            const r = this.a * this.b;
            this.d = r & 0xFFFF;
            this.flagZ = r === 0;
            this.flagC = !!(this.b & 0x80);
            return 11;
        };
        o[0x3F] = () => { // SWI
            this.flagE = true;
            this._pshsHelper(0xFF);
            this.flagI = true;
            this.flagF = true;
            this.pc = this.read16(0xFFFA);
            return 19;
        };

        // --- $40-$4F: Register A inherent ---
        o[0x40] = () => { this.a = this._neg(this.a); return 2; };
        o[0x43] = () => { this.a = this._com(this.a); return 2; };
        o[0x44] = () => { this.a = this._lsr(this.a); return 2; };
        o[0x46] = () => { this.a = this._ror(this.a); return 2; };
        o[0x47] = () => { this.a = this._asr(this.a); return 2; };
        o[0x48] = () => { this.a = this._asl(this.a); return 2; };
        o[0x49] = () => { this.a = this._rol(this.a); return 2; };
        o[0x4A] = () => { this.a = this._dec(this.a); return 2; };
        o[0x4C] = () => { this.a = this._inc(this.a); return 2; };
        o[0x4D] = () => { this._tst(this.a); return 2; };
        o[0x4F] = () => { this.a = this._clr(); return 2; };

        // --- $50-$5F: Register B inherent ---
        o[0x50] = () => { this.b = this._neg(this.b); return 2; };
        o[0x53] = () => { this.b = this._com(this.b); return 2; };
        o[0x54] = () => { this.b = this._lsr(this.b); return 2; };
        o[0x56] = () => { this.b = this._ror(this.b); return 2; };
        o[0x57] = () => { this.b = this._asr(this.b); return 2; };
        o[0x58] = () => { this.b = this._asl(this.b); return 2; };
        o[0x59] = () => { this.b = this._rol(this.b); return 2; };
        o[0x5A] = () => { this.b = this._dec(this.b); return 2; };
        o[0x5C] = () => { this.b = this._inc(this.b); return 2; };
        o[0x5D] = () => { this._tst(this.b); return 2; };
        o[0x5F] = () => { this.b = this._clr(); return 2; };

        // --- $60-$6F: Indexed memory operations ---
        o[0x60] = () => { const a = this.addrIndexed(); this.write(a, this._neg(this.read(a))); return 6 + this.idxExtra; };
        o[0x63] = () => { const a = this.addrIndexed(); this.write(a, this._com(this.read(a))); return 6 + this.idxExtra; };
        o[0x64] = () => { const a = this.addrIndexed(); this.write(a, this._lsr(this.read(a))); return 6 + this.idxExtra; };
        o[0x66] = () => { const a = this.addrIndexed(); this.write(a, this._ror(this.read(a))); return 6 + this.idxExtra; };
        o[0x67] = () => { const a = this.addrIndexed(); this.write(a, this._asr(this.read(a))); return 6 + this.idxExtra; };
        o[0x68] = () => { const a = this.addrIndexed(); this.write(a, this._asl(this.read(a))); return 6 + this.idxExtra; };
        o[0x69] = () => { const a = this.addrIndexed(); this.write(a, this._rol(this.read(a))); return 6 + this.idxExtra; };
        o[0x6A] = () => { const a = this.addrIndexed(); this.write(a, this._dec(this.read(a))); return 6 + this.idxExtra; };
        o[0x6C] = () => { const a = this.addrIndexed(); this.write(a, this._inc(this.read(a))); return 6 + this.idxExtra; };
        o[0x6D] = () => { this._tst(this.read(this.addrIndexed())); return 6 + this.idxExtra; };
        o[0x6E] = () => { this.pc = this.addrIndexed(); return 3 + this.idxExtra; };
        o[0x6F] = () => { const a = this.addrIndexed(); this.write(a, this._clr()); return 6 + this.idxExtra; };

        // --- $70-$7F: Extended memory operations ---
        o[0x70] = () => { const a = this.addrExtended(); this.write(a, this._neg(this.read(a))); return 7; };
        o[0x73] = () => { const a = this.addrExtended(); this.write(a, this._com(this.read(a))); return 7; };
        o[0x74] = () => { const a = this.addrExtended(); this.write(a, this._lsr(this.read(a))); return 7; };
        o[0x76] = () => { const a = this.addrExtended(); this.write(a, this._ror(this.read(a))); return 7; };
        o[0x77] = () => { const a = this.addrExtended(); this.write(a, this._asr(this.read(a))); return 7; };
        o[0x78] = () => { const a = this.addrExtended(); this.write(a, this._asl(this.read(a))); return 7; };
        o[0x79] = () => { const a = this.addrExtended(); this.write(a, this._rol(this.read(a))); return 7; };
        o[0x7A] = () => { const a = this.addrExtended(); this.write(a, this._dec(this.read(a))); return 7; };
        o[0x7C] = () => { const a = this.addrExtended(); this.write(a, this._inc(this.read(a))); return 7; };
        o[0x7D] = () => { this._tst(this.read(this.addrExtended())); return 7; };
        o[0x7E] = () => { this.pc = this.addrExtended(); return 4; };
        o[0x7F] = () => { const a = this.addrExtended(); this.write(a, this._clr()); return 7; };

        // --- $80-$BF: A-group (8-bit and 16-bit ops, A register / 16-bit regs) ---
        // Immediate
        o[0x80] = () => { this.a = this._sub8(this.a, this.fetch()); return 2; };
        o[0x81] = () => { this._sub8(this.a, this.fetch()); return 2; };                 // CMPA
        o[0x82] = () => { this.a = this._sbc8(this.a, this.fetch()); return 2; };
        o[0x83] = () => { this.d = this._sub16(this.d, this.fetch16()); return 4; };     // SUBD
        o[0x84] = () => { this.a = this._and8(this.a, this.fetch()); return 2; };
        o[0x85] = () => { this._and8(this.a, this.fetch()); return 2; };                 // BITA
        o[0x86] = () => { this.a = this.fetch(); this._flagsNZ8(this.a); this.flagV = false; return 2; }; // LDA
        // 0x87 undefined
        o[0x88] = () => { this.a = this._eor8(this.a, this.fetch()); return 2; };
        o[0x89] = () => { this.a = this._adc8(this.a, this.fetch()); return 2; };
        o[0x8A] = () => { this.a = this._or8(this.a, this.fetch()); return 2; };
        o[0x8B] = () => { this.a = this._add8(this.a, this.fetch()); return 2; };
        o[0x8C] = () => { this._sub16(this.x, this.fetch16()); return 4; };              // CMPX
        o[0x8D] = () => { // BSR
            const off = this._signExtend8(this.fetch());
            this.pushS16(this.pc);
            this.pc = (this.pc + off) & 0xFFFF;
            return 7;
        };
        o[0x8E] = () => { this.x = this.fetch16(); this._flagsNZ16(this.x); this.flagV = false; return 3; }; // LDX

        // Direct
        o[0x90] = () => { this.a = this._sub8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x91] = () => { this._sub8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x92] = () => { this.a = this._sbc8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x93] = () => { const a = this.addrDirect(); this.d = this._sub16(this.d, this.read16(a)); return 6; };
        o[0x94] = () => { this.a = this._and8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x95] = () => { this._and8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x96] = () => { this.a = this.read(this.addrDirect()); this._flagsNZ8(this.a); this.flagV = false; return 4; };
        o[0x97] = () => { const a = this.addrDirect(); this.write(a, this.a); this._flagsNZ8(this.a); this.flagV = false; return 4; }; // STA
        o[0x98] = () => { this.a = this._eor8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x99] = () => { this.a = this._adc8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x9A] = () => { this.a = this._or8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x9B] = () => { this.a = this._add8(this.a, this.read(this.addrDirect())); return 4; };
        o[0x9C] = () => { const a = this.addrDirect(); this._sub16(this.x, this.read16(a)); return 6; };
        o[0x9D] = () => { const a = this.addrDirect(); this.pushS16(this.pc); this.pc = a; return 7; }; // JSR
        o[0x9E] = () => { const a = this.addrDirect(); this.x = this.read16(a); this._flagsNZ16(this.x); this.flagV = false; return 5; };
        o[0x9F] = () => { const a = this.addrDirect(); this.write16(a, this.x); this._flagsNZ16(this.x); this.flagV = false; return 5; }; // STX

        // Indexed
        o[0xA0] = () => { this.a = this._sub8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA1] = () => { this._sub8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA2] = () => { this.a = this._sbc8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA3] = () => { const a = this.addrIndexed(); this.d = this._sub16(this.d, this.read16(a)); return 6 + this.idxExtra; };
        o[0xA4] = () => { this.a = this._and8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA5] = () => { this._and8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA6] = () => { this.a = this.read(this.addrIndexed()); this._flagsNZ8(this.a); this.flagV = false; return 4 + this.idxExtra; };
        o[0xA7] = () => { const a = this.addrIndexed(); this.write(a, this.a); this._flagsNZ8(this.a); this.flagV = false; return 4 + this.idxExtra; };
        o[0xA8] = () => { this.a = this._eor8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xA9] = () => { this.a = this._adc8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xAA] = () => { this.a = this._or8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xAB] = () => { this.a = this._add8(this.a, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xAC] = () => { const a = this.addrIndexed(); this._sub16(this.x, this.read16(a)); return 6 + this.idxExtra; };
        o[0xAD] = () => { const a = this.addrIndexed(); this.pushS16(this.pc); this.pc = a; return 7 + this.idxExtra; }; // JSR
        o[0xAE] = () => { const a = this.addrIndexed(); this.x = this.read16(a); this._flagsNZ16(this.x); this.flagV = false; return 5 + this.idxExtra; };
        o[0xAF] = () => { const a = this.addrIndexed(); this.write16(a, this.x); this._flagsNZ16(this.x); this.flagV = false; return 5 + this.idxExtra; };

        // Extended
        o[0xB0] = () => { this.a = this._sub8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB1] = () => { this._sub8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB2] = () => { this.a = this._sbc8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB3] = () => { const a = this.addrExtended(); this.d = this._sub16(this.d, this.read16(a)); return 7; };
        o[0xB4] = () => { this.a = this._and8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB5] = () => { this._and8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB6] = () => { this.a = this.read(this.addrExtended()); this._flagsNZ8(this.a); this.flagV = false; return 5; };
        o[0xB7] = () => { const a = this.addrExtended(); this.write(a, this.a); this._flagsNZ8(this.a); this.flagV = false; return 5; };
        o[0xB8] = () => { this.a = this._eor8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xB9] = () => { this.a = this._adc8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xBA] = () => { this.a = this._or8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xBB] = () => { this.a = this._add8(this.a, this.read(this.addrExtended())); return 5; };
        o[0xBC] = () => { const a = this.addrExtended(); this._sub16(this.x, this.read16(a)); return 7; };
        o[0xBD] = () => { const a = this.addrExtended(); this.pushS16(this.pc); this.pc = a; return 8; }; // JSR
        o[0xBE] = () => { const a = this.addrExtended(); this.x = this.read16(a); this._flagsNZ16(this.x); this.flagV = false; return 6; };
        o[0xBF] = () => { const a = this.addrExtended(); this.write16(a, this.x); this._flagsNZ16(this.x); this.flagV = false; return 6; };

        // --- $C0-$FF: B-group (8-bit and 16-bit ops, B register / 16-bit regs) ---
        // Immediate
        o[0xC0] = () => { this.b = this._sub8(this.b, this.fetch()); return 2; };
        o[0xC1] = () => { this._sub8(this.b, this.fetch()); return 2; };                 // CMPB
        o[0xC2] = () => { this.b = this._sbc8(this.b, this.fetch()); return 2; };
        o[0xC3] = () => { this.d = this._add16(this.d, this.fetch16()); return 4; };     // ADDD
        o[0xC4] = () => { this.b = this._and8(this.b, this.fetch()); return 2; };
        o[0xC5] = () => { this._and8(this.b, this.fetch()); return 2; };                 // BITB
        o[0xC6] = () => { this.b = this.fetch(); this._flagsNZ8(this.b); this.flagV = false; return 2; }; // LDB
        // 0xC7 undefined
        o[0xC8] = () => { this.b = this._eor8(this.b, this.fetch()); return 2; };
        o[0xC9] = () => { this.b = this._adc8(this.b, this.fetch()); return 2; };
        o[0xCA] = () => { this.b = this._or8(this.b, this.fetch()); return 2; };
        o[0xCB] = () => { this.b = this._add8(this.b, this.fetch()); return 2; };
        o[0xCC] = () => { this.d = this.fetch16(); this._flagsNZ16(this.d); this.flagV = false; return 3; }; // LDD
        // 0xCD undefined
        o[0xCE] = () => { this.u = this.fetch16(); this._flagsNZ16(this.u); this.flagV = false; return 3; }; // LDU

        // Direct
        o[0xD0] = () => { this.b = this._sub8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD1] = () => { this._sub8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD2] = () => { this.b = this._sbc8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD3] = () => { const a = this.addrDirect(); this.d = this._add16(this.d, this.read16(a)); return 6; };
        o[0xD4] = () => { this.b = this._and8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD5] = () => { this._and8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD6] = () => { this.b = this.read(this.addrDirect()); this._flagsNZ8(this.b); this.flagV = false; return 4; };
        o[0xD7] = () => { const a = this.addrDirect(); this.write(a, this.b); this._flagsNZ8(this.b); this.flagV = false; return 4; };
        o[0xD8] = () => { this.b = this._eor8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xD9] = () => { this.b = this._adc8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xDA] = () => { this.b = this._or8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xDB] = () => { this.b = this._add8(this.b, this.read(this.addrDirect())); return 4; };
        o[0xDC] = () => { const a = this.addrDirect(); this.d = this.read16(a); this._flagsNZ16(this.d); this.flagV = false; return 5; };
        o[0xDD] = () => { const a = this.addrDirect(); this.write16(a, this.d); this._flagsNZ16(this.d); this.flagV = false; return 5; }; // STD
        o[0xDE] = () => { const a = this.addrDirect(); this.u = this.read16(a); this._flagsNZ16(this.u); this.flagV = false; return 5; };
        o[0xDF] = () => { const a = this.addrDirect(); this.write16(a, this.u); this._flagsNZ16(this.u); this.flagV = false; return 5; };

        // Indexed
        o[0xE0] = () => { this.b = this._sub8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE1] = () => { this._sub8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE2] = () => { this.b = this._sbc8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE3] = () => { const a = this.addrIndexed(); this.d = this._add16(this.d, this.read16(a)); return 6 + this.idxExtra; };
        o[0xE4] = () => { this.b = this._and8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE5] = () => { this._and8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE6] = () => { this.b = this.read(this.addrIndexed()); this._flagsNZ8(this.b); this.flagV = false; return 4 + this.idxExtra; };
        o[0xE7] = () => { const a = this.addrIndexed(); this.write(a, this.b); this._flagsNZ8(this.b); this.flagV = false; return 4 + this.idxExtra; };
        o[0xE8] = () => { this.b = this._eor8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xE9] = () => { this.b = this._adc8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xEA] = () => { this.b = this._or8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xEB] = () => { this.b = this._add8(this.b, this.read(this.addrIndexed())); return 4 + this.idxExtra; };
        o[0xEC] = () => { const a = this.addrIndexed(); this.d = this.read16(a); this._flagsNZ16(this.d); this.flagV = false; return 5 + this.idxExtra; };
        o[0xED] = () => { const a = this.addrIndexed(); this.write16(a, this.d); this._flagsNZ16(this.d); this.flagV = false; return 5 + this.idxExtra; };
        o[0xEE] = () => { const a = this.addrIndexed(); this.u = this.read16(a); this._flagsNZ16(this.u); this.flagV = false; return 5 + this.idxExtra; };
        o[0xEF] = () => { const a = this.addrIndexed(); this.write16(a, this.u); this._flagsNZ16(this.u); this.flagV = false; return 5 + this.idxExtra; };

        // Extended
        o[0xF0] = () => { this.b = this._sub8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF1] = () => { this._sub8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF2] = () => { this.b = this._sbc8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF3] = () => { const a = this.addrExtended(); this.d = this._add16(this.d, this.read16(a)); return 7; };
        o[0xF4] = () => { this.b = this._and8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF5] = () => { this._and8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF6] = () => { this.b = this.read(this.addrExtended()); this._flagsNZ8(this.b); this.flagV = false; return 5; };
        o[0xF7] = () => { const a = this.addrExtended(); this.write(a, this.b); this._flagsNZ8(this.b); this.flagV = false; return 5; };
        o[0xF8] = () => { this.b = this._eor8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xF9] = () => { this.b = this._adc8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xFA] = () => { this.b = this._or8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xFB] = () => { this.b = this._add8(this.b, this.read(this.addrExtended())); return 5; };
        o[0xFC] = () => { const a = this.addrExtended(); this.d = this.read16(a); this._flagsNZ16(this.d); this.flagV = false; return 6; };
        o[0xFD] = () => { const a = this.addrExtended(); this.write16(a, this.d); this._flagsNZ16(this.d); this.flagV = false; return 6; };
        o[0xFE] = () => { const a = this.addrExtended(); this.u = this.read16(a); this._flagsNZ16(this.u); this.flagV = false; return 6; };
        o[0xFF] = () => { const a = this.addrExtended(); this.write16(a, this.u); this._flagsNZ16(this.u); this.flagV = false; return 6; };

        return o;
    }

    _buildPage2() {
        const o = new Array(256).fill(null);

        // Long branches
        o[0x21] = () => { this.fetch16(); return 5; };                                           // LBRN
        o[0x22] = () => this._lbranchCond(!this.flagC && !this.flagZ);                            // LBHI
        o[0x23] = () => this._lbranchCond(this.flagC || this.flagZ);                              // LBLS
        o[0x24] = () => this._lbranchCond(!this.flagC);                                           // LBCC
        o[0x25] = () => this._lbranchCond(this.flagC);                                            // LBCS
        o[0x26] = () => this._lbranchCond(!this.flagZ);                                           // LBNE
        o[0x27] = () => this._lbranchCond(this.flagZ);                                            // LBEQ
        o[0x28] = () => this._lbranchCond(!this.flagV);                                           // LBVC
        o[0x29] = () => this._lbranchCond(this.flagV);                                            // LBVS
        o[0x2A] = () => this._lbranchCond(!this.flagN);                                           // LBPL
        o[0x2B] = () => this._lbranchCond(this.flagN);                                            // LBMI
        o[0x2C] = () => this._lbranchCond(this.flagN === this.flagV);                              // LBGE
        o[0x2D] = () => this._lbranchCond(this.flagN !== this.flagV);                              // LBLT
        o[0x2E] = () => this._lbranchCond(!this.flagZ && this.flagN === this.flagV);               // LBGT
        o[0x2F] = () => this._lbranchCond(this.flagZ || this.flagN !== this.flagV);                // LBLE

        // SWI2
        o[0x3F] = () => {
            this.flagE = true;
            this._pshsHelper(0xFF);
            this.pc = this.read16(0xFFF4);
            return 20;
        };

        // CMPD
        o[0x83] = () => { this._sub16(this.d, this.fetch16()); return 5; };
        o[0x93] = () => { this._sub16(this.d, this.read16(this.addrDirect())); return 7; };
        o[0xA3] = () => { const a = this.addrIndexed(); this._sub16(this.d, this.read16(a)); return 7 + this.idxExtra; };
        o[0xB3] = () => { this._sub16(this.d, this.read16(this.addrExtended())); return 8; };

        // CMPY
        o[0x8C] = () => { this._sub16(this.y, this.fetch16()); return 5; };
        o[0x9C] = () => { this._sub16(this.y, this.read16(this.addrDirect())); return 7; };
        o[0xAC] = () => { const a = this.addrIndexed(); this._sub16(this.y, this.read16(a)); return 7 + this.idxExtra; };
        o[0xBC] = () => { this._sub16(this.y, this.read16(this.addrExtended())); return 8; };

        // LDY
        o[0x8E] = () => { this.y = this.fetch16(); this._flagsNZ16(this.y); this.flagV = false; return 4; };
        o[0x9E] = () => { this.y = this.read16(this.addrDirect()); this._flagsNZ16(this.y); this.flagV = false; return 6; };
        o[0xAE] = () => { const a = this.addrIndexed(); this.y = this.read16(a); this._flagsNZ16(this.y); this.flagV = false; return 6 + this.idxExtra; };
        o[0xBE] = () => { this.y = this.read16(this.addrExtended()); this._flagsNZ16(this.y); this.flagV = false; return 7; };

        // STY
        o[0x9F] = () => { const a = this.addrDirect(); this.write16(a, this.y); this._flagsNZ16(this.y); this.flagV = false; return 6; };
        o[0xAF] = () => { const a = this.addrIndexed(); this.write16(a, this.y); this._flagsNZ16(this.y); this.flagV = false; return 6 + this.idxExtra; };
        o[0xBF] = () => { const a = this.addrExtended(); this.write16(a, this.y); this._flagsNZ16(this.y); this.flagV = false; return 7; };

        // LDS
        o[0xCE] = () => { this.s = this.fetch16(); this._flagsNZ16(this.s); this.flagV = false; return 4; };
        o[0xDE] = () => { this.s = this.read16(this.addrDirect()); this._flagsNZ16(this.s); this.flagV = false; return 6; };
        o[0xEE] = () => { const a = this.addrIndexed(); this.s = this.read16(a); this._flagsNZ16(this.s); this.flagV = false; return 6 + this.idxExtra; };
        o[0xFE] = () => { this.s = this.read16(this.addrExtended()); this._flagsNZ16(this.s); this.flagV = false; return 7; };

        // STS
        o[0xDF] = () => { const a = this.addrDirect(); this.write16(a, this.s); this._flagsNZ16(this.s); this.flagV = false; return 6; };
        o[0xEF] = () => { const a = this.addrIndexed(); this.write16(a, this.s); this._flagsNZ16(this.s); this.flagV = false; return 6 + this.idxExtra; };
        o[0xFF] = () => { const a = this.addrExtended(); this.write16(a, this.s); this._flagsNZ16(this.s); this.flagV = false; return 7; };

        return o;
    }

    _buildPage3() {
        const o = new Array(256).fill(null);

        // SWI3
        o[0x3F] = () => {
            this.flagE = true;
            this._pshsHelper(0xFF);
            this.pc = this.read16(0xFFF2);
            return 20;
        };

        // CMPU
        o[0x83] = () => { this._sub16(this.u, this.fetch16()); return 5; };
        o[0x93] = () => { this._sub16(this.u, this.read16(this.addrDirect())); return 7; };
        o[0xA3] = () => { const a = this.addrIndexed(); this._sub16(this.u, this.read16(a)); return 7 + this.idxExtra; };
        o[0xB3] = () => { this._sub16(this.u, this.read16(this.addrExtended())); return 8; };

        // CMPS
        o[0x8C] = () => { this._sub16(this.s, this.fetch16()); return 5; };
        o[0x9C] = () => { this._sub16(this.s, this.read16(this.addrDirect())); return 7; };
        o[0xAC] = () => { const a = this.addrIndexed(); this._sub16(this.s, this.read16(a)); return 7 + this.idxExtra; };
        o[0xBC] = () => { this._sub16(this.s, this.read16(this.addrExtended())); return 8; };

        return o;
    }

    // ===================================================================
    // Main execution
    // ===================================================================

    step() {
        if (this.halted || this.waitingForInterrupt) return 1;

        const opcode = this.fetch();

        // Page 2 prefix
        if (opcode === 0x10) {
            const op2 = this.fetch();
            const handler = this.ops10[op2];
            if (handler) {
                const c = handler();
                this.cycles += c;
                return c;
            }
            return 2; // undefined page 2 opcode
        }

        // Page 3 prefix
        if (opcode === 0x11) {
            const op2 = this.fetch();
            const handler = this.ops11[op2];
            if (handler) {
                const c = handler();
                this.cycles += c;
                return c;
            }
            return 2; // undefined page 3 opcode
        }

        const handler = this.ops[opcode];
        if (handler) {
            const c = handler();
            this.cycles += c;
            return c;
        }

        // Undefined opcode — treat as NOP
        return 2;
    }

    reset() {
        this.a = 0; this.b = 0; this.dp = 0;
        this.x = 0; this.y = 0; this.u = 0; this.s = 0;
        this.cc = 0;
        this.flagI = true;
        this.flagF = true;
        this.cycles = 0;
        this.halted = false;
        this.waitingForInterrupt = false;
        this.pc = this.read16(0xFFFE);
    }

    // Run for at least 'n' cycles, return actual cycles executed
    run(targetCycles) {
        let executed = 0;
        while (executed < targetCycles) {
            executed += this.step();
        }
        return executed;
    }

    // Interrupt handling
    checkInterrupts() {
        // NMI (edge-triggered)
        if (this.nmiLine && !this.nmiPrevious) {
            this.waitingForInterrupt = false;
            this.flagE = true;
            this._pshsHelper(0xFF);
            this.flagI = true;
            this.flagF = true;
            this.pc = this.read16(0xFFFC);
            this.nmiPrevious = this.nmiLine;
            return true;
        }
        this.nmiPrevious = this.nmiLine;

        // FIRQ (level-triggered)
        if (this.firqLine && !this.flagF) {
            this.waitingForInterrupt = false;
            this.flagE = false;
            this.pushS16(this.pc);
            this.pushS8(this.cc);
            this.flagI = true;
            this.flagF = true;
            this.pc = this.read16(0xFFF6);
            return true;
        }

        // IRQ (level-triggered)
        if (this.irqLine && !this.flagI) {
            this.waitingForInterrupt = false;
            this.flagE = true;
            this._pshsHelper(0xFF);
            this.flagI = true;
            this.pc = this.read16(0xFFF8);
            return true;
        }

        return false;
    }
}
