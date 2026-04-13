// keyboard.js — CoCo II keyboard matrix
// Maps browser key events to the 8×7 matrix scanned via PIA0
// PIA0 port B bits 0-7 select columns (active low)
// PIA0 port A bits 0-6 read rows (active low)

// Matrix layout (active low):
//        Col 0  Col 1  Col 2  Col 3  Col 4  Col 5  Col 6  Col 7
// Row 0:  @      A      B      C      D      E      F      G
// Row 1:  H      I      J      K      L      M      N      O
// Row 2:  P      Q      R      S      T      U      V      W
// Row 3:  X      Y      Z      ↑      ↓      ←      →      SPACE
// Row 4:  0      1      2      3      4      5      6      7
// Row 5:  8      9      :      ;      ,      -      .      /
// Row 6:  ENTER  CLEAR  BREAK  ?      ?      ?      ?      SHIFT

const KEY_MAP = {};

function mapKey(jsKey, row, col) {
    KEY_MAP[jsKey] = { row, col };
}

// Letters (row 0-3, columns 0-7)
'ABCDEFGH'.split('').forEach((c, i) => mapKey(c, 0, i));
'IJKLMNOP'.split('').forEach((c, i) => mapKey(c, 1, i));
'QRSTUVWX'.split('').forEach((c, i) => mapKey(c, 2, i));
// Row 3: X=col0 is in row 2, so Y Z and arrows
mapKey('Y', 3, 0); // Actually row 3 starts at X... let me redo this properly

// The actual CoCo keyboard matrix:
//        Col0   Col1   Col2   Col3   Col4   Col5   Col6   Col7
// Row 0:  @      A      B      C      D      E      F      G
// Row 1:  H      I      J      K      L      M      N      O
// Row 2:  P      Q      R      S      T      U      V      W
// Row 3:  X      Y      Z      Up     Down   Left   Right  Space
// Row 4:  0      1      2      3      4      5      6      7
// Row 5:  8      9      :      ;      ,      -      .      /
// Row 6:  Enter  Clear  Break  ---    ---    ---    ---    Shift

// Clear the auto-generated ones and redo properly
Object.keys(KEY_MAP).forEach(k => delete KEY_MAP[k]);

// Row 0
mapKey('@', 0, 0);
'ABCDEFG'.split('').forEach((c, i) => mapKey(c, 0, i + 1));

// Row 1
'HIJKLMNO'.split('').forEach((c, i) => mapKey(c, 1, i));

// Row 2
'PQRSTUVW'.split('').forEach((c, i) => mapKey(c, 2, i));

// Row 3
mapKey('X', 3, 0); mapKey('Y', 3, 1); mapKey('Z', 3, 2);
mapKey('ARROWUP', 3, 3); mapKey('ARROWDOWN', 3, 4);
mapKey('ARROWLEFT', 3, 5); mapKey('ARROWRIGHT', 3, 6);
mapKey(' ', 3, 7);

// Row 4
'01234567'.split('').forEach((c, i) => mapKey(c, 4, i));

// Row 5
mapKey('8', 5, 0); mapKey('9', 5, 1);
mapKey(':', 5, 2); mapKey(';', 5, 3);
mapKey(',', 5, 4); mapKey('-', 5, 5);
mapKey('.', 5, 6); mapKey('/', 5, 7);

// Row 6
mapKey('ENTER', 6, 0);
mapKey('CLEAR', 6, 1);  // mapped to Escape below
mapKey('BREAK', 6, 2);  // mapped to Pause/F12 below
mapKey('SHIFT', 6, 7);

// Shifted symbol mappings: browser key → { base key, needs shift }
// On the CoCo, these symbols are produced by SHIFT + another key
const SHIFT_MAP = {
    '"': '2',
    '!': '1',
    '#': '3',
    '$': '4',
    '%': '5',
    '&': '6',
    "'": '7',
    '(': '8',
    ')': '9',
    '*': ':',
    '+': ';',
    '<': ',',
    '>': '.',
    '?': '/',
    '=': '-',
    '_': ' ', // SHIFT+SPACE not standard but common mapping
};

export class Keyboard {
    constructor() {
        // 7 rows × 8 columns, each bit = 1 pressed, 0 released
        this.matrix = new Uint8Array(7);
        this._heldShifted = new Set();
    }

    // Release all keys (call on window blur)
    clearAll() {
        this.matrix.fill(0);
        this._heldShifted.clear();
    }

    // Call when browser key goes down
    keyDown(event) {
        const result = this._mapEvent(event);
        if (!result) return false;

        if (result.autoShift) {
            // Press SHIFT + base key
            this.matrix[6] |= (1 << 7); // SHIFT
            this._heldShifted.add(event.key);
        } else if (result.suppressShift) {
            // Key is directly mapped but PC required Shift — suppress CoCo SHIFT
            this.matrix[6] &= ~(1 << 7);
        }
        this.matrix[result.row] |= (1 << result.col);
        return true;
    }

    // Call when browser key goes up
    keyUp(event) {
        const result = this._mapEvent(event);
        if (!result) return false;

        this.matrix[result.row] &= ~(1 << result.col);
        if (this._heldShifted.has(event.key)) {
            this._heldShifted.delete(event.key);
            if (this._heldShifted.size === 0) {
                this.matrix[6] &= ~(1 << 7); // release SHIFT
            }
        }
        return true;
    }

    // Read the keyboard matrix for a given column selection
    // colSelect is PIA0 port B output (active low: 0 = column selected)
    readRows(colSelect) {
        let rows = 0;
        for (let col = 0; col < 8; col++) {
            if ((colSelect & (1 << col)) === 0) {
                // This column is selected (active low)
                for (let row = 0; row < 7; row++) {
                    if (this.matrix[row] & (1 << col)) {
                        rows |= (1 << row);
                    }
                }
            }
        }
        // Return active low (0 = key pressed)
        return (~rows) & 0x7F;
    }

    _mapEvent(event) {
        let key = event.key;

        // Check for shifted symbols first (CoCo needs SHIFT for these)
        if (SHIFT_MAP[key]) {
            const baseKey = SHIFT_MAP[key].toUpperCase();
            const pos = KEY_MAP[baseKey];
            if (pos) return { ...pos, autoShift: true, suppressShift: false };
        }

        // Keys that are unshifted on CoCo but shifted on PC keyboard
        // When browser sends these, the physical Shift is already held
        // so we need to suppress the CoCo SHIFT
        const UNSHIFTED_ON_COCO = ':@';
        const needsSuppressShift = UNSHIFTED_ON_COCO.includes(key);

        key = key.toUpperCase();

        // Special mappings
        if (key === 'ESCAPE') key = 'CLEAR';
        if (key === 'F12' || key === 'PAUSE') key = 'BREAK';
        if (key === 'BACKSPACE') key = 'ARROWLEFT';
        if (key === 'SHIFT' || key === 'SHIFTLEFT' || key === 'SHIFTRIGHT') key = 'SHIFT';

        const pos = KEY_MAP[key];
        if (pos) return { ...pos, autoShift: false, suppressShift: needsSuppressShift };
        return null;
    }
}
