/**
 * Talking Tom Audio Engine v2
 * - Raw PCM capture via ScriptProcessorNode (lossless, no encode/decode)
 * - Granular pitch shifting that changes pitch WITHOUT changing speed
 * - Voice Activity Detection (VAD) via RMS analysis
 * - Procedural sound effects
 */

class TalkingTomAudio {
    constructor() {
        this.ctx = null;
        this.micStream = null;
        this.micSource = null;
        this.analyser = null;
        this.scriptProcessor = null;
        this.muteNode = null;
        this.playbackAnalyser = null;

        this.isListening = false;
        this.isRecording = false;
        this.isPlayingBack = false;

        // VAD parameters
        this.vadThreshold = 0.025;
        this.silenceDurationTarget = 800; // ms of silence to stop recording
        this.minRecordDuration = 0.4;     // seconds — ignore noise bursts shorter
        this.silenceStartTime = 0;

        // Raw PCM recording buffer
        this.recordedSamples = [];
        this.recordStartTime = 0;
        this.sampleRate = 44100;

        // Pitch shift — 1.20x gives a noticeable cat-voice pitch-up
        // without sounding sped-up or robotic
        this.pitchRatio = 1.20;

        // Callbacks
        this.onStateChange = null;   // (state: 'idle'|'listening'|'recording'|'talking')
        this.onVolumeMeter = null;   // (level: 0..1)

        this.activePlaybackSource = null;
    }

    /* ────────────────────── Initialisation ────────────────────── */

