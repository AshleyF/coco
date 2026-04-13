// cassette.js — CoCo cassette tape emulation
// Supports loading and saving CAS files and real WAV audio files
// WAV files use the actual 1200 baud FSK encoding (playable on real hardware)

// === CoCo Tape Block Format ===
// Leader:    128 × $55
// Sync:      $3C
// Block type: $00=header, $01=data, $FF=EOF
// Length:    1 byte (0-255)
// Data:      'length' bytes
// Checksum:  1 byte (sum of type + length + data, mod 256)
// Trailer:   $55

// === Header block data (15 bytes) ===
// Filename:  8 bytes (ASCII, space-padded)
// File type: $00=BASIC, $01=data, $02=machine language
// ASCII flag: $00=binary, $FF=ASCII
// Gap flag:  $01=continuous, $FF=gaps
// Start addr: 2 bytes (ML only)
// Load addr:  2 bytes (ML only)

// === FSK Audio Encoding ===
// Bit 0: one cycle of 1200 Hz (sine wave)
// Bit 1: two cycles of 2400 Hz (sine wave)
// 1200 baud, 8 data bits, no parity, no stop bit in the stream

const SAMPLE_RATE = 44100;
const BAUD = 1200;
const FREQ_ZERO = 1200;
const FREQ_ONE = 2400;
const SAMPLES_PER_ZERO_BIT = Math.round(SAMPLE_RATE / FREQ_ZERO); // ~37
const SAMPLES_PER_ONE_BIT = Math.round(SAMPLE_RATE / FREQ_ONE);   // ~18 per cycle, ×2 = ~37

// =====================================================================
// CAS file format (raw byte blocks)
// =====================================================================

export function parseCAS(data) {
    const bytes = new Uint8Array(data);
    const blocks = [];
    let i = 0;

    while (i < bytes.length) {
        // Skip leader bytes ($55)
        while (i < bytes.length && bytes[i] === 0x55) i++;

        // Look for sync byte ($3C)
        if (i >= bytes.length || bytes[i] !== 0x3C) break;
        i++; // skip sync

        // Block type
        if (i >= bytes.length) break;
        const blockType = bytes[i++];

        // Block length
        if (i >= bytes.length) break;
        const blockLen = bytes[i++];

        // Data
        const blockData = bytes.slice(i, i + blockLen);
        i += blockLen;

        // Checksum (skip)
        if (i < bytes.length) i++;

        // Trailer ($55, optional)
        if (i < bytes.length && bytes[i] === 0x55) i++;

        blocks.push({ type: blockType, data: blockData });
    }

    return blocks;
}

export function buildCAS(blocks) {
    const parts = [];

    for (const block of blocks) {
        // Leader
        for (let i = 0; i < 128; i++) parts.push(0x55);
        // Sync
        parts.push(0x3C);
        // Block type
        parts.push(block.type);
        // Length
        parts.push(block.data.length);
        // Data
        for (const b of block.data) parts.push(b);
        // Checksum
        let sum = block.type + block.data.length;
        for (const b of block.data) sum += b;
        parts.push(sum & 0xFF);
        // Trailer
        parts.push(0x55);
    }

    return new Uint8Array(parts);
}

// Parse header block data into a readable object
export function parseHeader(blockData) {
    if (blockData.length < 15) return null;
    const name = String.fromCharCode(...blockData.slice(0, 8)).trim();
    return {
        name,
        fileType: blockData[8],    // 0=BASIC, 1=data, 2=ML
        asciiFlag: blockData[9],   // 0=binary, FF=ASCII
        gapFlag: blockData[10],
        startAddr: (blockData[11] << 8) | blockData[12],
        loadAddr: (blockData[13] << 8) | blockData[14],
    };
}

export function buildHeader(name, fileType, asciiFlag, startAddr, loadAddr) {
    const data = new Uint8Array(15);
    const padded = (name + '        ').slice(0, 8);
    for (let i = 0; i < 8; i++) data[i] = padded.charCodeAt(i);
    data[8] = fileType;
    data[9] = asciiFlag;
    data[10] = 0x01; // gap flag: continuous
    data[11] = (startAddr >> 8) & 0xFF;
    data[12] = startAddr & 0xFF;
    data[13] = (loadAddr >> 8) & 0xFF;
    data[14] = loadAddr & 0xFF;
    return data;
}

