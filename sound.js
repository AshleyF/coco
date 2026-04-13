// sound.js — CoCo sound emulation
// Sample-accurate DAC output via ring buffer + ScriptProcessorNode.
// Only generates samples when sound is actively being produced
// (DAC value changing while sound is enabled via CB2).

export class Sound {
    constructor() {
        this.audioCtx = null;
        this.enabled = false;
        this.dacValue = 32;       // 6-bit DAC midpoint
        this.soundEnabled = false; // PIA1 CB2

        this._cycleAccum = 0;
        this._cyclesPerSample = 894886 / 44100;

        // Ring buffer (power of 2 for fast masking)
        this._ringSize = 16384;
        this._ring = new Float32Array(this._ringSize);
        this._writePos = 0;
        this._readPos = 0;

        // Track DAC activity to avoid generating silence forever
        this._producing = false;
        this._silenceSamples = 0;
    }

    init() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
            this._startPlayback();
            this.enabled = true;
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    _startPlayback() {
        const self = this;
        const node = this.audioCtx.createScriptProcessor(2048, 0, 1);
        node.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < output.length; i++) {
                if (self._readPos !== self._writePos) {
                    output[i] = self._ring[self._readPos];
                    self._readPos = (self._readPos + 1) & (self._ringSize - 1);
                } else {
                    output[i] = 0;
                }
            }
        };
        node.connect(this.audioCtx.destination);
        this._node = node;
    }

    setDAC(value) {
        const newVal = (value >> 2) & 0x3F;
        if (newVal !== this.dacValue) {
            this.dacValue = newVal;
            if (this.soundEnabled) {
                this._producing = true;
                this._silenceSamples = 0;
            }
        }
    }

    setSoundEnable(enabled) {
        this.soundEnabled = enabled;
    }

    addCycles(cycles) {
        if (!this.enabled || !this._producing) return;

        this._cycleAccum += cycles;
        if (this._cycleAccum < this._cyclesPerSample) return;

        // Convert 6-bit DAC (0-63) to audio sample
        const sample = ((this.dacValue - 32) / 32) * 0.25;

        while (this._cycleAccum >= this._cyclesPerSample) {
            this._cycleAccum -= this._cyclesPerSample;

            const nextWrite = (this._writePos + 1) & (this._ringSize - 1);
            if (nextWrite !== this._readPos) {
                this._ring[this._writePos] = sample;
                this._writePos = nextWrite;
            }

            // Auto-stop after ~50ms of constant value (no DAC changes)
            this._silenceSamples++;
            if (this._silenceSamples > 2200) { // 44100 * 0.05
                this._producing = false;
                this._cycleAccum = 0;
                return;
            }
        }
    }

    flush() {}
}
