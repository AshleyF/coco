// Browser UI for the shared CoCo machine.
import { CoCo } from './coco-machine.js?v=joystick-input-2';
import { casToWAV } from './cassette.js';
export { CoCo };

// === UI wiring ===
const coco = new CoCo();
const status = document.getElementById('status');
const canvas = document.getElementById('screen');
if (canvas) coco.setCanvas(canvas);

// Keyboard and joystick events
// Alt/Ctrl+Arrow/Space = joystick (consumed, not sent to CoCo keyboard)
// All other keys go to CoCo keyboard
document.getElementById('joystickKeys')?.addEventListener('change', (e) => {
    coco.keyboard.clearAll();
    coco.joystick.setKeyboardMode(e.target.value);
    e.target.blur(); // Return arrows/Space to emulator input instead of the select.
});
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
        await autoLoadCartridge();
    } else {
        status.textContent = 'No ROMs found in roms/. Click Load ROM or Test ROM.';
    }
}
autoLoadROMs();

// Auto-load a cartridge specified via ?cart=<name> query string.
// <name> may be a bare name (resolved to carts/<name>.ccc) or a full path/URL.
async function autoLoadCartridge() {
    const params = new URLSearchParams(window.location.search);
    const cart = params.get('cart');
    if (!cart) return;
    const url = /[\/.]/.test(cart) ? cart : `carts/${cart}.ccc`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            status.textContent = `Cartridge not found: ${url}`;
            return;
        }
        const data = new Uint8Array(await resp.arrayBuffer());
        coco.loadCartridge(data);
        coco.stop();
        coco.reset();
        coco.start();
        startTapeStatus();
        status.textContent = `Cartridge loaded: ${url} (${data.length} bytes) — auto-starting`;
    } catch (e) {
        status.textContent = `Failed to load cartridge ${url}: ${e.message}`;
    }
}

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