// =====================================================================
// WAV encoding — generate real audio playable on a CoCo
// =====================================================================

function encodeBit(samples, offset, bit) {
    if (bit) {
        // '1' = two cycles of 2400 Hz
        const period = SAMPLES_PER_ONE_BIT;
        for (let c = 0; c < 2; c++) {
            for (let i = 0; i < period; i++) {
                samples[offset++] = Math.sin(2 * Math.PI * i / period) * 0.9;
            }
        }
        return period * 2;
    } else {
        // '0' = one cycle of 1200 Hz
        const period = SAMPLES_PER_ZERO_BIT;
        for (let i = 0; i < period; i++) {
            samples[offset++] = Math.sin(2 * Math.PI * i / period) * 0.9;
        }
        return period;
    }
}

function encodeByte(samples, offset, byte) {
    let written = 0;
    for (let bit = 7; bit >= 0; bit--) {
        written += encodeBit(samples, offset + written, (byte >> bit) & 1);
    }
    return written;
}

export function casToWAV(casData) {
    // Estimate max samples needed (generous: ~37 samples per bit, 8 bits per byte, plus padding)
    const maxSamples = casData.length * 8 * SAMPLES_PER_ZERO_BIT + SAMPLE_RATE; // extra second
    const samples = new Float32Array(maxSamples);
    let offset = 0;

    // Encode each byte
    for (let i = 0; i < casData.length; i++) {
        offset += encodeByte(samples, offset, casData[i]);
    }

    // Convert to 16-bit PCM WAV
    return float32ToWAV(samples.subarray(0, offset), SAMPLE_RATE);
}

// =====================================================================
// WAV decoding — read audio from a real CoCo recording
// =====================================================================

export function wavToCAS(wavArrayBuffer) {
    const view = new DataView(wavArrayBuffer);

    // Parse WAV header
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    const numChannels = view.getUint16(22, true);
    const dataOffset = findDataChunk(view);
    const dataSize = view.getUint32(dataOffset + 4, true);

    // Extract samples as float32
    const samples = [];
    const bytesPerSample = bitsPerSample / 8;
    const stride = bytesPerSample * numChannels;
    let pos = dataOffset + 8;
    const end = pos + dataSize;

    while (pos < end && pos + bytesPerSample <= view.byteLength) {
        let sample;
        if (bitsPerSample === 16) {
            sample = view.getInt16(pos, true) / 32768;
        } else if (bitsPerSample === 8) {
            sample = (view.getUint8(pos) - 128) / 128;
        } else {
            sample = 0;
        }
        samples.push(sample);
        pos += stride; // skip other channels
    }

    // Detect zero crossings to decode FSK
    return decodeFSK(samples, sampleRate);
}

function findDataChunk(view) {
    let pos = 12; // skip RIFF header
    while (pos + 8 <= view.byteLength) {
        const id = String.fromCharCode(
            view.getUint8(pos), view.getUint8(pos + 1),
            view.getUint8(pos + 2), view.getUint8(pos + 3)
        );
        if (id === 'data') return pos;
        const size = view.getUint32(pos + 4, true);
        pos += 8 + size;
    }
    return 36; // fallback
}

