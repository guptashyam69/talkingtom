/**
 * Talking Tom Game Orchestrator v2
 * Connects UI, Audio Engine, and Canvas Renderer with
 * multi-step hit reactions and smooth state transitions.
 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('tomCanvas');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const volumeBar = document.getElementById('volumeMeterBar');

    const micBtn = document.getElementById('micBtn');
    const milkBtn = document.getElementById('milkBtn');
    const fartBtn = document.getElementById('fartBtn');
    const slapBtn = document.getElementById('slapBtn');
    const petBtn = document.getElementById('petBtn');

    const settingsToggle = document.getElementById('settingsToggleBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettings = document.getElementById('closeSettingsBtn');
    const pitchSlider = document.getElementById('pitchSlider');
    const pitchVal = document.getElementById('pitchVal');
    const sensitivitySlider = document.getElementById('sensitivitySlider');
    const sensitivityVal = document.getElementById('sensitivityVal');

    const startModal = document.getElementById('startModal');
    const startBtn = document.getElementById('startAppBtn');

    // ── Instantiate Engine & Renderer ──
    const audio = new TalkingTomAudio();
    const tom = new TalkingTomRenderer(canvas);

    function fitCanvas() {
        const wrap = canvas.parentElement;
        const w = Math.min(wrap.clientWidth, 580);
        const h = Math.min(wrap.clientHeight, 640);
        tom.resize(w, h);
    }
    window.addEventListener('resize', fitCanvas);
    fitCanvas();

    // ── Audio callbacks ──
    audio.onStateChange = (state) => {
        statusPill.className = `status-pill ${state}`;
        const labels = {
            idle: 'Idle',
            listening: 'Listening…',
            recording: '● Recording',
            talking: 'Tom is talking!'
        };
        statusText.textContent = labels[state] || state;
        if (state === 'listening')  tom.setState('listening');
        if (state === 'recording')  tom.setState('recording');
        if (state === 'talking')    tom.setState('talking');
        if (state === 'idle')       tom.setState('idle');
    };

    audio.onVolumeMeter = (lvl) => {
        volumeBar.style.height = `${Math.min(100, lvl * 100)}%`;
    };

    // ── Hit zone reactions (multi-step: flinch → dizzy) ──
    tom.onHitZone = (zone, hx, hy) => {
        if (audio.isPlayingBack) return;

        switch (zone) {
            case 'head_left':
                audio.playSlap();
                tom.setState('slap_right', 400, hx, hy);
                setTimeout(() => {
                    audio.playDizzyChimes();
                    tom.setState('dizzy', 2200);
                }, 400);
                break;

            case 'head_right':
                audio.playSlap();
                tom.setState('slap_left', 400, hx, hy);
                setTimeout(() => {
                    audio.playDizzyChimes();
                    tom.setState('dizzy', 2200);
                }, 400);
                break;

            case 'head_top':
                audio.playSlap();
                tom.setState('slap_left', 300, hx, hy);
                setTimeout(() => {
                    tom.setState('slap_right', 300);
                }, 300);
                setTimeout(() => {
                    audio.playDizzyChimes();
                    tom.setState('dizzy', 2200);
                }, 600);
                break;

            case 'belly':
                audio.playGiggle();
                tom.setState('belly_poke', 2000, hx, hy);
                break;

            case 'left_foot':
            case 'right_foot':
                audio.playOuch();
                tom.setState('foot_poke', 1800, hx, hy);
                break;

            case 'tail':
                audio.playMeow();
                tom.setState('tail_pull', 1800, hx, hy);
                break;
        }
    };

    // ── Action buttons ──
    async function toggleMic() {
        if (!audio.isListening) {
            const ok = await audio.startMicrophone();
            if (ok) {
                micBtn.classList.add('active');
                micBtn.querySelector('.btn-label').textContent = 'Stop';
            } else {
                alert('Microphone access denied. Please allow in your browser settings.');
            }
        } else {
            audio.stopMicrophone();
            micBtn.classList.remove('active');
            micBtn.querySelector('.btn-label').textContent = 'Listen';
            volumeBar.style.height = '0%';
        }
    }

    micBtn.addEventListener('click', toggleMic);

    milkBtn.addEventListener('click', () => {
        if (audio.isPlayingBack) return;
        audio.playMilkSlurp();
        tom.setState('drinking', 3000);
    });

    fartBtn.addEventListener('click', () => {
        if (audio.isPlayingBack) return;
        audio.playFart();
        tom.setState('farting', 2200);
    });

    slapBtn.addEventListener('click', () => {
        if (audio.isPlayingBack) return;
        audio.playSlap();
        tom.setState('slap_left', 400, tom.cx, tom.baseY - 135);
        setTimeout(() => {
            audio.playDizzyChimes();
            tom.setState('dizzy', 2200);
        }, 400);
    });

    petBtn.addEventListener('click', () => {
        if (audio.isPlayingBack) return;
        audio.playPurr();
        tom.setState('petting', 2800);
    });

    // ── Settings panel ──
    settingsToggle.addEventListener('click', () => settingsPanel.classList.toggle('open'));
    closeSettings.addEventListener('click', () => settingsPanel.classList.remove('open'));

    pitchSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        pitchVal.textContent = `${v.toFixed(2)}x`;
        audio.setPitchRatio(v);
    });

    sensitivitySlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        sensitivityVal.textContent = v.toFixed(3);
        audio.setVadThreshold(v);
    });

    // ── Start modal ──
    startBtn.addEventListener('click', async () => {
        await audio.init();
        startModal.style.opacity = '0';
        setTimeout(() => { startModal.style.display = 'none'; }, 300);
        toggleMic();
    });

    // ── Main Game Loop ──
    function loop() {
        tom.update();

        if (audio.isPlayingBack) {
            tom.setMouthOpen(audio.getPlaybackVolume() * 1.6);
        } else {
            tom.setMouthOpen(0);
        }

        tom.draw();
        requestAnimationFrame(loop);
    }

    loop();
});
