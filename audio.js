/**
 * Talking Tom Audio Engine
 * Handles Microphone VAD (Voice Activity Detection), Pitch-Shifted Playback,
 * Real-time Audio Analysis, and Procedural Sound Effects.
 */

class TalkingTomAudio {
    constructor() {
        this.ctx = null;
        this.micStream = null;
        this.micSource = null;
        this.analyser = null;
        this.playbackAnalyser = null;
        
        this.isListening = false;
        this.isRecording = false;
        this.isPlayingBack = false;

        // VAD parameters
        this.vadThreshold = 0.035; // Sensitivity default
        this.silenceDurationTarget = 750; // ms of silence to finish recording
        this.silenceStartTime = 0;
        this.recordedChunks = [];
        this.sampleRate = 44100;
        
        // Voice pitch modifier
        this.pitchRatio = 1.18; // 1.18x speed & pitch for classic legible Tom voice

        // Callbacks
        this.onStateChange = null; // (state: 'idle'|'listening'|'recording'|'talking')
        this.onVolumeMeter = null; // (level: 0..1)
        
        this.activePlaybackSource = null;
    }

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
                    autoGainControl: true
                }
            });

            this.micSource = this.ctx.createMediaStreamSource(this.micStream);
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 512;
            this.micSource.connect(this.analyser);

            this.isListening = true;
            this.startVADLoop();
            if (this.onStateChange) this.onStateChange('listening');
            return true;
        } catch (err) {
            console.error('Microphone access denied or error:', err);
            return false;
        }
    }

    stopMicrophone() {
        this.isListening = false;
        this.isRecording = false;
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        if (this.onStateChange) this.onStateChange('idle');
    }

    setPitchRatio(val) {
        this.pitchRatio = parseFloat(val);
    }

    setVadThreshold(val) {
        this.vadThreshold = parseFloat(val);
    }

    startVADLoop() {
        const bufferLength = this.analyser.fftSize;
        const dataArray = new Float32Array(bufferLength);

        const checkAudio = () => {
            if (!this.isListening) return;

            if (this.isPlayingBack) {
                // Skip VAD while Tom is talking back
                requestAnimationFrame(checkAudio);
                return;
            }

            this.analyser.getFloatTimeDomainData(dataArray);

            // Compute RMS (Root Mean Square) volume level
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / bufferLength);

            if (this.onVolumeMeter) {
                this.onVolumeMeter(Math.min(1, rms * 8));
            }

            const now = performance.now();

            if (rms > this.vadThreshold) {
                if (!this.isRecording) {
                    // Speech started!
                    this.isRecording = true;
                    this.recordedChunks = [];
                    if (this.onStateChange) this.onStateChange('recording');
                }
                this.silenceStartTime = 0;
                // Append current frame data to recorded chunks
                this.recordedChunks.push(new Float32Array(dataArray));
            } else if (this.isRecording) {
                // User was talking, now silent
                this.recordedChunks.push(new Float32Array(dataArray));
                
                if (this.silenceStartTime === 0) {
                    this.silenceStartTime = now;
                } else if (now - this.silenceStartTime > this.silenceDurationTarget) {
                    // Silence limit reached -> process & repeat!
                    this.isRecording = false;
                    this.silenceStartTime = 0;
                    this.processAndRepeatRecordedAudio();
                }
            }

            requestAnimationFrame(checkAudio);
        };

        requestAnimationFrame(checkAudio);
    }

    async processAndRepeatRecordedAudio() {
        if (!this.recordedChunks.length) return;

        // FlattenFloat32Array chunks
        let totalSamples = 0;
        for (const chunk of this.recordedChunks) {
            totalSamples += chunk.length;
        }

        if (totalSamples < this.sampleRate * 0.3) {
            // Noise burst too short (less than 0.3 seconds), ignore
            this.recordedChunks = [];
            if (this.onStateChange) this.onStateChange('listening');
            return;
        }

        const mergedBuffer = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of this.recordedChunks) {
            mergedBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        // Create Web Audio AudioBuffer
        const audioBuffer = this.ctx.createBuffer(1, totalSamples, this.sampleRate);
        audioBuffer.getChannelData(0).set(mergedBuffer);

        // Play back with pitch shift
        this.playPitchShiftedBuffer(audioBuffer);
    }

    playPitchShiftedBuffer(buffer) {
        this.isPlayingBack = true;
        if (this.onStateChange) this.onStateChange('talking');

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = this.pitchRatio; // High-pitch Talking Tom voice effect!

        // Create playback analyser for lip sync
        this.playbackAnalyser = this.ctx.createAnalyser();
        this.playbackAnalyser.fftSize = 256;

        source.connect(this.playbackAnalyser);
        this.playbackAnalyser.connect(this.ctx.destination);

        this.activePlaybackSource = source;

        source.onended = () => {
            this.isPlayingBack = false;
            this.activePlaybackSource = null;
            if (this.isListening && this.onStateChange) {
                this.onStateChange('listening');
            } else if (this.onStateChange) {
                this.onStateChange('idle');
            }
        };

        source.start(0);
    }

    getPlaybackVolume() {
        if (!this.isPlayingBack || !this.playbackAnalyser) return 0;
        const data = new Uint8Array(this.playbackAnalyser.frequencyBinCount);
        this.playbackAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        return (sum / data.length) / 255.0; // 0..1
    }

    // ==========================================
    // PROCEDURAL SOUND EFFECTS (Web Audio API)
    // ==========================================

    async playMeow() {
        await this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        // Meow frequency sweep: ~600Hz up to 950Hz then down to 450Hz
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.18);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.45);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
    }

    async playGiggle() {
        await this.init();
        const now = this.ctx.currentTime;

        for (let i = 0; i < 4; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + i * 0.09;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + i * 40, t);
            osc.frequency.exponentialRampToValueAtTime(1100, t + 0.06);

            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);
            osc.stop(t + 0.07);
        }
    }

    async playSlap() {
        return this.playSlapLeft();
    }

    async playSlapLeft() {
        await this.init();
        const now = this.ctx.currentTime;

        // High sharp slap snap
        const bufferSize = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(800, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
        noise.stop(now + 0.12);
        this.playOuch();
    }

    async playSlapRight() {
        await this.init();
        const now = this.ctx.currentTime;

        // Deep heavy punch thump
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
        this.playOuch();
    }

    async playHeavySlap() {
        await this.playSlapLeft();
        await this.playSlapRight();
        this.playDizzyChimes();
    }

    async playOuch() {
        await this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    async playPurr() {
        await this.init();
        const now = this.ctx.currentTime;
        const duration = 1.2;

        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const masterGain = this.ctx.createGain();

        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(75, now);

        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(22, now); // 22Hz purr pulse rate

        modGain.gain.setValueAtTime(40, now);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        masterGain.gain.setValueAtTime(0.01, now);
        masterGain.gain.linearRampToValueAtTime(0.2, now + 0.2);
        masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

        carrier.connect(masterGain);
        masterGain.connect(this.ctx.destination);

        carrier.start(now);
        modulator.start(now);
        carrier.stop(now + duration);
        modulator.stop(now + duration);
    }

    async playMilkSlurp() {
        await this.init();
        const now = this.ctx.currentTime;

        // Slurp sound sequence (3 pops & liquid sound)
        for (let i = 0; i < 5; i++) {
            const popTime = now + i * 0.18;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(300 + Math.random() * 200, popTime);
            osc.frequency.exponentialRampToValueAtTime(800 + Math.random() * 300, popTime + 0.08);

            gain.gain.setValueAtTime(0.2, popTime);
            gain.gain.exponentialRampToValueAtTime(0.001, popTime + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(popTime);
            osc.stop(popTime + 0.09);
        }
    }

    async playFart() {
        await this.init();
        const now = this.ctx.currentTime;
        const duration = 0.55;

        const osc = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + duration);

        lfo.type = 'square';
        lfo.frequency.setValueAtTime(25, now);
        lfoGain.gain.setValueAtTime(35, now);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + duration);
        osc.stop(now + duration);
        gain.connect(this.ctx.destination);
    }

    async playDizzyChimes() {
        await this.init();
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];

        notes.forEach((freq, idx) => {
            const noteTime = now + idx * 0.07;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.15, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(noteTime);
            osc.stop(noteTime + 0.35);
        });
    }
}