function decodeFSK(samples, sampleRate) {
    // Detect positive-going zero crossings to measure full cycle periods
    const bytes = [];
    let lastCrossing = -1;
    const cycleLengths = [];

    for (let i = 1; i < samples.length; i++) {
        // Positive-going zero crossing
        if (samples[i - 1] <= 0 && samples[i] > 0) {
            if (lastCrossing >= 0) {
                cycleLengths.push(i - lastCrossing);
            }
            lastCrossing = i;
        }
    }

    // Full cycle of 1200 Hz ≈ sampleRate/1200 ≈ 37 samples
    // Full cycle of 2400 Hz ≈ sampleRate/2400 ≈ 18 samples
    const cycleZero = sampleRate / FREQ_ZERO;   // ~37
    const cycleOne = sampleRate / FREQ_ONE;     // ~18
    const midpoint = (cycleZero + cycleOne) / 2; // ~27

    // Decode: long cycle = 0 bit, two short cycles = 1 bit
    const bits = [];
    let ci = 0;
    while (ci < cycleLengths.length) {
        const len = cycleLengths[ci];
        if (len > midpoint) {
            // Long cycle → 0 bit
            bits.push(0);
            ci++;
        } else {
            // Short cycle → part of a 1 bit
            bits.push(1);
            ci++;
            // Skip the second short cycle
            if (ci < cycleLengths.length && cycleLengths[ci] <= midpoint) ci++;
        }
    }

    // Group bits into bytes (MSB first)
    for (let i = 0; i + 7 < bits.length; i += 8) {
        let byte = 0;
        for (let b = 0; b < 8; b++) {
            byte = (byte << 1) | bits[i + b];
        }
        bytes.push(byte);
    }

    return new Uint8Array(bytes);
}

// =====================================================================
// WAV file builder (16-bit PCM)
// =====================================================================

function float32ToWAV(samples, sampleRate) {
    const numSamples = samples.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);           // chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, 1, true);            // mono
    view.setUint32(24, sampleRate, true);   // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);            // block align
    view.setUint16(34, 16, true);           // bits per sample

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // PCM samples
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s * 32767, true);
    }

    return buffer;
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// =====================================================================
// Cassette controller — hooks into the emulator
// =====================================================================

export class Cassette {
    constructor() {
        this.playBuffer = null;  // CAS bytes to feed to the CPU
        this.playPos = 0;
        this.playBitPos = 0;
        this.recording = false;
        this.recordBuffer = [];
        this.motorOn = false;

        // FSK signal generation for ROM compatibility
        this.cpuCycles = 0;
        this.signalPhase = 0;
        this.signalHigh = false;
        this.halfPeriod = 373;
        this.cyclesInHalf = 0;
        this._currentBitQueue = [];

        // ROM intercept mode: feed bytes directly to the ROM's byte-in routine
        // This bypasses FSK timing entirely for reliable loading
        this.interceptEnabled = true;
    }

    // Load a CAS file for playback
    loadCAS(data) {
        this.playBuffer = new Uint8Array(data);
        this.playPos = 0;
        this.playBitPos = 0;
        this._expandToFSK();
    }

    // Load a WAV file for playback (decode FSK → CAS bytes)
    loadWAV(wavArrayBuffer) {
        const casData = wavToCAS(wavArrayBuffer);
        this.loadCAS(casData.buffer);
    }

    // Expand CAS bytes to a queue of FSK half-period durations
    _expandToFSK() {
        this._currentBitQueue = [];
        if (!this.playBuffer) return;
        // CPU runs at 894,886 Hz. At 1200 baud:
        // 0-bit: 1 cycle of 1200 Hz → full period = 746 cycles → half = 373
        // 1-bit: 2 cycles of 2400 Hz → full period = 373 cycles → half = 186
        // Each bit is represented by 2 half-periods (0-bit) or 4 half-periods (1-bit)
        const HALF_ZERO = 373;
        const HALF_ONE = 186;

        for (let i = 0; i < this.playBuffer.length; i++) {
            const byte = this.playBuffer[i];
            for (let b = 7; b >= 0; b--) {
                if ((byte >> b) & 1) {
                    // Bit 1: two full cycles of 2400 Hz = 4 half-periods
                    this._currentBitQueue.push(HALF_ONE, HALF_ONE, HALF_ONE, HALF_ONE);
                } else {
                    // Bit 0: one full cycle of 1200 Hz = 2 half-periods
                    this._currentBitQueue.push(HALF_ZERO, HALF_ZERO);
                }
            }
        }
        this._queuePos = 0;
        this.cyclesInHalf = 0;
        this.signalHigh = false;
        if (this._currentBitQueue.length > 0) {
            this.halfPeriod = this._currentBitQueue[0];
        }
    }

