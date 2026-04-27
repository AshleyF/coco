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

// Minimum number of times the CoCo must scan a key's column before we'll
// allow that key to be released. This is the queue's whole reason for being:
// on a slow device (or under GPU pressure) the BASIC polling loop runs
// infrequently — 1 scan can be tens of ms apart — and a fast tap from the
// browser (keydown→keyup within a few ms, e.g. soft keyboard, paste,
// programmatic input) can land entirely between two scans and be missed.
// We therefore hold the key in the matrix until the machine has had at
// least one chance to read it, then release it. New presses that arrive
// while a release is pending get queued.
const MIN_SCANS_BEFORE_RELEASE = 1;
// After releasing a key we want the machine to see "no key" before we
// press the next one, otherwise rapid re-presses of the same key collapse
// into a single press from BASIC's point of view.
const MIN_SCANS_BETWEEN_PRESSES = 1;

// SHIFT lives at row 6 col 7. Three independent things can request it:
//   - the user physically holding SHIFT
//   - autoShift keys (e.g. ", #) that need SHIFT+base on the CoCo
//   - suppressShift keys (e.g. :, ;) that on PC need Shift but on CoCo do
//     NOT — they want SHIFT explicitly off
// We track each source separately and recompute the SHIFT bit from them
// instead of letting press/release toggle it directly. That way no source
// can clobber another — releasing autoShift won't drop a still-held
// physical SHIFT, etc.
const SHIFT_ROW = 6;
const SHIFT_COL = 7;
const SHIFT_BIT = 1 << SHIFT_COL;

export class Keyboard {
    constructor() {
        // 7 rows × 8 columns, each bit = 1 pressed, 0 released
        this.matrix = new Uint8Array(7);
        // Tracks every "logical" key currently asserted in the matrix so
        // we know when it's safe to release.
        // Map slot ("row,col") -> { row, col, autoShift, suppressShift,
        //                            eventKey, releasePending, scansSeen }
        // SHIFT (slot "6,7") is special — see _refreshShift().
        this._held = new Map();
        // Queued keydown events waiting for a matrix slot to be released
        // (or for the per-slot inter-press cooldown to elapse).
        this._pendingDown = [];
        // Set of physical event.key strings currently down according to
        // the browser. Used to dedupe browser auto-repeat keydown events
        // (which would otherwise pile up in _pendingDown forever).
        this._domDown = new Set();
        // Tracks which event.keys are currently autoShift'd (need SHIFT).
        this._autoShiftKeys = new Set();
        // Tracks which event.keys are currently suppressShift'd (need
        // SHIFT explicitly cleared).
        this._suppressShiftKeys = new Set();
        // Per-slot cooldown: slot -> remaining scans-with-slot-not-held
        // required before we may dispatch a queued press for that slot.
        // Lets us enforce a no-key gap on the same slot ("LL" stays two
        // distinct presses) without blocking presses on other slots.
        this._slotCooldown = new Map();
    }

    // Release all keys (call on window blur)
    clearAll() {
        this.matrix.fill(0);
        this._held.clear();
        this._pendingDown.length = 0;
        this._domDown.clear();
        this._autoShiftKeys.clear();
        this._suppressShiftKeys.clear();
        this._slotCooldown.clear();
    }

    // Call when browser key goes down
    keyDown(event) {
        // Browser auto-repeat: ignore. The key is already represented in
        // _domDown / _held; replaying would queue indefinitely and on
        // release would replay phantom presses.
        if (event.repeat) return true;
        const result = this._mapEvent(event);
        if (!result) return false;
        // Dedupe: same physical key already down? (e.g. browser dropped
        // event.repeat or two listeners fired). One physical key = one
        // logical press.
        if (event.key !== undefined) {
            if (this._domDown.has(event.key)) return true;
            this._domDown.add(event.key);
        }
        const slot = result.row + ',' + result.col;
        // Queue if the slot is busy or if it's still in its cooldown
        // window from a recent release.
        const cooling = (this._slotCooldown.get(slot) || 0) > 0;
        if (this._held.has(slot) || cooling) {
            // Cap queue depth defensively (256 is well above any legit
            // burst — this only matters if something pathological happens).
            if (this._pendingDown.length < 256) {
                this._pendingDown.push({ event, result, slot });
            }
            return true;
        }
        this._press(event, result, slot);
        return true;
    }