    async init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.sampleRate = this.ctx.sampleRate;
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    async startMicrophone() {
        await this.init();
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.sampleRate
                }
            });

            this.micSource = this.ctx.createMediaStreamSource(this.micStream);

            // Analyser for VAD volume metering
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 1024;
            this.micSource.connect(this.analyser);

            // ScriptProcessor for lossless raw PCM capture
            this.scriptProcessor = this.ctx.createScriptProcessor(4096, 1, 1);
            this.micSource.connect(this.scriptProcessor);

            // Must connect scriptProcessor to destination for it to fire,
            // route through a muted gain to prevent feedback loop
            this.muteNode = this.ctx.createGain();
            this.muteNode.gain.value = 0;
            this.scriptProcessor.connect(this.muteNode);
            this.muteNode.connect(this.ctx.destination);

            this.scriptProcessor.onaudioprocess = (e) => {
                if (this.isRecording) {
                    const input = e.inputBuffer.getChannelData(0);
                    this.recordedSamples.push(new Float32Array(input));
                }
            };

            this.isListening = true;
            this._startVADLoop();
            if (this.onStateChange) this.onStateChange('listening');
            return true;
        } catch (err) {
            console.error('Microphone error:', err);
            return false;
        }
    }

    stopMicrophone() {
        this.isListening = false;
        this.isRecording = false;
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        if (this.onStateChange) this.onStateChange('idle');
    }

    setPitchRatio(v) { this.pitchRatio = parseFloat(v); }
    setVadThreshold(v) { this.vadThreshold = parseFloat(v); }

    /* ─────────────── Voice Activity Detection Loop ─────────────── */

    _startVADLoop() {
        const buf = new Float32Array(this.analyser.fftSize);

        const tick = () => {
            if (!this.isListening) return;
            if (this.isPlayingBack) {
                requestAnimationFrame(tick);
                return;
            }

            this.analyser.getFloatTimeDomainData(buf);

            // RMS volume
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);

            if (this.onVolumeMeter) this.onVolumeMeter(Math.min(1, rms * 10));

            const now = performance.now();

            if (rms > this.vadThreshold) {
                // Voice detected
                if (!this.isRecording) {
                    this.isRecording = true;
                    this.recordedSamples = [];
                    this.recordStartTime = now;
                    if (this.onStateChange) this.onStateChange('recording');
                }
                this.silenceStartTime = 0;
            } else if (this.isRecording) {
                if (this.silenceStartTime === 0) {
                    this.silenceStartTime = now;
                } else if (now - this.silenceStartTime > this.silenceDurationTarget) {
                    // End of speech
                    this.isRecording = false;
                    this.silenceStartTime = 0;
                    const durationMs = now - this.recordStartTime;
                    if (durationMs > this.minRecordDuration * 1000) {
                        this._processRecording();
                    } else {
                        if (this.onStateChange) this.onStateChange('listening');
                    }
                }
            }

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    /* ───────── Process recorded audio & repeat with pitch shift ───────── */

    _processRecording() {
        if (!this.recordedSamples.length) return;

        // Flatten all chunks into one Float32Array
        let totalLen = 0;
        for (const chunk of this.recordedSamples) totalLen += chunk.length;

        const merged = new Float32Array(totalLen);
        let off = 0;
        for (const chunk of this.recordedSamples) {
            merged.set(chunk, off);
            off += chunk.length;
        }
        this.recordedSamples = [];

        // Trim leading/trailing silence
        const trimmed = this._trimSilence(merged, 0.008);
        if (trimmed.length < this.sampleRate * this.minRecordDuration) {
            if (this.onStateChange) this.onStateChange('listening');
            return;
        }

        // Build AudioBuffer from raw samples
        const rawBuffer = this.ctx.createBuffer(1, trimmed.length, this.sampleRate);
        rawBuffer.getChannelData(0).set(trimmed);

        // Apply granular pitch shift (pitch changes, speed stays the same)
        const shifted = this._pitchShift(rawBuffer, this.pitchRatio);

        this._playBuffer(shifted);
    }

    _trimSilence(data, threshold) {
        let start = 0;
        let end = data.length - 1;
        while (start < data.length && Math.abs(data[start]) < threshold) start++;
        while (end > start && Math.abs(data[end]) < threshold) end--;
        // Include a small pad around the trimmed region
        const pad = Math.round(this.sampleRate * 0.05);
        start = Math.max(0, start - pad);
        end = Math.min(data.length - 1, end + pad);
        return data.subarray(start, end + 1);
    }

    /* ──────────────── Granular Pitch Shift (PSOLA-like) ──────────────── */
    /*  Shifts pitch by ratio R while keeping duration unchanged.          */
    /*  Each grain reads input samples at R× rate via linear interpolation */
    /*  and is overlap-added at normal rate.                                */

    _pitchShift(audioBuffer, ratio) {
        const input = audioBuffer.getChannelData(0);
        const len = input.length;
        const output = new Float32Array(len);

        const grainSize = 2048;          // ~46 ms at 44100 Hz
        const hopSize = grainSize >> 2;  // 75% overlap

        // Hann window
        const win = new Float32Array(grainSize);
        for (let i = 0; i < grainSize; i++) {
            win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / grainSize));
        }

        for (let outPos = 0; outPos + grainSize < len; outPos += hopSize) {
            for (let i = 0; i < grainSize; i++) {
                const srcFloat = outPos + i * ratio;
                const idx = Math.floor(srcFloat);
                const frac = srcFloat - idx;

                let sample = 0;
                if (idx + 1 < len) {
                    sample = input[idx] * (1 - frac) + input[idx + 1] * frac;
                } else if (idx < len) {
                    sample = input[idx];
                }

                output[outPos + i] += sample * win[i];
            }
        }

        // Normalise to prevent clipping
        let peak = 0;
        for (let i = 0; i < len; i++) {
            const a = Math.abs(output[i]);
            if (a > peak) peak = a;
        }
        if (peak > 0.01) {
            const g = 0.88 / peak;
            for (let i = 0; i < len; i++) output[i] *= g;
        }

        const buf = this.ctx.createBuffer(1, len, audioBuffer.sampleRate);
        buf.getChannelData(0).set(output);
        return buf;
    }

    /* ─────────────────── Playback ─────────────────── */

    _playBuffer(buffer) {
        this.isPlayingBack = true;
        if (this.onStateChange) this.onStateChange('talking');

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = 1.0; // Normal speed!

        this.playbackAnalyser = this.ctx.createAnalyser();
        this.playbackAnalyser.fftSize = 256;

        src.connect(this.playbackAnalyser);
        this.playbackAnalyser.connect(this.ctx.destination);

        this.activePlaybackSource = src;

        src.onended = () => {
            this.isPlayingBack = false;
            this.activePlaybackSource = null;
            if (this.isListening && this.onStateChange) this.onStateChange('listening');
            else if (this.onStateChange) this.onStateChange('idle');
        };

        src.start(0);
    }

    getPlaybackVolume() {
        if (!this.isPlayingBack || !this.playbackAnalyser) return 0;
        const data = new Uint8Array(this.playbackAnalyser.frequencyBinCount);
        this.playbackAnalyser.getByteFrequencyData(data);
        let s = 0;
        for (let i = 0; i < data.length; i++) s += data[i];
        return (s / data.length) / 255;
    }

    /* ─────────────────── Sound Effects ─────────────────── */

    async playMeow() {
        await this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(550, t);
        osc.frequency.exponentialRampToValueAtTime(950, t + 0.18);
        osc.frequency.exponentialRampToValueAtTime(450, t + 0.50);
        g.gain.setValueAtTime(0.01, t);
        g.gain.linearRampToValueAtTime(0.32, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
        osc.connect(g).connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.50);
    }

    async playGiggle() {
        await this.init();
        const t = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const s = t + i * 0.09;
            o.type = 'sine';
            o.frequency.setValueAtTime(750 + i * 50, s);
            o.frequency.exponentialRampToValueAtTime(1100, s + 0.06);
            g.gain.setValueAtTime(0.22, s);
            g.gain.exponentialRampToValueAtTime(0.01, s + 0.06);
            o.connect(g).connect(this.ctx.destination);
            o.start(s); o.stop(s + 0.07);
        }
    }

    async playSlap() {
        await this.init();
        const t = this.ctx.currentTime;

        // Impact noise
        const sz = this.ctx.sampleRate * 0.15;
        const buf = this.ctx.createBuffer(1, sz, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
        const n = this.ctx.createBufferSource(); n.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.5;
        const g1 = this.ctx.createGain(); g1.gain.setValueAtTime(0.55, t); g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        n.connect(f).connect(g1).connect(this.ctx.destination);

        // Thump
        const o = this.ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.45, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g2).connect(this.ctx.destination);

        n.start(t); o.start(t); n.stop(t + 0.15); o.stop(t + 0.15);
    }

    async playOuch() {
        await this.init();
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(400, t + 0.35);
        g.gain.setValueAtTime(0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g).connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.35);
    }

    async playPurr() {
        await this.init();
        const t = this.ctx.currentTime;
        const dur = 1.5;
        const carrier = this.ctx.createOscillator(); carrier.type = 'triangle'; carrier.frequency.value = 75;
        const mod = this.ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = 22;
        const modG = this.ctx.createGain(); modG.gain.value = 40;
        mod.connect(modG).connect(carrier.frequency);
        const mG = this.ctx.createGain();
        mG.gain.setValueAtTime(0.01, t);
        mG.gain.linearRampToValueAtTime(0.18, t + 0.2);
        mG.gain.linearRampToValueAtTime(0.001, t + dur);
        carrier.connect(mG).connect(this.ctx.destination);
        carrier.start(t); mod.start(t); carrier.stop(t + dur); mod.stop(t + dur);
    }

    async playMilkSlurp() {
        await this.init();
        const t = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            const s = t + i * 0.22;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(300 + Math.random() * 200, s);
            o.frequency.exponentialRampToValueAtTime(800 + Math.random() * 300, s + 0.10);
            g.gain.setValueAtTime(0.18, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.10);
            o.connect(g).connect(this.ctx.destination);
            o.start(s); o.stop(s + 0.11);
        }
    }

    async playFart() {
        await this.init();
        const t = this.ctx.currentTime;
        const dur = 0.65;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + dur);
        const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 25;
        const lG = this.ctx.createGain(); lG.gain.value = 35;
        lfo.connect(lG).connect(o.frequency);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
    }

    async playDizzyChimes() {
        await this.init();
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
            const s = t + i * 0.07;
            const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            const g = this.ctx.createGain(); g.gain.setValueAtTime(0.14, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
            o.connect(g).connect(this.ctx.destination);
            o.start(s); o.stop(s + 0.35);
        });
    }
}
