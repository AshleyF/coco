// coco.js — TRS-80 Color Computer II system integration
// Wires CPU, memory, PIAs, SAM, VDG, keyboard together

import { MC6809 } from './cpu.js';
import { Memory } from './memory.js';
import { PIA } from './pia.js';
import { SAM } from './sam.js';
import { VDG } from './vdg.js';
import { Keyboard } from './keyboard.js';
import { Joystick } from './joystick.js';
import { Sound } from './sound.js';
import { Cassette, casToWAV } from './cassette.js';

const CYCLES_PER_FRAME = 14914; // ~894,886 Hz / 60 fps

export class CoCo {
    constructor() {
        this.mem = new Memory();
        this.pia0 = new PIA();
        this.pia1 = new PIA();
        this.sam = new SAM();
        this.keyboard = new Keyboard();
        this.joystick = new Joystick();
        this.cassette = new Cassette();
        this.sound = new Sound();
        this.vdg = new VDG(addr => this.mem.read(addr));

        // Wire PIAs and SAM into memory bus
        this.mem.pia0 = this.pia0;
        this.mem.pia1 = this.pia1;
        this.mem.sam = this.sam;

        // Wire keyboard and joystick to PIA0
        // PIA0 port B selects keyboard columns, port A reads rows
        // PIA0 port A bit 7 = joystick comparator output
        // PIA0 port A bit 0 = right joystick button
        // PIA0 port A bit 1 = left joystick button
        const origReadPia0 = this.pia0.read.bind(this.pia0);
        this.pia0.read = (offset) => {
            if (offset === 0 && (this.pia0.ctrlA & 0x04)) {
                // Feed keyboard matrix
                const colSelect = this.pia0.dataB;
                let portA = this.keyboard.readRows(colSelect);

                // Joystick comparator on bit 7
                // DAC value from PIA1 port A bits 2-7
                // Axis MUX (74LS153):
                //   CA2 (SEL0): 0=X, 1=Y
                //   CB2 (SEL1): 0=right, 1=left
                const dacValue = (this.pia1.dataA >> 2) & 0x3F;
                const selY = !!(this.pia0.ctrlA & 0x08);     // CA2: 0=X, 1=Y
                const selLeft = !!(this.pia0.ctrlB & 0x08);  // CB2: 0=right, 1=left
                const axis = (selLeft ? 2 : 0) + (selY ? 1 : 0);
                const cmpResult = this.joystick.compare(axis, dacValue);
                if (cmpResult) {
                    portA |= 0x80;  // DAC >= joystick: comparator high
                } else {
                    portA &= 0x7F;  // DAC < joystick: comparator low
                }

                // Joystick buttons (active low)
                // Only visible when keyboard columns are deselected
                if (colSelect === 0xFF) {
                    if (this.joystick.buttons[0]) portA &= ~0x01; // right button → PA0
                    if (this.joystick.buttons[1]) portA &= ~0x02; // left button → PA1
                }

                this.pia0.inputA = portA;
            }
            return origReadPia0(offset);
        };

        // Wire cassette to PIA1
        // PIA1 port A bit 0 = cassette data input (CASSDIN)
        // PIA1 CA2 (ctrl A bits 3-5) = cassette motor control
        const origReadPia1 = this.pia1.read.bind(this.pia1);
        this.pia1.read = (offset) => {
            if (offset === 0 && (this.pia1.ctrlA & 0x04) && this.cassette.motorOn) {
                // Reading port A data while motor is on — inject cassette bit
                const cassBit = this.cassette.readBit();
                this.pia1.inputA = (this.pia1.inputA & 0xFE) | cassBit;
            }
            return origReadPia1(offset);
        };
        const origWritePia1 = this.pia1.write.bind(this.pia1);
        this.pia1.write = (offset, val) => {
            origWritePia1(offset, val);
            // CA2 motor control: when ctrl A configures CA2 as output
            if (offset === 1) {
                if ((val & 0x30) === 0x30) {
                    this.cassette.setMotor(!!(val & 0x08));
                } else if ((val & 0x20) === 0) {
                    this.cassette.setMotor(false);
                }
            }
            // Port A write: update DAC for sound (bits 2-7)
            if (offset === 0 && (this.pia1.ctrlA & 0x04)) {
                this.sound.setDAC(val);
            }
            // CB2 sound enable: ctrl B bits 5,4,3
            if (offset === 3) {
                if ((val & 0x30) === 0x30) {
                    this.sound.setSoundEnable(!!(val & 0x08));
                }
            }
        };

        this.cpu = new MC6809(
            addr => this.mem.read(addr),
            (addr, val) => this.mem.write(addr, val)
        );
        this.running = false;
        this.frameId = null;
        this.canvas = null;
        this.ctx = null;
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        // Canvas bitmap is the VDG's native 256x192. The browser's compositor
        // scales to whatever CSS size the page wants (we use aspect-ratio:4/3
        // and width:100% in the stylesheet). Per A/B benchmarks on Android,
        // direct putImageData to a native-sized canvas is significantly
        // faster than going via an off-screen back buffer + drawImage,
        // and using a native-sized bitmap minimises the per-frame upload.
        canvas.width = 256;
        canvas.height = 192;
        this.ctx = canvas.getContext('2d');
    }

