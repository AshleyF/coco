// vdg.js — MC6847 Video Display Generator
// Renders CoCo video modes to a pixel framebuffer

// CoCo color palette (NTSC approximation)
const COLORS = [
    [0x00, 0xFF, 0x00],  // 0: Green
    [0xFF, 0xFF, 0x00],  // 1: Yellow
    [0x00, 0x00, 0xFF],  // 2: Blue
    [0xFF, 0x00, 0x00],  // 3: Red
    [0xFF, 0xFF, 0xFF],  // 4: Buff (white)
    [0x00, 0xFF, 0xFF],  // 5: Cyan
    [0xFF, 0x00, 0xFF],  // 6: Magenta
    [0xFF, 0x80, 0x00],  // 7: Orange
    [0x00, 0x00, 0x00],  // 8: Black
    [0x00, 0x40, 0x00],  // 9: Dark green (text BG)
    [0x20, 0x20, 0x20],  // 10: Dark orange BG
];

// Built-in 6847 character generator (5×7 in 8×12 cell)
// Subset covering printable ASCII $20-$5F (standard CoCo character set)
// Each character is 12 rows of 8-bit patterns (top-justified)
const CHAR_ROM = buildCharRom();

function buildCharRom() {
    // Minimal 5x7 font for characters $00-$3F (which map to ASCII $40-$7F and $20-$3F)
    // Each entry is 12 bytes (rows), using bits 7-3 for the 5 pixels
    const font = new Uint8Array(64 * 12);

    // Character data: 5x7 bitmaps packed into the upper 5 bits of each byte
    // Space ($20 = internal $00)
    const chars = {
        // Internal code → 5x7 bitmap rows (7 rows, top-aligned in 12-row cell with 2 row top margin)
        // @ A B C D E F G H I J K L M N O
        // P Q R S T U V W X Y Z [ \ ] ↑ ←
        // (space) ! " # $ % & ' ( ) * + , - . /
        // 0 1 2 3 4 5 6 7 8 9 : ; < = > ?

        0x00: [0x70,0x88,0xA8,0xB8,0xA0,0x88,0x70], // @  (internal $00 → display @)
        0x01: [0x20,0x50,0x88,0x88,0xF8,0x88,0x88], // A
        0x02: [0xF0,0x88,0x88,0xF0,0x88,0x88,0xF0], // B
        0x03: [0x70,0x88,0x80,0x80,0x80,0x88,0x70], // C
        0x04: [0xF0,0x88,0x88,0x88,0x88,0x88,0xF0], // D
        0x05: [0xF8,0x80,0x80,0xF0,0x80,0x80,0xF8], // E
        0x06: [0xF8,0x80,0x80,0xF0,0x80,0x80,0x80], // F
        0x07: [0x70,0x88,0x80,0x80,0x98,0x88,0x70], // G
        0x08: [0x88,0x88,0x88,0xF8,0x88,0x88,0x88], // H
        0x09: [0x70,0x20,0x20,0x20,0x20,0x20,0x70], // I
        0x0A: [0x38,0x10,0x10,0x10,0x10,0x90,0x60], // J
        0x0B: [0x88,0x90,0xA0,0xC0,0xA0,0x90,0x88], // K
        0x0C: [0x80,0x80,0x80,0x80,0x80,0x80,0xF8], // L
        0x0D: [0x88,0xD8,0xA8,0x88,0x88,0x88,0x88], // M
        0x0E: [0x88,0xC8,0xA8,0x98,0x88,0x88,0x88], // N
        0x0F: [0x70,0x88,0x88,0x88,0x88,0x88,0x70], // O
        0x10: [0xF0,0x88,0x88,0xF0,0x80,0x80,0x80], // P
        0x11: [0x70,0x88,0x88,0x88,0xA8,0x90,0x68], // Q
        0x12: [0xF0,0x88,0x88,0xF0,0xA0,0x90,0x88], // R
        0x13: [0x70,0x88,0x80,0x70,0x08,0x88,0x70], // S
        0x14: [0xF8,0x20,0x20,0x20,0x20,0x20,0x20], // T
        0x15: [0x88,0x88,0x88,0x88,0x88,0x88,0x70], // U
        0x16: [0x88,0x88,0x88,0x88,0x50,0x50,0x20], // V
        0x17: [0x88,0x88,0x88,0x88,0xA8,0xA8,0x50], // W
        0x18: [0x88,0x88,0x50,0x20,0x50,0x88,0x88], // X
        0x19: [0x88,0x88,0x50,0x20,0x20,0x20,0x20], // Y
        0x1A: [0xF8,0x08,0x10,0x20,0x40,0x80,0xF8], // Z
        0x1B: [0x70,0x40,0x40,0x40,0x40,0x40,0x70], // [
        0x1C: [0x00,0x80,0x40,0x20,0x10,0x08,0x00], // backslash
        0x1D: [0x70,0x10,0x10,0x10,0x10,0x10,0x70], // ]
        0x1E: [0x20,0x50,0x88,0x00,0x00,0x00,0x00], // ↑ (up arrow)
        0x1F: [0x00,0x00,0x00,0x00,0x00,0x00,0xF8], // ← (underscore/left)

        0x20: [0x00,0x00,0x00,0x00,0x00,0x00,0x00], // (space)
        0x21: [0x20,0x20,0x20,0x20,0x20,0x00,0x20], // !
        0x22: [0x50,0x50,0x50,0x00,0x00,0x00,0x00], // "
        0x23: [0x50,0x50,0xF8,0x50,0xF8,0x50,0x50], // #
        0x24: [0x20,0x78,0xA0,0x70,0x28,0xF0,0x20], // $
        0x25: [0xC0,0xC8,0x10,0x20,0x40,0x98,0x18], // %
        0x26: [0x40,0xA0,0xA0,0x40,0xA8,0x90,0x68], // &
        0x27: [0x20,0x20,0x40,0x00,0x00,0x00,0x00], // '
        0x28: [0x10,0x20,0x40,0x40,0x40,0x20,0x10], // (
        0x29: [0x40,0x20,0x10,0x10,0x10,0x20,0x40], // )
        0x2A: [0x00,0x20,0xA8,0x70,0xA8,0x20,0x00], // *
        0x2B: [0x00,0x20,0x20,0xF8,0x20,0x20,0x00], // +
        0x2C: [0x00,0x00,0x00,0x00,0x20,0x20,0x40], // ,
        0x2D: [0x00,0x00,0x00,0xF8,0x00,0x00,0x00], // -
        0x2E: [0x00,0x00,0x00,0x00,0x00,0x00,0x20], // .
        0x2F: [0x00,0x08,0x10,0x20,0x40,0x80,0x00], // /
        0x30: [0x70,0x88,0x98,0xA8,0xC8,0x88,0x70], // 0
        0x31: [0x20,0x60,0x20,0x20,0x20,0x20,0x70], // 1
        0x32: [0x70,0x88,0x08,0x10,0x20,0x40,0xF8], // 2
        0x33: [0xF8,0x10,0x20,0x10,0x08,0x88,0x70], // 3
        0x34: [0x10,0x30,0x50,0x90,0xF8,0x10,0x10], // 4
        0x35: [0xF8,0x80,0xF0,0x08,0x08,0x88,0x70], // 5
        0x36: [0x30,0x40,0x80,0xF0,0x88,0x88,0x70], // 6
        0x37: [0xF8,0x08,0x10,0x20,0x40,0x40,0x40], // 7
        0x38: [0x70,0x88,0x88,0x70,0x88,0x88,0x70], // 8
        0x39: [0x70,0x88,0x88,0x78,0x08,0x10,0x60], // 9
        0x3A: [0x00,0x00,0x20,0x00,0x20,0x00,0x00], // :
        0x3B: [0x00,0x00,0x20,0x00,0x20,0x20,0x40], // ;
        0x3C: [0x10,0x20,0x40,0x80,0x40,0x20,0x10], // <
        0x3D: [0x00,0x00,0xF8,0x00,0xF8,0x00,0x00], // =
        0x3E: [0x40,0x20,0x10,0x08,0x10,0x20,0x40], // >
        0x3F: [0x70,0x88,0x08,0x10,0x20,0x00,0x20], // ?
    };

    for (const [code, rows] of Object.entries(chars)) {
        const c = parseInt(code);
        const base = c * 12;
        // Center vertically: 2 rows top margin, 7 rows char, 3 rows bottom
        for (let r = 0; r < 7; r++) {
            font[base + r + 2] = rows[r];
        }
    }
    return font;
}

