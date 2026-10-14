import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Joystick } from '../joystick.js';
import { CoCo } from '../coco-machine.js';

for (const modifier of ['ctrlKey', 'altKey']) {
    const joy = new Joystick();
    assert.equal(joy.keyDown({ key: 'ArrowRight' }), false);
    assert.equal(joy.keyDown({ key: 'ArrowRight', [modifier]: true }), true);
    for (let i = 0; i < 40; i++) joy.update();
    assert.equal(joy.axes[0], 63);
    assert.equal(joy.axes[2], 31);
    // Modifiers can be released first; the held arrow must still release.
    assert.equal(joy.keyUp({ key: 'ArrowRight' }), true);
    for (let i = 0; i < 40; i++) joy.update();
    assert.equal(joy.axes[0], 31);
    joy.keyDown({ key: 'ArrowUp', [modifier]: true, shiftKey: true });
    joy.keyDown({ key: ' ', [modifier]: true, shiftKey: true });
    for (let i = 0; i < 40; i++) joy.update();
    assert.equal(joy.axes[3], 0);
    assert.deepEqual(joy.buttons, [false, true]);
    joy.keyUp({ key: 'ArrowUp' });
    joy.keyUp({ key: ' ' });
    assert.deepEqual(joy.buttons, [false, false]);
    joy.clearAll();
    assert.equal(joy.keyUp({ key: 'ArrowUp' }), false);
}

// Plain keys in the selected mode avoid host modifier shortcuts.
const selected = new Joystick();
selected.setKeyboardMode('right');
assert.equal(selected.keyDown({ key: 'ArrowLeft' }), true);
assert.equal(selected.keyDown({ key: ' ' }), true);
for (let i = 0; i < 40; i++) selected.update();
assert.equal(selected.axes[0], 0);
assert.deepEqual(selected.buttons, [true, false]);
selected.setKeyboardMode('left'); // Switching releases the previous held keys.
assert.deepEqual(selected.buttons, [false, false]);
selected.keyDown({ key: 'ArrowDown' });
selected.keyDown({ key: ' ' });
for (let i = 0; i < 40; i++) selected.update();
assert.equal(selected.axes[3], 63);
assert.equal(selected.axes[0], 31);
assert.deepEqual(selected.buttons, [false, true]);
selected.keyUp({ key: 'ArrowDown' });
selected.keyUp({ key: ' ' });
assert.deepEqual(selected.buttons, [false, false]);
selected.setKeyboardMode('keyboard');
assert.equal(selected.keyDown({ key: 'ArrowDown' }), false);

// Exercise the real ROM's DAC search and all four PIA axis selections.
const coco = new CoCo();
coco.mem.loadROM(readFileSync(new URL('../roms/bas13.rom', import.meta.url)), 0xa000);
coco.mem.loadROM(readFileSync(new URL('../roms/extbas11.rom', import.meta.url)), 0x8000);
coco.reset();
for (let i = 0; i < 120; i++) coco.stepFrame();
coco.joystick.update = () => {}; // Hold a calibrated position while BASIC reads it.
coco.joystick.axes = [7, 19, 43, 58];
coco.startTyping('PRINT JOYSTK(0);JOYSTK(1);JOYSTK(2);JOYSTK(3)\n');
for (let i = 0; i < 450; i++) coco.stepFrame();
assert.match(coco.readTextScreen(), /\n 7  19  43  58\s*\nOK/);
coco.pia0.dataB = 0xff;
coco.pia0.ctrlA |= 4;
coco.joystick.buttons = [true, false];
assert.equal(coco.pia0.read(0) & 3, 2);
coco.joystick.buttons = [false, true];
assert.equal(coco.pia0.read(0) & 3, 1);
console.log('Joystick modifiers, movement, release, fire, and ROM JOYSTK axis readings passed.');
