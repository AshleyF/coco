// memory.js — Simple 64K memory bus for the CoCo II
// Routes reads/writes to RAM, ROM, and I/O devices

export class Memory {
    constructor() {
        this.ram = new Uint8Array(0x10000); // 64K
        this.rom = null;     // Color BASIC ROM (8K at $A000-$BFFF)
        this.extrom = null;  // Extended BASIC ROM (8K at $8000-$9FFF)
        this.cartrom = null; // Cartridge ROM (up to 16K at $C000-$FFEF)
        this.pia0 = null;
        this.pia1 = null;
        this.sam = null;
    }

    read(addr) {
        addr &= 0xFFFF;
        // PIA 0 ($FF00-$FF1F, partially decoded — mirrors every 4 bytes)
        if (addr >= 0xFF00 && addr <= 0xFF1F && this.pia0) {
            return this.pia0.read(addr & 0x03);
        }
        // PIA 1 ($FF20-$FF3F, partially decoded — mirrors every 4 bytes)
        if (addr >= 0xFF20 && addr <= 0xFF3F && this.pia1) {
            return this.pia1.read(addr & 0x03);
        }
        // SAM (write-only in hardware, reads return $FF)
        if (addr >= 0xFFC0 && addr <= 0xFFDF) {
            return 0xFF;
        }
        // Cartridge ROM ($C000-$FFEF)
        if (addr >= 0xC000 && addr <= 0xFEFF && this.cartrom) {
            const offset = addr - 0xC000;
            if (offset < this.cartrom.length) return this.cartrom[offset];
        }
        // Extended BASIC ROM
        if (addr >= 0x8000 && addr <= 0x9FFF && this.extrom) {
            return this.extrom[addr - 0x8000];
        }
        // Color BASIC ROM
        if (addr >= 0xA000 && addr <= 0xBFFF && this.rom) {
            return this.rom[addr - 0xA000];
        }
        // Interrupt vectors come from ROM (mirrored — top of 8K BASIC ROM)
        if (addr >= 0xFFF0 && addr <= 0xFFFF && this.rom) {
            return this.rom[addr & 0x1FFF];
        }
        return this.ram[addr];
    }

    write(addr, val) {
        addr &= 0xFFFF;
        val &= 0xFF;
        // PIA 0 ($FF00-$FF1F, partially decoded)
        if (addr >= 0xFF00 && addr <= 0xFF1F && this.pia0) {
            this.pia0.write(addr & 0x03, val);
            return;
        }
        // PIA 1 ($FF20-$FF3F, partially decoded)
        if (addr >= 0xFF20 && addr <= 0xFF3F && this.pia1) {
            this.pia1.write(addr & 0x03, val);
            return;
        }
        // SAM registers
        if (addr >= 0xFFC0 && addr <= 0xFFDF && this.sam) {
            this.sam.write(addr, val);
            return;
        }
        // ROM areas are read-only
        if (addr >= 0x8000 && addr <= 0xBFFF) return;
        if (addr >= 0xC000 && addr <= 0xFEFF && this.cartrom) return;
        if (addr >= 0xFFF0) return;
        this.ram[addr] = val;
    }

    loadROM(data, base) {
        if (base === 0xA000) this.rom = new Uint8Array(data);
        else if (base === 0x8000) this.extrom = new Uint8Array(data);
    }

    loadCartridge(data) {
        this.cartrom = new Uint8Array(data);
    }

    removeCartridge() {
        this.cartrom = null;
    }

    // Load raw bytes into RAM (for testing)
    loadBytes(addr, bytes) {
        for (let i = 0; i < bytes.length; i++) {
            this.ram[(addr + i) & 0xFFFF] = bytes[i];
        }
    }
}