    async loadROMFile(file) {
        const data = new Uint8Array(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        if (name.includes('ext') || name.includes('8000')) {
            this.mem.loadROM(data, 0x8000);
            return `Extended BASIC loaded (${data.length} bytes)`;
        } else {
            this.mem.loadROM(data, 0xA000);
            return `Color BASIC loaded (${data.length} bytes)`;
        }
    }

    loadCartridge(data) {
        this.mem.loadCartridge(data);
    }

    removeCartridge() {
        this.mem.removeCartridge();
    }

    // Type text into the machine character by character
    // Each char is held for a few frames, then released, simulating real typing
    startTyping(text) {
        this.keyboard.clearAll();
        this._typeQueue = [];
        // Normalize newlines: \r\n → \n, \r → \n
        let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Ensure trailing newline (pasted code always needs final Enter)
        if (!normalized.endsWith('\n')) normalized += '\n';
        for (const ch of normalized) {
            if (ch === '\n') {
                this._typeQueue.push('Enter');
            } else {
                this._typeQueue.push(ch);
            }
        }
        this._typeFrameCount = 0;
        this._typeHoldFrames = 4;
        this._typeGapFrames = 3;
        this._typeEnterGapFrames = 20; // ~333ms pause after Enter
        this._typePhase = 'delay';
        this._typeCurrentKey = null;
        this._typeDelayFrames = 15;
    }

    // Call each frame to advance the typing simulation
    _advanceTyping() {
        if (!this._typeQueue || this._typeQueue.length === 0) {
            // Queue is empty, but we still need to hold the last key for the
            // full hold duration before releasing — otherwise on slow devices
            // BASIC's KEYIN scan can miss the press.
            if (this._typePhase === 'hold') {
                this._typeFrameCount++;
                if (this._typeFrameCount >= this._typeHoldFrames) {
                    this.keyboard.keyUp({ key: this._typeCurrentKey });
                    this._typePhase = 'idle';
                    this._typeCurrentKey = null;
                }
            }
            return;
        }

        this._typeFrameCount++;

        // Initial delay before typing starts
        if (this._typePhase === 'delay') {
            if (this._typeFrameCount < this._typeDelayFrames) return;
            this._typePhase = 'idle';
            this._typeFrameCount = 0;
        }

        if (this._typePhase === 'idle' || this._typePhase === 'gap') {
            const neededGap = this._typeWasEnter ? this._typeEnterGapFrames : this._typeGapFrames;
            if (this._typePhase === 'gap' && this._typeFrameCount < neededGap) return;
            // Start next character
            const key = this._typeQueue.shift();
            this._typeCurrentKey = key;
            this.keyboard.keyDown({ key });
            this._typePhase = 'hold';
            this._typeFrameCount = 0;
        } else if (this._typePhase === 'hold') {
            if (this._typeFrameCount >= this._typeHoldFrames) {
                this._typeWasEnter = (this._typeCurrentKey === 'Enter');
                this.keyboard.keyUp({ key: this._typeCurrentKey });
                this._typePhase = 'gap';
                this._typeFrameCount = 0;
            }
        }
    }

    get isTyping() {
        return this._typeQueue && (this._typeQueue.length > 0 || this._typePhase === 'hold');
    }

    reset() {
        this.cpu.reset();
        this._cartStarted = false;
        this._cartBootFrames = undefined;
        // Cartridge autostart: assert FIRQ and set PIA1 CB1 flag
        if (this.mem.cartrom) {
            this.pia1.irqB1 = true;
            this.cpu.firqLine = true;
        }
    }

    renderFrame() {
        // Determine video mode from PIA1 port B and SAM
        const pia1b = this.pia1.dataB;
        const ag = !!(pia1b & 0x80);     // bit 7: Alphanumeric/Graphics
        const gm = (pia1b >> 4) & 0x07;  // bits 6,5,4: GM2,GM1,GM0
        const css = !!(pia1b & 0x08);    // bit 3: Color Set Select
        const videoBase = this.sam.videoOffset;

        if (ag) {
            this.vdg.renderGraphics(videoBase, gm, css);
        } else {
            this.vdg.renderText(videoBase, css);
        }

        // Skip the GPU upload if nothing has changed since the last frame
        // (very common at the BASIC prompt — only the cursor blink produces
        // periodic changes). On Android the per-frame putImageData round-trip
        // is by far the most expensive part of stepFrame, so skipping it on
        // unchanged frames lets idle rAF run at the browser's refresh rate
        // instead of the GPU upload cap.
        if (this.ctx) {
            const pixels = this.vdg.pixels;
            if (!this._prevPixels || this._prevPixels.length !== pixels.length) {
                this._prevPixels = new Uint8Array(pixels.length);
                this._pixelsDirty = true;
            } else {
                let same = true;
                const prev = this._prevPixels;
                for (let i = 0, n = pixels.length; i < n; i++) {
                    if (pixels[i] !== prev[i]) { same = false; break; }
                }
                this._pixelsDirty = !same;
            }
            if (this._pixelsDirty) {
                if (!this._imageData) {
                    this._imageData = this.ctx.createImageData(
                        this.vdg.width, this.vdg.height);
                }
                this._imageData.data.set(pixels);
                this.ctx.putImageData(this._imageData, 0, 0);
                this._prevPixels.set(pixels);
            }
        }

        // Flush sound
        this.sound.flush();
    }

    stepFrame() {
        this.joystick.update();
        this._advanceTyping();
        if (this._cartBootFrames !== undefined) this._cartBootFrames++;
        let executed = 0;

        // Set VSYNC flag at START of frame — BASIC polls this flag during
        // tight loops like SOUND command. If we only set it after the loop,
        // routines that run with interrupts disabled never see it.
        this.pia0.setCB1(false);
        if (this.pia0.irqActive) {
            this.cpu.irqLine = true;
        }
        this.cpu.checkInterrupts();
        this.cpu.irqLine = false;
        this.pia0.setCB1(true); // reset for next frame

        while (executed < CYCLES_PER_FRAME) {
            // Keep CART signal active until cartridge code starts running
            if (this.mem.cartrom && !this._cartStarted) {
                this.pia1.irqB1 = true;
                this.cpu.firqLine = true;
                this.cpu.checkInterrupts();
                if (this.cpu.pc >= 0xC000 && this.cpu.pc < 0xFF00) {
                    this._cartStarted = true;
                    this._cartBootFrames = 0;
                    this.cpu.firqLine = false;
                }
            }
            const pc = this.cpu.pc;

            // ROM intercept: CSRDON(cassette sync) at $A77C
            // Skip the FSK leader sync — just turn motor on and return
            if (this.cassette.interceptEnabled && pc === 0xA77C &&
                this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {
                this.cassette.setMotor(true);
                this.mem.write(0x84, 0x00);
                this.mem.write(0x90, 0x12);
                this.mem.write(0x91, 0x08);
                this.cpu.pc = 0xA796;
                executed += 100;
                continue;
            }

            // ROM intercept: full block read at $A701
            // A701: BSR A77C (sync) + BSR A70B (block read) + JSR A7E9 (motor off) + LDB <$81 + RTS
            // We do it all: read block, turn motor off, set B and Z flag, return
            if (this.cassette.interceptEnabled &&
                pc === 0xA701 && this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {

                // Turn motor on
                this.cassette.setMotor(true);

                // Skip leader bytes
                while (this.cassette.playPos < this.cassette.playBuffer.length &&
                       this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                    this.cassette.playPos++;
                }

                let error = 1;
                if (this.cassette.playPos < this.cassette.playBuffer.length &&
                    this.cassette.playBuffer[this.cassette.playPos] === 0x3C) {
                    this.cassette.playPos++; // skip sync

                    const blockType = this.cassette.nextByte();
                    const blockLen = this.cassette.nextByte();

                    this.mem.write(0x7C, blockType);
                    this.mem.write(0x7D, blockLen);

                    let checksum = (blockType + blockLen) & 0xFF;
                    // Write to wherever $7E-$7F points (ROM's BLKIN does LDX <$7E)
                    let x = (this.mem.read(0x7E) << 8) | this.mem.read(0x7F);

                    for (let i = 0; i < blockLen; i++) {
                        const byte = this.cassette.nextByte();
                        if (byte < 0) break;
                        this.mem.write(x, byte);
                        x = (x + 1) & 0xFFFF;
                        checksum = (checksum + byte) & 0xFF;
                    }

                    const expectedChecksum = this.cassette.nextByte();

                    // Skip trailer
                    if (this.cassette.playPos < this.cassette.playBuffer.length &&
                        this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                        this.cassette.playPos++;
                    }

                    const ok = expectedChecksum >= 0 && (checksum === (expectedChecksum & 0xFF));
                    error = ok ? 0 : 1;
                    this.cpu.x = x;
                }

                // Turn motor off (what A7E9 does)
                this.cassette.setMotor(false);

                // Set error flag and B register (what A708: LDB <$81 does)
                this.mem.write(0x81, error);
                this.cpu.b = error;
                this.cpu.flagZ = (error === 0);
                this.cpu.flagN = false;

                this.cpu.pc = 0xA70A; // RTS at end of A701
                executed += 500;
                continue;
            }

            // ROM intercept: BLKIN at $A70B (called directly for subsequent blocks)
            if (this.cassette.interceptEnabled &&
                pc === 0xA70B && this.cassette.playBuffer &&
                this.cassette.playPos < this.cassette.playBuffer.length) {

                // Skip leader ($55) bytes
                while (this.cassette.playPos < this.cassette.playBuffer.length &&
                       this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                    this.cassette.playPos++;
                }

                if (this.cassette.playPos < this.cassette.playBuffer.length &&
                    this.cassette.playBuffer[this.cassette.playPos] === 0x3C) {
                    this.cassette.playPos++; // skip sync byte

                    const blockType = this.cassette.nextByte();
                    const blockLen = this.cassette.nextByte();

                    this.mem.write(0x7C, blockType);
                    this.mem.write(0x7D, blockLen);

                    let checksum = (blockType + blockLen) & 0xFF;
                    // Write to wherever $7E-$7F points (same as ROM's BLKIN)
                    let x = (this.mem.read(0x7E) << 8) | this.mem.read(0x7F);

                    for (let i = 0; i < blockLen; i++) {
                        const byte = this.cassette.nextByte();
                        if (byte < 0) break;
                        this.mem.write(x, byte);
                        x = (x + 1) & 0xFFFF;
                        checksum = (checksum + byte) & 0xFF;
                    }

                    const expectedChecksum = this.cassette.nextByte();

                    // Skip trailer
                    if (this.cassette.playPos < this.cassette.playBuffer.length &&
                        this.cassette.playBuffer[this.cassette.playPos] === 0x55) {
                        this.cassette.playPos++;
                    }

                    // Error flag: 0=OK
                    const ok = expectedChecksum >= 0 && (checksum === (expectedChecksum & 0xFF));
                    this.mem.write(0x81, ok ? 0 : 1);

                    // Set B and Z flag — callers check Z after BLKIN returns
                    this.cpu.b = ok ? 0 : 1;
                    this.cpu.flagZ = ok;
                    this.cpu.flagN = false;

                    this.cpu.x = x;
                    this.cpu.pc = 0xA748; // RTS
                    executed += 500;
                    continue;
                }
            }

            // ROM intercept: byte-OUT at $A82A (CSAVE writes)
            if (this.cassette.interceptEnabled && this.cassette.recording && pc === 0xA82A) {
                this.cassette.recordBuffer.push(this.cpu.a);
                this.cpu.step(); // PSHS A
                this.cpu.pc = 0xA85A; // PULS A,PC
                executed += 84;
                continue;
            }

            // Skip cassette delay loops — during cassette ops or first 5 sec of cart boot
            const cartBooting = this.mem.cartrom && !this._cartStarted ||
                (this.mem.cartrom && this._cartBootFrames !== undefined && this._cartBootFrames < 300);
            if (this.cassette.motorOn || this.cassette.recording || cartBooting) {
                // $A7D8: WRLDR — write leader + data. Skip entirely.
                if (pc === 0xA7D8) { this.cpu.pc = 0xA7E4; executed += 100; continue; }
                // $A7CA: CASON — motor on + delay. Skip delay but charge real cycle cost.
                if (pc === 0xA7CA) {
                    const val = this.mem.read(0xFF21) | 0x08;
                    this.mem.write(0xFF21, val);
                    this.cpu.pc = 0xA7D7; executed += 5000; continue;
                }
                // $A7D3: LEAX -1,X; BNE (delay loop). Charge real cycle cost.
                if (pc === 0xA7D3) {
                    const x = this.cpu.x || 1;
                    this.cpu.x = 0; this.cpu.pc = 0xA7D7;
                    executed += x * 5; continue;
                }
                // $A964: Leader tone write loop. Skip with real cost.
                if (pc === 0xA964) {
                    this.mem.write(0x8D, 0); this.mem.write(0x8E, 0);
                    this.cpu.x = 0; this.cpu.pc = 0xA970; executed += 5000; continue;
                }
            }

            const c = this.cpu.step();
            executed += c;
            this.cassette.advanceCycles(c);
            this.sound.addCycles(c);
        }
        this.renderFrame();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._lastFrameTime = 0;
        this._frameCount = 0;
        this._fpsTime = 0;
        const fpsEl = document.getElementById('fps');
        const tick = (timestamp) => {
            if (!this.running) return;
            // Throttle to ~60fps
            if (timestamp - this._lastFrameTime >= 16) {
                this._lastFrameTime = timestamp;
                this.stepFrame();
                this._frameCount++;
                if (timestamp - this._fpsTime >= 1000) {
                    if (fpsEl) fpsEl.textContent = this._frameCount + ' fps';
                    this._frameCount = 0;
                    this._fpsTime = timestamp;
                }
            }
            this.frameId = requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
}

// === UI wiring ===
const coco = new CoCo();
const status = document.getElementById('status');
const canvas = document.getElementById('screen');
if (canvas) coco.setCanvas(canvas);

// Keyboard and joystick events
// Ctrl+Arrow/Space = joystick (consumed, not sent to CoCo keyboard)
// All other keys go to CoCo keyboard
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'v') return; // let Ctrl-V through for paste
    if (coco.joystick.keyDown(e)) { e.preventDefault(); return; }
    if (!e.ctrlKey) { // don't send Ctrl combos to CoCo keyboard
        if (coco.keyboard.keyDown(e)) e.preventDefault();
    }
});
document.addEventListener('keyup', (e) => {
    if (coco.joystick.keyUp(e)) { e.preventDefault(); return; }
    if (coco.keyboard.keyUp(e)) e.preventDefault();
});
// Ctrl-V paste: read clipboard and type it in
document.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    const upper = text.toUpperCase();
    coco.startTyping(upper);
    status.textContent = 'Pasting ' + upper.split('\n').length + ' line(s)...';
});
// Clear all keys when window loses focus (prevents stuck keys)
window.addEventListener('blur', () => {
    coco.keyboard.clearAll();
    coco.joystick.clearAll();
});