export class VDG {
    constructor(readMemory) {
        this.readMemory = readMemory;
        this.width = 256;
        this.height = 192;
        this.pixels = new Uint8Array(this.width * this.height * 4); // RGBA
        this.artifactColors = true; // enable NTSC artifact color simulation
    }

    // Render text mode: 32 columns × 16 rows, 8×12 character cells
    // videoBase: start of screen memory (from SAM)
    // mode bits from PIA1 side B: AG=0 (text), CSS (color set)
    renderText(videoBase, css) {
        const fg = css ? COLORS[7] : COLORS[0];   // Orange or Green
        const bg = css ? COLORS[8] : COLORS[9];    // Black or Dark green

        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 32; col++) {
                const addr = videoBase + row * 32 + col;
                let charCode = this.readMemory(addr);

                // Bit 6 set = inverse video
                const inverse = !!(charCode & 0x40);
                charCode &= 0x3F;

                // If bit 7 set, it's a semigraphics-4 block
                const isSemigraphics = !!(this.readMemory(addr) & 0x80);

                const px = col * 8;
                const py = row * 12;

                if (isSemigraphics) {
                    this._renderSG4(px, py, this.readMemory(addr));
                } else {
                    this._renderChar(px, py, charCode, inverse ? bg : fg, inverse ? fg : bg);
                }
            }
        }
    }

    _renderChar(px, py, charCode, fg, bg) {
        const base = charCode * 12;
        for (let y = 0; y < 12; y++) {
            const row = CHAR_ROM[base + y];
            for (let x = 0; x < 8; x++) {
                const on = !!(row & (0x80 >> x));
                const color = on ? fg : bg;
                const idx = ((py + y) * this.width + (px + x)) * 4;
                this.pixels[idx] = color[0];
                this.pixels[idx + 1] = color[1];
                this.pixels[idx + 2] = color[2];
                this.pixels[idx + 3] = 255;
            }
        }
    }

    // Semigraphics-4: byte = 1CSSLLRR
    // C=color set, SS=color (0-7 from CSS+SS), LL=top blocks, RR=bottom blocks
    _renderSG4(px, py, byte) {
        const colorIdx = ((byte >> 4) & 0x07);
        const color = COLORS[colorIdx] || COLORS[0];
        const bg = COLORS[8]; // black

        // 4 quadrants in a 2×2 grid, each 4×6 pixels
        const tl = !!(byte & 0x08);
        const tr = !!(byte & 0x04);
        const bl = !!(byte & 0x02);
        const br = !!(byte & 0x01);

        const quadrants = [
            { on: tl, x: 0, y: 0 },
            { on: tr, x: 4, y: 0 },
            { on: bl, x: 0, y: 6 },
            { on: br, x: 4, y: 6 },
        ];

        for (const q of quadrants) {
            const c = q.on ? color : bg;
            for (let dy = 0; dy < 6; dy++) {
                for (let dx = 0; dx < 4; dx++) {
                    const idx = ((py + q.y + dy) * this.width + (px + q.x + dx)) * 4;
                    this.pixels[idx] = c[0];
                    this.pixels[idx + 1] = c[1];
                    this.pixels[idx + 2] = c[2];
                    this.pixels[idx + 3] = 255;
                }
            }
        }
    }

    // Graphics modes based on GM2,GM1,GM0 from PIA1 port B bits 6,5,4
    // GM  Mode  Resolution  Colors  Bytes/row
    // 0   CG1   64×64       4       16
    // 1   RG1   128×64      2       16
    // 2   CG2   128×64      4       32
    // 3   RG2   128×96      2       16
    // 4   CG3   128×96      4       16
    // 5   RG3   128×192     2       16
    // 6   CG6   128×192     4       32
    // 7   RG6   256×192     2       32
    renderGraphics(videoBase, gm, css) {
        switch (gm) {
            case 0: this._renderColor4(videoBase, css, 64, 64, 16); break;    // CG1
            case 1: this._renderMono(videoBase, css, 128, 64, 16); break;     // RG1
            case 2: this._renderColor4(videoBase, css, 128, 64, 32); break;   // CG2
            case 3: this._renderMono(videoBase, css, 128, 96, 16); break;     // RG2
            case 4: this._renderColor4(videoBase, css, 128, 96, 16); break;   // CG3
            case 5: this._renderMono(videoBase, css, 128, 192, 16); break;    // RG3
            case 6: this._renderColor4(videoBase, css, 128, 192, 32); break;  // CG6
            case 7: // RG6 — 256×192, 2 color with NTSC artifact colors
                if (this.artifactColors) {
                    this._renderArtifact(videoBase, css, 32);
                } else {
                    this._renderMono(videoBase, css, 256, 192, 32);
                }
                break;
            default: this._renderMono(videoBase, css, 256, 192, 32); break;
        }
    }

    // 4-color mode: 2 bits per pixel
    _renderColor4(videoBase, css, srcW, srcH, bytesPerRow) {
        const palette = css ?
            [COLORS[4], COLORS[2], COLORS[3], COLORS[7]] :  // Buff, Blue, Red, Orange
            [COLORS[0], COLORS[1], COLORS[2], COLORS[3]];   // Green, Yellow, Blue, Red
        const scaleX = this.width / srcW;
        const scaleY = this.height / srcH;
        const pixPerByte = 4; // 2 bits per pixel, 4 pixels per byte

        for (let y = 0; y < srcH; y++) {
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
                const byte = this.readMemory(videoBase + y * bytesPerRow + xByte);
                for (let pix = 0; pix < pixPerByte; pix++) {
                    const colorIdx = (byte >> (6 - pix * 2)) & 0x03;
                    const color = palette[colorIdx];
                    const sx = (xByte * pixPerByte + pix) * scaleX;
                    const sy = y * scaleY;
                    for (let dy = 0; dy < scaleY; dy++) {
                        for (let dx = 0; dx < scaleX; dx++) {
                            const px = Math.floor(sx + dx);
                            const py = Math.floor(sy + dy);
                            if (px < this.width && py < this.height) {
                                const idx = (py * this.width + px) * 4;
                                this.pixels[idx] = color[0];
                                this.pixels[idx + 1] = color[1];
                                this.pixels[idx + 2] = color[2];
                                this.pixels[idx + 3] = 255;
                            }
                        }
                    }
                }
            }
        }
    }

    // 2-color (monochrome) mode: 1 bit per pixel
    _renderMono(videoBase, css, srcW, srcH, bytesPerRow) {
        const fg = css ? COLORS[4] : COLORS[0];   // Buff or Green
        const bg = css ? COLORS[8] : COLORS[9];   // Black or Dark green
        const scaleX = this.width / srcW;
        const scaleY = this.height / srcH;

        for (let y = 0; y < srcH; y++) {
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
                const byte = this.readMemory(videoBase + y * bytesPerRow + xByte);
                for (let bit = 0; bit < 8; bit++) {
                    const on = !!(byte & (0x80 >> bit));
                    const color = on ? fg : bg;
                    const sx = (xByte * 8 + bit) * scaleX;
                    const sy = y * scaleY;
                    for (let dy = 0; dy < scaleY; dy++) {
                        for (let dx = 0; dx < scaleX; dx++) {
                            const px = Math.floor(sx + dx);
                            const py = Math.floor(sy + dy);
                            if (px < this.width && py < this.height) {
                                const idx = (py * this.width + px) * 4;
                                this.pixels[idx] = color[0];
                                this.pixels[idx + 1] = color[1];
                                this.pixels[idx + 2] = color[2];
                                this.pixels[idx + 3] = 255;
                            }
                        }
                    }
                }
            }
        }
    }

    // NTSC artifact color rendering for RG6 (256×192 PMODE 4)
    // Adjacent pixel pairs create colors due to NTSC chroma phase
    // Pair patterns: 00=black, 01=blue/orange, 10=orange/blue, 11=white
    // Which color depends on even/odd column position (NTSC phase)
    _renderArtifact(videoBase, css, bytesPerRow) {
        // Two artifact color sets (toggled by CSS or screen position)
        const artifactSet1 = [
            COLORS[8],  // 00 = black
            COLORS[2],  // 01 = blue
            COLORS[7],  // 10 = orange
            COLORS[4],  // 11 = white/buff
        ];
        const artifactSet2 = [
            COLORS[8],  // 00 = black
            COLORS[7],  // 01 = orange
            COLORS[2],  // 10 = blue
            COLORS[4],  // 11 = white/buff
        ];
        const palette = css ? artifactSet2 : artifactSet1;

        for (let y = 0; y < 192; y++) {
            for (let xByte = 0; xByte < bytesPerRow; xByte++) {
                const byte = this.readMemory(videoBase + y * bytesPerRow + xByte);
                // Process pixel pairs (4 pairs per byte)
                for (let pair = 0; pair < 4; pair++) {
                    const bits = (byte >> (6 - pair * 2)) & 0x03;
                    const color = palette[bits];
                    const px = xByte * 8 + pair * 2;
                    // Each artifact pixel pair maps to 2 output pixels
                    for (let dx = 0; dx < 2; dx++) {
                        const idx = (y * this.width + px + dx) * 4;
                        this.pixels[idx] = color[0];
                        this.pixels[idx + 1] = color[1];
                        this.pixels[idx + 2] = color[2];
                        this.pixels[idx + 3] = 255;
                    }
                }
            }
        }
    }

    // Get ImageData-compatible buffer
    getImageData() {
        return this.pixels;
    }
}
