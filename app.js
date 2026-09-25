/**
 * Talking Tom Application Orchestrator
 * Connects UI elements, Audio Engine, Canvas Renderer, and user interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('tomCanvas');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const volumeMeterBar = document.getElementById('volumeMeterBar');
    
    // Action Buttons
    const micBtn = document.getElementById('micBtn');
    const milkBtn = document.getElementById('milkBtn');
    const fartBtn = document.getElementById('fartBtn');
    const slapBtn = document.getElementById('slapBtn');
    const petBtn = document.getElementById('petBtn');

    // Settings Panel
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const pitchSlider = document.getElementById('pitchSlider');
    const pitchVal = document.getElementById('pitchVal');
    const sensitivitySlider = document.getElementById('sensitivitySlider');
    const sensitivityVal = document.getElementById('sensitivityVal');

    // Modal
    const startModal = document.getElementById('startModal');
    const startAppBtn = document.getElementById('startAppBtn');

    // Initialize Audio Engine & Renderer
    const audio = new TalkingTomAudio();
    const tom = new TalkingTomRenderer(canvas);

    // Auto-fit canvas on window resize
    function resizeCanvas() {
        const wrapper = canvas.parentElement;
        const width = Math.min(wrapper.clientWidth, 600);
        const height = Math.min(wrapper.clientHeight, 650);
        tom.resize(width, height);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ==========================================
    // AUDIO ENGINE CALLBACKS
    // ==========================================

    audio.onStateChange = (state) => {
        statusPill.className = `status-pill ${state}`;
        if (state === 'idle') {
            statusText.textContent = 'Idle';
            tom.setState('idle');
        } else if (state === 'listening') {
            statusText.textContent = 'Listening... Speak now!';
            tom.setState('listening');
        } else if (state === 'recording') {
            statusText.textContent = 'Recording Voice...';
            tom.setState('recording');
        } else if (state === 'talking') {
            statusText.textContent = 'Tom is Repeating!';
            tom.setState('talking');
        }
    };

    audio.onVolumeMeter = (level) => {
        volumeMeterBar.style.height = `${Math.min(100, level * 100)}%`;
    };

    // ==========================================
    // INTERACTIVE TOUCH / CLICK HIT ZONES
    // ==========================================

    tom.onHitZone = (zone) => {
        if (audio.isPlayingBack) return; // Don't interrupt while Tom is talking

        if (zone === 'head') {
            audio.playSlap();
            audio.playDizzyChimes();
            tom.setState('dizzy', 2500);
        } else if (zone === 'belly') {
            audio.playGiggle();
            tom.setState('belly_poke', 1800);
        } else if (zone === 'left_foot' || zone === 'right_foot') {
            audio.playOuch();
            tom.setState('foot_poke', 1800);
        } else if (zone === 'tail') {
            audio.playMeow();
            tom.setState('dizzy', 1500);
        }
    };

    // ==========================================
    // ACTION BUTTON HANDLERS
    // ==========================================

    async function toggleMicrophone() {
        if (!audio.isListening) {
            const success = await audio.startMicrophone();
            if (success) {
                micBtn.classList.add('active');
                micBtn.querySelector('.btn-label').textContent = 'Stop Mic';
            } else {
                alert('Could not access microphone. Please check browser permissions.');
            }
        } else {
            audio.stopMicrophone();
            micBtn.classList.remove('active');
            micBtn.querySelector('.btn-label').textContent = 'Listen';
        }
    }

    micBtn.addEventListener('click', toggleMicrophone);

    milkBtn.addEventListener('click', async () => {
        if (audio.isPlayingBack) return;
        audio.playMilkSlurp();
        tom.setState('drinking', 3000);
    });

    fartBtn.addEventListener('click', async () => {
        if (audio.isPlayingBack) return;
        audio.playFart();
        tom.setState('farting', 2000);
    });

    slapBtn.addEventListener('click', async () => {
        if (audio.isPlayingBack) return;
        audio.playSlap();
        audio.playDizzyChimes();
        tom.setState('dizzy', 2500);
    });

    petBtn.addEventListener('click', async () => {
        if (audio.isPlayingBack) return;
        audio.playPurr();
        tom.setState('petting', 2500);
    });

    // ==========================================
    // SETTINGS PANEL LOGIC
    // ==========================================

    settingsToggleBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('open');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('open');
    });

    pitchSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        pitchVal.textContent = `${val.toFixed(2)}x`;
        audio.setPitchRatio(val);
    });

    sensitivitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        sensitivityVal.textContent = val.toFixed(3);
        audio.setVadThreshold(val);
    });

    // ==========================================
    // START MODAL / PERMISSION PROMPT
    // ==========================================

    startAppBtn.addEventListener('click', async () => {
        await audio.init();
        startModal.style.opacity = '0';
        setTimeout(() => {
            startModal.style.display = 'none';
        }, 300);
        
        // Auto start listening
        toggleMicrophone();
    });

    // ==========================================
    // MAIN GAME LOOP (60 FPS)
    // ==========================================

    function gameLoop() {
        // Update renderer physics & particles
        tom.update();

        // Update mouth opening level when Tom repeats voice back
        if (audio.isPlayingBack) {
            const vol = audio.getPlaybackVolume();
            tom.setMouthOpen(vol);
        } else if (tom.state !== 'talking') {
            tom.setMouthOpen(0);
        }

        // Render Tom
        tom.draw();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();
});