// Auto-load ROMs from roms/ directory on startup
async function autoLoadROMs() {
    const romFiles = [
        { url: 'roms/bas13.rom', base: 0xA000, name: 'Color BASIC 1.3' },
        { url: 'roms/extbas11.rom', base: 0x8000, name: 'Extended BASIC 1.1' },
    ];
    const loaded = [];
    for (const r of romFiles) {
        try {
            const resp = await fetch(r.url);
            if (resp.ok) {
                const data = new Uint8Array(await resp.arrayBuffer());
                coco.mem.loadROM(data, r.base);
                loaded.push(r.name);
            }
        } catch (e) { /* ROM not found, skip */ }
    }
    if (loaded.length > 0) {
        coco.reset();
        coco.start();
        startTapeStatus();
        status.textContent = `Loaded: ${loaded.join(', ')}. Running!`;
    } else {
        status.textContent = 'No ROMs found in roms/. Click Load ROM or Test ROM.';
    }
}
autoLoadROMs();

document.getElementById('loadRom')?.addEventListener('click', () => {
    document.getElementById('romFile')?.click();
});

document.getElementById('romFile')?.addEventListener('change', async (e) => {
    const msgs = [];
    for (const file of e.target.files) {
        const msg = await coco.loadROMFile(file);
        msgs.push(msg);
    }
    status.textContent = msgs.join('; ');
});

