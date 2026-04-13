// pia.js — MC6821 Peripheral Interface Adapter emulation
// The CoCo has two PIAs:
//   PIA0 ($FF00-$FF03): keyboard, joystick, VDG vertical sync
//   PIA1 ($FF20-$FF23): serial, sound, cassette, VDG mode bits

export class PIA {
    constructor() {
        // Side A
        this.ddrA = 0x00;    // Data Direction Register A (0=input, 1=output)
        this.dataA = 0x00;   // Output Register A
        this.ctrlA = 0x00;   // Control Register A
        this.inputA = 0xFF;  // External input to port A (active low for keyboard)

        // Side B
        this.ddrB = 0x00;
        this.dataB = 0x00;
        this.ctrlB = 0x00;
        this.inputB = 0xFF;

        // IRQ flags (bits 7 and 6 of control registers)
        this.irqA1 = false;  // CA1 interrupt flag
        this.irqA2 = false;  // CA2 interrupt flag
        this.irqB1 = false;
        this.irqB2 = false;
    }

    // Read register at offset 0-3
    read(offset) {
        switch (offset) {
            case 0: // Port A data or DDR
                if (this.ctrlA & 0x04) {
                    // Data register: mix outputs and inputs
                    this.irqA1 = false;
                    this.irqA2 = false;
                    return (this.dataA & this.ddrA) | (this.inputA & ~this.ddrA);
                }
                return this.ddrA;
            case 1: // Control Register A
                return (this.ctrlA & 0x3F) |
                       (this.irqA1 ? 0x80 : 0x00) |
                       (this.irqA2 ? 0x40 : 0x00);
            case 2: // Port B data or DDR
                if (this.ctrlB & 0x04) {
                    this.irqB1 = false;
                    this.irqB2 = false;
                    return (this.dataB & this.ddrB) | (this.inputB & ~this.ddrB);
                }
                return this.ddrB;
            case 3: // Control Register B
                return (this.ctrlB & 0x3F) |
                       (this.irqB1 ? 0x80 : 0x00) |
                       (this.irqB2 ? 0x40 : 0x00);
        }
        return 0xFF;
    }

    // Write register at offset 0-3
    write(offset, val) {
        val &= 0xFF;
        switch (offset) {
            case 0:
                if (this.ctrlA & 0x04) {
                    this.dataA = val;
                } else {
                    this.ddrA = val;
                }
                break;
            case 1:
                this.ctrlA = val & 0x3F;
                break;
            case 2:
                if (this.ctrlB & 0x04) {
                    this.dataB = val;
                } else {
                    this.ddrB = val;
                }
                break;
            case 3:
                this.ctrlB = val & 0x3F;
                break;
        }
    }

    // Set CA1/CB1 interrupt (e.g., VSYNC on PIA0)
    setCA1(state) {
        const rising = !!(this.ctrlA & 0x02);
        if (state === rising) {
            this.irqA1 = true;
        }
    }

    setCB1(state) {
        const rising = !!(this.ctrlB & 0x02);
        if (state === rising) {
            this.irqB1 = true;
        }
    }

    get irqActive() {
        const aEnabled = !!(this.ctrlA & 0x01);
        const bEnabled = !!(this.ctrlB & 0x01);
        return (aEnabled && this.irqA1) || (bEnabled && this.irqB1);
    }
}