    // Call when browser key goes up
    keyUp(event) {
        const result = this._mapEvent(event);
        if (!result) return false;
        if (event.key !== undefined) this._domDown.delete(event.key);
        const slot = result.row + ',' + result.col;
        const entry = this._held.get(slot);
        if (entry) {
            entry.releasePending = true;
            this._maybeRelease(slot);
        }
        // Drop ALL queued presses for this physical key (covers repeats
        // and ensures a long-held key doesn't resurrect itself after
        // release). Match by event.key string when available, else slot.
        if (this._pendingDown.length > 0) {
            const matchKey = event.key;
            for (let i = this._pendingDown.length - 1; i >= 0; i--) {
                const p = this._pendingDown[i];
                if ((matchKey !== undefined && p.event.key === matchKey) ||
                    (matchKey === undefined && p.slot === slot)) {
                    this._pendingDown.splice(i, 1);
                }
            }
        }
        return true;
    }

    // Internal: assert a key in the matrix
    _press(event, result, slot) {
        if (result.autoShift) this._autoShiftKeys.add(event.key);
        if (result.suppressShift) this._suppressShiftKeys.add(event.key);
        this.matrix[result.row] |= (1 << result.col);
        this._held.set(slot, {
            row: result.row,
            col: result.col,
            autoShift: !!result.autoShift,
            suppressShift: !!result.suppressShift,
            eventKey: event.key,
            releasePending: false,
            scansSeen: 0,
        });
        this._refreshShift();
    }

    // Internal: release a slot if the machine has seen it long enough
    _maybeRelease(slot) {
        const entry = this._held.get(slot);
        if (!entry || !entry.releasePending) return;
        if (entry.scansSeen < MIN_SCANS_BEFORE_RELEASE) return;
        // Don't directly clear SHIFT bit here — _refreshShift owns it.
        if (entry.row !== SHIFT_ROW || entry.col !== SHIFT_COL) {
            this.matrix[entry.row] &= ~(1 << entry.col);
        }
        if (entry.autoShift) this._autoShiftKeys.delete(entry.eventKey);
        if (entry.suppressShift) this._suppressShiftKeys.delete(entry.eventKey);
        this._held.delete(slot);
        this._slotCooldown.set(slot, MIN_SCANS_BETWEEN_PRESSES);
        this._refreshShift();
    }

    // Recompute the SHIFT bit from all sources currently asking for it.
    // Called whenever any source changes. The rules:
    //   physical SHIFT held → ON
    //   any autoShift key held → ON
    //   any suppressShift key held → OFF (overrides autoShift/physical
    //     because suppressShift maps PC-shifted keys to non-shifted CoCo
    //     keys — e.g. ':' on PC is Shift+; but on CoCo is unshifted).
    _refreshShift() {
        const physicalHeld = this._held.has(SHIFT_ROW + ',' + SHIFT_COL);
        const wantOn = (physicalHeld || this._autoShiftKeys.size > 0) &&
                       this._suppressShiftKeys.size === 0;
        if (wantOn) this.matrix[SHIFT_ROW] |= SHIFT_BIT;
        else this.matrix[SHIFT_ROW] &= ~SHIFT_BIT;
    }

    // Internal: pop one pending press whose slot is now free and not
    // cooling down.
    _drainPending() {
        for (let i = 0; i < this._pendingDown.length; i++) {
            const p = this._pendingDown[i];
            if (this._held.has(p.slot)) continue;
            if ((this._slotCooldown.get(p.slot) || 0) > 0) continue;
            this._pendingDown.splice(i, 1);
            this._press(p.event, p.result, p.slot);
            return;
        }
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
        // Per-slot cooldown ticks FIRST, before any release this call may
        // create. That way a release in this call sets a fresh cooldown
        // that won't expire until a future scan — guaranteeing at least
        // one no-key scan on that slot between successive presses.
        if (this._slotCooldown.size > 0) {
            for (const [slot, remaining] of this._slotCooldown) {
                if (this._held.has(slot)) continue;
                const entry = this._slotEntry(slot);
                if (entry && (colSelect & (1 << entry.col)) === 0) {
                    if (remaining <= 1) this._slotCooldown.delete(slot);
                    else this._slotCooldown.set(slot, remaining - 1);
                }
            }
        }
        // Per-held: count a scan when its column is selected, attempt
        // release if requested.
        if (this._held.size > 0) {
            for (const [slot, entry] of this._held) {
                if ((colSelect & (1 << entry.col)) === 0) {
                    entry.scansSeen++;
                    if (entry.releasePending) this._maybeRelease(slot);
                }
            }
        }
        if (this._pendingDown.length > 0) this._drainPending();
        // Return active low (0 = key pressed)
        return (~rows) & 0x7F;
    }

    // Parse a "row,col" slot string back into row/col without alloc.
    _slotEntry(slot) {
        const i = slot.indexOf(',');
        if (i < 0) return null;
        return { row: +slot.slice(0, i), col: +slot.slice(i + 1) };
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