document.getElementById('reset')?.addEventListener('click', () => {
    coco.stop();
    coco.reset();
    coco.start();
    startTapeStatus();
    status.textContent = 'Reset.';
});

// === Tape status display ===
const tapeLabel = document.getElementById('tape-label');
const tapeMotor = document.getElementById('tape-motor');
const tapePct = document.getElementById('tape-pct');

let tapeStatusInterval = null;
function startTapeStatus() {
    if (tapeStatusInterval) return;
    tapeStatusInterval = setInterval(() => { updateTapeStatus(); updateJoystickDisplay(); }, 100);
}
function stopTapeStatus() {
    if (tapeStatusInterval) { clearInterval(tapeStatusInterval); tapeStatusInterval = null; }
}

function updateTapeStatus() {
    const c = coco.cassette;
    if (!c) return;

    if (tapeMotor) {
        if (c.recording) {
            tapeMotor.textContent = '⏺REC';
            tapeMotor.style.color = '#f44';
        } else if (c.motorOn) {
            tapeMotor.textContent = '▶ON';
            tapeMotor.style.color = '#0f0';
        } else {
            tapeMotor.textContent = '⏹';
            tapeMotor.style.color = '#666';
        }
    }

    if (tapePct) {
        if (c.recording) {
            tapePct.textContent = c.recordBuffer.length + 'B';
        } else {
            tapePct.textContent = Math.round(c.progress * 100) + '%';
        }
    }
}

