// sam.js — MC6883 Synchronous Address Multiplexer
// Controls video display mode, memory size, and CPU clock rate
// Registers at $FFC0-$FFDF are bit-pair set/clear (write-only)

export class SAM {
    constructor() {
        this.bits = 0;  // 16-bit internal register
    }

    // Write to SAM register address
    // Even addresses clear a bit, odd addresses set it
    // $FFC0/$FFC1 = bit 0, $FFC2/$FFC3 = bit 1, etc.
    write(addr) {
        const bitNum = (addr - 0xFFC0) >> 1;
        const set = addr & 1;
        if (bitNum < 0 || bitNum > 15) return;
        if (set) {
            this.bits |= (1 << bitNum);
        } else {
            this.bits &= ~(1 << bitNum);
        }
    }

    // Video display offset (F0-F6, bits 3-9) — multiplied by 512
    get videoOffset() {
        return ((this.bits >> 3) & 0x7F) << 9;
    }

    // Video mode (V0-V2, bits 0-2)
    get videoMode() {
        return this.bits & 0x07;
    }

    // Memory size (M0-M1, bits 12-13)
    get memorySize() {
        return (this.bits >> 12) & 0x03;
    }

    // CPU rate (R0-R1, bits 14-15)
    get cpuRate() {
        return (this.bits >> 14) & 0x03;
    }

    // Page bit (P1, bit 10)
    get page() {
        return (this.bits >> 10) & 0x01;
    }
}
