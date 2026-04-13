// joystick.js — CoCo joystick emulation
// The CoCo reads joystick position using software successive-approximation:
//   1. Write DAC value to PIA1 port A bits 2-7
//   2. Select axis via PIA0 CA2 (bit) and CB2 (select)
//   3. Read comparator result from PIA0 port A bit 7
// Axis values range 0-63 (6-bit DAC)
// Two joystick ports: right (primary) and left

export class Joystick {
    constructor() {
        // axes: [rightX, rightY, leftX, leftY] — matches JOYSTK(0)-(3) order
        this.axes = [31, 31, 31, 31];
        // buttons: [right, left] — PA0=right, PA1=left
        this.buttons = [false, false];

        this._right = { left: false, right: false, up: false, down: false };
        this._left = { left: false, right: false, up: false, down: false };
        this._rightAccel = 0;
        this._leftAccel = 0;
        this._ownedKeys = new Set();
    }

    update() {
        // Right joystick (axes 0, 1)
        const rs = Math.min(1 + Math.floor(this._rightAccel / 8), 8);
        if (this._right.left)  this.axes[0] = Math.max(0, this.axes[0] - rs);
        if (this._right.right) this.axes[0] = Math.min(63, this.axes[0] + rs);
        if (this._right.up)    this.axes[1] = Math.max(0, this.axes[1] - rs);
        if (this._right.down)  this.axes[1] = Math.min(63, this.axes[1] + rs);

        if (this._right.left || this._right.right || this._right.up || this._right.down) {
            this._rightAccel++;
        } else {
            this._rightAccel = 0;
            this.axes[0] += Math.sign(31 - this.axes[0]);
            this.axes[1] += Math.sign(31 - this.axes[1]);
        }

        // Left joystick (axes 2, 3)
        const ls = Math.min(1 + Math.floor(this._leftAccel / 8), 8);
        if (this._left.left)  this.axes[2] = Math.max(0, this.axes[2] - ls);
        if (this._left.right) this.axes[2] = Math.min(63, this.axes[2] + ls);
        if (this._left.up)    this.axes[3] = Math.max(0, this.axes[3] - ls);
        if (this._left.down)  this.axes[3] = Math.min(63, this.axes[3] + ls);

        if (this._left.left || this._left.right || this._left.up || this._left.down) {
            this._leftAccel++;
        } else {
            this._leftAccel = 0;
            this.axes[2] += Math.sign(31 - this.axes[2]);
            this.axes[3] += Math.sign(31 - this.axes[3]);
        }
    }

    // Ctrl+Arrows/Space = right joystick (primary)
    // Ctrl+Shift+Arrows/Space = left joystick
    keyDown(event) {
        if (!event.ctrlKey) return false;
        const stick = event.shiftKey ? this._left : this._right;
        const btnIdx = event.shiftKey ? 1 : 0;
        switch (event.key) {
            case 'ArrowUp':    stick.up = true;          break;
            case 'ArrowDown':  stick.down = true;        break;
            case 'ArrowLeft':  stick.left = true;        break;
            case 'ArrowRight': stick.right = true;       break;
            case ' ':          this.buttons[btnIdx] = true; break;
            default: return false;
        }
        this._ownedKeys.add(this._keyId(event));
        return true;
    }

    keyUp(event) {
        let consumed = false;
        // Check both shift variants — Shift may be released before the arrow key
        if (this._ownedKeys.has('S+' + event.key)) {
            switch (event.key) {
                case 'ArrowUp':    this._left.up = false;    break;
                case 'ArrowDown':  this._left.down = false;  break;
                case 'ArrowLeft':  this._left.left = false;  break;
                case 'ArrowRight': this._left.right = false; break;
                case ' ':          this.buttons[1] = false;   break;
            }
            this._ownedKeys.delete('S+' + event.key);
            consumed = true;
        }
        if (this._ownedKeys.has(event.key)) {
            switch (event.key) {
                case 'ArrowUp':    this._right.up = false;    break;
                case 'ArrowDown':  this._right.down = false;  break;
                case 'ArrowLeft':  this._right.left = false;  break;
                case 'ArrowRight': this._right.right = false; break;
                case ' ':          this.buttons[0] = false;    break;
            }
            this._ownedKeys.delete(event.key);
            consumed = true;
        }
        return consumed;
    }

    _keyId(event) {
        return (event.shiftKey ? 'S+' : '') + event.key;
    }

    clearAll() {
        this._right = { left: false, right: false, up: false, down: false };
        this._left = { left: false, right: false, up: false, down: false };
        this._rightAccel = 0;
        this._leftAccel = 0;
        this.buttons = [false, false];
        this._ownedKeys.clear();
    }

    // Compare joystick axis voltage with DAC value
    // axis: 0=rightX, 1=rightY, 2=leftX, 3=leftY
    compare(axis, dacValue) {
        return dacValue <= this.axes[axis & 3];
    }
}