// === Joystick display ===
const joyRightCanvas = document.getElementById('joy-right');
const joyLeftCanvas = document.getElementById('joy-left');
const joyRightCtx = joyRightCanvas?.getContext('2d');
const joyLeftCtx = joyLeftCanvas?.getContext('2d');
const joyRightPos = document.getElementById('joy-right-pos');
const joyLeftPos = document.getElementById('joy-left-pos');

function drawStick(ctx, x, y, btnPressed, w, h) {
    if (!ctx) return;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
    ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
    ctx.stroke();
    const px = (x / 63) * (w - 6) + 3;
    const py = (y / 63) * (h - 6) + 3;
    ctx.fillStyle = btnPressed ? '#f44' : '#0f0';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    if (btnPressed) {
        ctx.strokeStyle = '#f44';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.lineWidth = 1;
    }
}

function updateJoystickDisplay() {
    const j = coco.joystick;
    drawStick(joyRightCtx, j.axes[0], j.axes[1], j.buttons[0], 40, 40);
    drawStick(joyLeftCtx, j.axes[2], j.axes[3], j.buttons[1], 40, 40);
    if (joyRightPos) joyRightPos.textContent = `R:${j.axes[0]},${j.axes[1]}${j.buttons[0] ? '!' : ''}`;
    if (joyLeftPos) joyLeftPos.textContent = `L:${j.axes[2]},${j.axes[3]}${j.buttons[1] ? '!' : ''}`;
}