    // Advance the FSK signal by 'n' CPU cycles
    // Only advances when motor is on (BASIC turns motor on before reading)
    advanceCycles(n) {
        if (!this.motorOn) return;
        if (this._currentBitQueue.length === 0) return;
        if (this._queuePos >= this._currentBitQueue.length) return;

        this.cyclesInHalf += n;
        while (this.cyclesInHalf >= this.halfPeriod) {
            this.cyclesInHalf -= this.halfPeriod;
            this.signalHigh = !this.signalHigh;
            this._queuePos++;
            if (this._queuePos < this._currentBitQueue.length) {
                this.halfPeriod = this._currentBitQueue[this._queuePos];
            } else {
                break; // end of tape
            }
        }
    }

    // Get next byte from tape (for ROM intercept mode)
    nextByte() {
        if (!this.playBuffer || this.playPos >= this.playBuffer.length) return -1;
        return this.playBuffer[this.playPos++];
    }

    // Called by PIA1 to read cassette signal level (port A bit 0)
    readBit() {
        return this.signalHigh ? 1 : 0;
    }

    // Start recording
    startRecording() {
        this.recording = true;
        this.recordBuffer = [];
        this._lastInputLevel = 0;
        this._cyclesSinceTransition = 0;
        this._recordBits = [];
    }

    // Stop recording and return CAS data
    stopRecording() {
        this.recording = false;
        // Flush any remaining bits to bytes
        this._flushRecordBits();
        return new Uint8Array(this.recordBuffer);
    }

    // Save recording as WAV (real audio)
    stopRecordingAsWAV() {
        const casData = this.stopRecording();
        return casToWAV(casData);
    }

    // Called each CPU cycle during recording to sample the output
    recordSample(outputBit) {
        if (!this.recording) return;
        this._cyclesSinceTransition++;
        if (outputBit !== this._lastInputLevel) {
            // Transition detected — classify the half-period
            const THRESHOLD = 280; // midpoint between 186 and 373
            if (this._cyclesSinceTransition > THRESHOLD) {
                // Long half-period → part of a 0 bit
                this._recordHalf(0);
            } else {
                // Short half-period → part of a 1 bit
                this._recordHalf(1);
            }
            this._cyclesSinceTransition = 0;
            this._lastInputLevel = outputBit;
        }
    }

    _recordHalf(type) {
        if (!this._halfCount) this._halfCount = 0;
        if (!this._halfType) this._halfType = type;

        this._halfCount++;
        if (type === 0 && this._halfCount >= 2) {
            // Two long halves = one 0 bit
            this._recordBits.push(0);
            this._halfCount = 0;
        } else if (type === 1 && this._halfCount >= 4) {
            // Four short halves = one 1 bit
            this._recordBits.push(1);
            this._halfCount = 0;
        }

        // Flush bits to bytes
        if (this._recordBits.length >= 8) {
            this._flushRecordBits();
        }
    }

    _flushRecordBits() {
        while (this._recordBits && this._recordBits.length >= 8) {
            let byte = 0;
            for (let i = 0; i < 8; i++) {
                byte = (byte << 1) | this._recordBits.shift();
            }
            this.recordBuffer.push(byte);
        }
    }

    // Called by PIA1 to write cassette data bit (for recording)
    writeBit(bit) {
        if (!this.recording) return;
        if (!this._writeByte) this._writeByte = 0;
        if (!this._writeBitCount) this._writeBitCount = 0;
        this._writeByte = (this._writeByte << 1) | (bit ? 1 : 0);
        this._writeBitCount++;
        if (this._writeBitCount >= 8) {
            this.recordBuffer.push(this._writeByte & 0xFF);
            this._writeByte = 0;
            this._writeBitCount = 0;
        }
    }

    // Motor control (PIA1 CA2)
    setMotor(on) {
        if (on && !this.motorOn) {
            // Motor just turned on — rewind to start
            this._queuePos = 0;
            this.cyclesInHalf = 0;
            this.signalHigh = false;
            if (this._currentBitQueue.length > 0) {
                this.halfPeriod = this._currentBitQueue[0];
            }
        }
        this.motorOn = on;
    }

    // Get playback progress
    get progress() {
        if (!this._currentBitQueue || this._currentBitQueue.length === 0) return 0;
        return this._queuePos / this._currentBitQueue.length;
    }
}