// === Cassette UI ===
document.getElementById('loadTape')?.addEventListener('click', () => {
    document.getElementById('tapeFile')?.click();
});

document.getElementById('tapeFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const name = file.name.toLowerCase();

    coco.cassette.loadCAS(data);
    status.textContent = `Tape loaded: ${file.name}`;
    if (tapeLabel) tapeLabel.textContent = `🎵 ${file.name}`;
    updateTapeStatus();
});

document.getElementById('recordTape')?.addEventListener('click', () => {
    if (coco.cassette.recording) {
        // Stop recording
        coco.cassette.recording = false;
        status.textContent = `Recording stopped. ${coco.cassette.recordBuffer.length} bytes. Click Save CAS or Save WAV.`;
    } else {
        // Start recording
        coco.cassette.startRecording();
        if (tapeLabel) tapeLabel.textContent = '🎵 ⏺ Recording armed';
        status.textContent = 'Recording armed. Type CSAVE"NAME" in BASIC.';
    }
    updateTapeStatus();
});

document.getElementById('saveTapeCAS')?.addEventListener('click', () => {
    const data = coco.cassette.recording
        ? new Uint8Array(coco.cassette.recordBuffer)
        : (coco.cassette.recordBuffer.length > 0
            ? new Uint8Array(coco.cassette.recordBuffer)
            : (coco.cassette.playBuffer || new Uint8Array(0)));
    if (data.length === 0) {
        status.textContent = 'No tape data to save. Click Record, then CSAVE in BASIC.';
        return;
    }
    downloadBlob(new Blob([data]), 'program.cas');
    status.textContent = `Saved CAS (${data.length} bytes)`;
});

document.getElementById('saveTapeWAV')?.addEventListener('click', () => {
    const data = coco.cassette.recording
        ? new Uint8Array(coco.cassette.recordBuffer)
        : (coco.cassette.recordBuffer.length > 0
            ? new Uint8Array(coco.cassette.recordBuffer)
            : (coco.cassette.playBuffer || new Uint8Array(0)));
    if (data.length === 0) {
        status.textContent = 'No tape data to save. Click Record, then CSAVE in BASIC.';
        return;
    }
    const wav = casToWAV(data);
    downloadBlob(new Blob([wav], { type: 'audio/wav' }), 'program.wav');
    status.textContent = `Saved WAV (playable on a real CoCo!)`;
});

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// === Cartridge UI ===
document.getElementById('loadCart')?.addEventListener('click', () => {
    document.getElementById('cartFile')?.click();
});

document.getElementById('cartFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    coco.loadCartridge(data);
    coco.stop();
    coco.reset();
    coco.start();
    startTapeStatus();
    status.textContent = `Cartridge loaded: ${file.name} (${data.length} bytes) — auto-starting`;
});

document.getElementById('ejectCart')?.addEventListener('click', () => {
    coco.removeCartridge();
    coco.stop();
    coco.reset();
    coco.start();
    startTapeStatus();
    status.textContent = 'Cartridge ejected. Rebooted to BASIC.';
});

// === Sound UI ===
const soundBtn = document.getElementById('soundToggle');
soundBtn?.addEventListener('click', () => {
    if (!coco.sound.enabled) {
        coco.sound.init();
        soundBtn.textContent = '🔊';
    } else {
        if (coco.sound.audioCtx.state === 'running') {
            coco.sound.audioCtx.suspend();
            soundBtn.textContent = '🔇';
        } else {
            coco.sound.audioCtx.resume();
            soundBtn.textContent = '🔊';
        }
    }
});

// === Paste Code ===
document.getElementById('pasteCode')?.addEventListener('click', () => {
    if (coco.isTyping) {
        // Cancel current typing
        coco._typeQueue = [];
        coco.keyboard.clearAll();
        status.textContent = 'Paste cancelled.';
        return;
    }

    const text = prompt(
        'Paste code to type into the CoCo.\n\n' +
        'Each line will be typed as if you were at the keyboard.\n' +
        'Make sure the machine is at a prompt (OK or >) first.\n\n' +
        'Paste your code:'
    );

    if (!text || text.trim().length === 0) return;

    // Convert to uppercase (CoCo BASIC is uppercase)
    const upper = text.toUpperCase();

    // Confirm
    const lines = upper.split('\n').length;
    if (!confirm('Type ' + lines + ' line(s) into the CoCo?\n\nFirst line: ' + upper.split('\n')[0].slice(0, 40))) {
        return;
    }

    coco.startTyping(upper);
    status.textContent = 'Typing ' + lines + ' line(s)... click Paste Code again to cancel.';
});

// === On-screen keyboard ===
document.getElementById('kbToggle')?.addEventListener('click', () => {
    document.getElementById('keyboard-wrap')?.classList.toggle('visible');
});

// Auto-show on touch devices
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('keyboard-wrap')?.classList.add('visible');
}

let _shiftSticky = false;
const _shiftKeyEl = document.getElementById('shiftKey');
const _shiftableKeys = document.querySelectorAll('#keyboard-wrap .kb-key[data-shift]');

function _updateShiftHighlight() {
    _shiftableKeys.forEach(k => k.classList.toggle('shifted', _shiftSticky));
}

document.querySelectorAll('#keyboard-wrap .kb-key').forEach(el => {
    const key = el.dataset.key;
    const shiftKey = el.dataset.shift;
    if (!key) return;

    const press = (e) => {
        e.preventDefault();
        if (key === 'SHIFT') {
            _shiftSticky = !_shiftSticky;
            el.classList.toggle('active', _shiftSticky);
            _updateShiftHighlight();
            if (_shiftSticky) {
                coco.keyboard.keyDown({ key: 'Shift' });
            } else {
                coco.keyboard.keyUp({ key: 'Shift' });
            }
            return;
        }
        el.classList.add('active');
        const sendKey = (_shiftSticky && shiftKey) ? shiftKey : key;
        coco.keyboard.keyDown({ key: sendKey });
    };

    const release = (e) => {
        e.preventDefault();
        if (key === 'SHIFT') return;
        el.classList.remove('active');
        const sendKey = (_shiftSticky && shiftKey) ? shiftKey : key;
        coco.keyboard.keyUp({ key: sendKey });
        if (_shiftSticky) {
            _shiftSticky = false;
            if (_shiftKeyEl) _shiftKeyEl.classList.remove('active');
            _updateShiftHighlight();
            coco.keyboard.keyUp({ key: 'Shift' });
        }
    };

    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', () => {
        if (el.classList.contains('active') && key !== 'SHIFT') {
            el.classList.remove('active');
            coco.keyboard.keyUp({ key });
        }
    });
});
