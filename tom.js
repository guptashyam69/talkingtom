/**
 * Talking Tom Canvas Renderer v2
 * Original cartoon cat character with detailed vector rendering,
 * gradient fur, expressive eyes, multi-state animations,
 * lip-sync, hit zones, and particle effects.
 */

class TalkingTomRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // Pointer for eye tracking
        this.targetX = this.width / 2;
        this.targetY = this.height / 2;

        // State machine
        this.state = 'idle';
        this.stateTimer = 0;
        this.prevState = 'idle';

        // Mouth (0..1)
        this.mouthOpen = 0;
        this.mouthTarget = 0;

        // Blink
        this.blinkProgress = 0;
        this.nextBlinkTime = Date.now() + 2000 + Math.random() * 3000;
        this.isBlinking = false;

        // Animation accumulators
        this.time = 0;
        this.tailAngle = 0;
        this.headAngle = 0;
        this.headOffsetX = 0;
        this.headOffsetY = 0;
        this.bodyOffsetY = 0;
        this.bodySquash = 1;      // vertical squash/stretch
        this.earWiggle = 0;

        // Paw offsets
        this.leftPawOff = { x: 0, y: 0 };
        this.rightPawOff = { x: 0, y: 0 };

        // Foot lift for reactions
        this.leftFootLift = 0;
        this.rightFootLift = 0;

        // Particles
        this.particles = [];

        // Hit callback: (zone, canvasX, canvasY)
        this.onHitZone = null;

        this._initEvents();
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.width = w;
        this.height = h;
    }

    _initEvents() {
        const ptr = (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.targetX = (e.clientX - r.left) * (this.width / r.width);
            this.targetY = (e.clientY - r.top) * (this.height / r.height);
        };
        this.canvas.addEventListener('mousemove', ptr);
        this.canvas.addEventListener('touchmove', (e) => { if (e.touches[0]) ptr(e.touches[0]); }, { passive: true });

        const click = (e) => {
            const r = this.canvas.getBoundingClientRect();
            const cx = ((e.clientX ?? e.touches?.[0]?.clientX) - r.left) * (this.width / r.width);
            const cy = ((e.clientY ?? e.touches?.[0]?.clientY) - r.top) * (this.height / r.height);
            const zone = this._hitTest(cx, cy);
            if (zone && this.onHitZone) this.onHitZone(zone, cx, cy);
        };
        this.canvas.addEventListener('click', click);
        this.canvas.addEventListener('touchstart', (e) => { if (e.touches[0]) ptr(e.touches[0]); }, { passive: true });
    }

    /* ─── Coordinate helpers ─── */
    get cx() { return this.width / 2; }
    get baseY() { return this.height * 0.54; }   // body centre

    _hitTest(x, y) {
        const cx = this.cx, by = this.baseY;
        // Head
        if (Math.hypot(x - cx, y - (by - 145)) < 90) {
            if (x < cx - 20) return 'head_left';
            if (x > cx + 20) return 'head_right';
            return 'head_top';
        }
        // Belly
        if (Math.hypot(x - cx, y - (by + 10)) < 70) return 'belly';
        // Left foot
        if (Math.hypot(x - (cx - 52), y - (by + 165)) < 40) return 'left_foot';
        // Right foot
        if (Math.hypot(x - (cx + 52), y - (by + 165)) < 40) return 'right_foot';
        // Tail
        if (Math.hypot(x - (cx + 115), y - (by + 50)) < 50) return 'tail';
        return null;
    }

    setState(s, dur = 0, hx = null, hy = null) {
        this.prevState = this.state;
        this.state = s;
        this.stateTimer = dur > 0 ? performance.now() + dur : 0;

        if (s === 'dizzy')      this._spawnStars();
        if (s === 'petting')    this._spawnHearts();
        if (s === 'farting')    this._spawnFartCloud();
        if (hx !== null)        this._spawnImpact(hx, hy);
    }

    setMouthOpen(v) { this.mouthTarget = Math.min(1, Math.max(0, v)); }

    /* ─── Particle spawners ─── */

    _spawnStars() {
        for (let i = 0; i < 5; i++) {
            this.particles.push({ type: 'star', angle: (i / 5) * Math.PI * 2, r: 70, spd: 0.06, life: 1, sz: 10 + Math.random() * 4 });
        }
    }

    _spawnHearts() {
        for (let i = 0; i < 7; i++) {
            this.particles.push({
                type: 'heart',
                x: this.cx + (Math.random() - 0.5) * 100,
                y: this.baseY - 60 + Math.random() * 40,
                vx: (Math.random() - 0.5) * 1.2,
                vy: -1.8 - Math.random() * 1.5,
                life: 1, sz: 12 + Math.random() * 10
            });
        }
    }

    _spawnFartCloud() {
        const ox = this.cx + 80, oy = this.baseY + 80;
        for (let i = 0; i < 14; i++) {
            this.particles.push({
                type: 'fart',
                x: ox + (Math.random() - 0.5) * 30,
                y: oy + (Math.random() - 0.5) * 20,
                vx: 1.8 + Math.random() * 2,
                vy: (Math.random() - 0.5) * 1.8,
                r: 16 + Math.random() * 18,
                life: 1
            });
        }
    }

    _spawnImpact(x, y) {
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const sp = 3 + Math.random() * 5;
            this.particles.push({
                type: 'impact',
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                r: 4 + Math.random() * 5,
                life: 1
            });
        }
    }

    /* ═══════════════════ UPDATE ═══════════════════ */

    update() {
        this.time += 0.045;
        const now = performance.now();

        // Auto-return to idle
        if (this.stateTimer > 0 && now > this.stateTimer) {
            this.stateTimer = 0;
            this.state = 'idle';
        }

        // Smooth mouth
        this.mouthOpen += (this.mouthTarget - this.mouthOpen) * 0.3;

        // Blink
        if (!this.isBlinking && now > this.nextBlinkTime) { this.isBlinking = true; this.blinkProgress = 0; }
        if (this.isBlinking) {
            this.blinkProgress += 0.18;
            if (this.blinkProgress >= 1) { this.isBlinking = false; this.blinkProgress = 0; this.nextBlinkTime = now + 2000 + Math.random() * 4000; }
        }

        // Tail
        this.tailAngle = Math.sin(this.time * 0.9) * 0.28;

        // Foot lifts decay
        this.leftFootLift *= 0.88;
        this.rightFootLift *= 0.88;

        // State-specific animation
        const t = this.time;
        switch (this.state) {
            case 'idle':
                this.headAngle = Math.sin(t * 0.5) * 0.025;
                this.headOffsetX = 0;
                this.headOffsetY = Math.sin(t * 1.1) * 3;
                this.bodyOffsetY = Math.sin(t * 1.1) * 1.5;
                this.bodySquash = 1 + Math.sin(t * 1.1) * 0.015;
                this.leftPawOff = { x: 0, y: 0 };
                this.rightPawOff = { x: 0, y: 0 };
                this.earWiggle = Math.sin(t * 0.7) * 0.04;
                break;

            case 'listening':
                this.headAngle = 0.07 + Math.sin(t * 1.8) * 0.02;
                this.headOffsetX = 8;
                this.headOffsetY = Math.sin(t * 2.2) * 2.5;
                this.bodySquash = 1;
                this.rightPawOff = { x: -30, y: -80 };
                this.leftPawOff = { x: 0, y: 0 };
                this.earWiggle = Math.sin(t * 3) * 0.1;
                break;

            case 'recording':
                this.headAngle = 0.07 + Math.sin(t * 2.5) * 0.03;
                this.headOffsetX = 8;
                this.headOffsetY = Math.sin(t * 3) * 3;
                this.bodySquash = 1;
                this.rightPawOff = { x: -32, y: -85 };
                this.leftPawOff = { x: 0, y: 0 };
                this.earWiggle = Math.sin(t * 4) * 0.14;
                break;

            case 'talking':
                this.headAngle = Math.sin(t * 2.2) * 0.06;
                this.headOffsetX = Math.sin(t * 1.8) * 4;
                this.headOffsetY = Math.sin(t * 2.8) * 5;
                this.bodyOffsetY = Math.sin(t * 2.8) * 2;
                this.bodySquash = 1 + this.mouthOpen * 0.02;
                this.leftPawOff = { x: Math.sin(t * 2.5) * 8, y: -Math.cos(t * 2.5) * 8 };
                this.rightPawOff = { x: -Math.sin(t * 2.5) * 8, y: Math.sin(t * 2.5) * 8 };
                this.earWiggle = Math.sin(t * 3) * 0.05;
                break;

            case 'slap_left':
                this.headAngle = -0.45;
                this.headOffsetX = 30;
                this.headOffsetY = -10;
                this.bodySquash = 0.96;
                this.leftPawOff = { x: -35, y: -25 };
                this.rightPawOff = { x: 15, y: 0 };
                break;

            case 'slap_right':
                this.headAngle = 0.45;
                this.headOffsetX = -30;
                this.headOffsetY = -10;
                this.bodySquash = 0.96;
                this.leftPawOff = { x: -15, y: 0 };
                this.rightPawOff = { x: 35, y: -25 };
                break;

            case 'dizzy':
                this.headAngle = Math.sin(t * 9) * 0.35;
                this.headOffsetX = Math.cos(t * 7) * 15;
                this.headOffsetY = Math.sin(t * 9) * 12 + 8;
                this.bodyOffsetY = Math.sin(t * 7) * 6;
                this.bodySquash = 1 + Math.sin(t * 10) * 0.03;
                this.leftPawOff = { x: 20, y: -45 };
                this.rightPawOff = { x: -20, y: -45 };
                this.earWiggle = Math.sin(t * 12) * 0.2;
                break;

            case 'belly_poke':
                this.headOffsetY = Math.sin(t * 7) * 10;
                this.bodyOffsetY = Math.sin(t * 7) * 6;
                this.bodySquash = 1 + Math.sin(t * 7) * 0.04;
                this.headAngle = Math.sin(t * 5) * 0.04;
                this.leftPawOff = { x: 25, y: -30 };
                this.rightPawOff = { x: -25, y: -30 };
                break;

            case 'foot_poke':
                this.headAngle = -0.12;
                this.headOffsetY = Math.sin(t * 12) * 12;
                this.bodySquash = 1;
                this.leftFootLift = 30;
                break;

            case 'drinking':
                this.headAngle = 0.12;
                this.headOffsetY = 15 + Math.sin(t * 4) * 3;
                this.bodySquash = 1;
                this.leftPawOff = { x: 35, y: -55 };
                this.rightPawOff = { x: -35, y: -55 };
                break;

            case 'farting':
                this.headAngle = -0.1;
                this.headOffsetY = 4;
                this.bodySquash = 0.97;
                this.leftPawOff = { x: 0, y: -10 };
                this.rightPawOff = { x: 0, y: -10 };
                break;

            case 'petting':
                this.headAngle = Math.sin(t * 0.8) * 0.04;
                this.headOffsetY = Math.sin(t * 1) * 2;
                this.bodySquash = 1 + Math.sin(t * 1.2) * 0.01;
                this.earWiggle = 0.12;
                break;

            case 'tail_pull':
                this.headAngle = 0.2;
                this.headOffsetX = 15;
                this.headOffsetY = -8;
                this.bodySquash = 1;
                this.tailAngle = -0.7 + Math.sin(t * 12) * 0.15;
                break;
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            switch (p.type) {
                case 'star':   p.angle += p.spd; p.life -= 0.005; break;
                case 'heart':  p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life -= 0.018; break;
                case 'fart':   p.x += p.vx; p.y += p.vy; p.r += 0.5; p.life -= 0.022; break;
                case 'impact': p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life -= 0.06; break;
            }
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    /* ═══════════════════ DRAW ═══════════════════ */

    draw() {
        const c = this.ctx;
        c.clearRect(0, 0, this.width, this.height);
        const cx = this.cx, by = this.baseY;

        c.save();

        // Ground shadow
        this._drawShadow(cx, by + 195);

        // Tail (behind body)
        this._drawTail(cx + 45, by + 50);

        // Legs
        this._drawLegs(cx, by + 105);

        // Body
        c.save();
        c.translate(cx, by + this.bodyOffsetY);
        c.scale(1, this.bodySquash);
        c.translate(-cx, -(by + this.bodyOffsetY));
        this._drawBody(cx, by + this.bodyOffsetY);
        c.restore();

        // Arms
        this._drawArms(cx, by + this.bodyOffsetY);

        // Head
        this._drawHead(cx + this.headOffsetX, by - 135 + this.headOffsetY);

        // Props
        if (this.state === 'drinking') this._drawMilkBowl(cx, by + 100);

        // Particles
        this._drawParticles(cx + this.headOffsetX, by - 135 + this.headOffsetY);

        c.restore();
    }

    /* ─── Shadow ─── */
    _drawShadow(cx, y) {
        const c = this.ctx;
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.beginPath();
        c.ellipse(cx, y, 105, 20, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    /* ─── Tail ─── */
    _drawTail(x, y) {
        const c = this.ctx;
        c.save();
        c.translate(x, y);
        c.rotate(this.tailAngle);

        // Grey shaft
        c.lineWidth = 28;
        c.lineCap = 'round';
        c.strokeStyle = '#7a8694';
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(30, 25, 70, 10, 100, -50);
        c.stroke();

        // White tip
        c.lineWidth = 24;
        c.strokeStyle = '#eef1f5';
        c.beginPath();
        c.moveTo(75, -20);
        c.bezierCurveTo(85, -35, 95, -48, 100, -50);
        c.stroke();

        c.restore();
    }

    /* ─── Legs & Feet ─── */
    _drawLegs(cx, topY) {
        const c = this.ctx;
        c.save();

        // Left leg
        const llg = c.createLinearGradient(cx - 80, topY, cx - 80, topY + 80);
        llg.addColorStop(0, '#6e7a85');
        llg.addColorStop(1, '#7a8694');
        c.fillStyle = llg;
        c.beginPath();
        c.roundRect(cx - 82, topY - 15, 48, 80, 24);
        c.fill();

        // Right leg
        const rlg = c.createLinearGradient(cx + 34, topY, cx + 34, topY + 80);
        rlg.addColorStop(0, '#6e7a85');
        rlg.addColorStop(1, '#7a8694');
        c.fillStyle = rlg;
        c.beginPath();
        c.roundRect(cx + 34, topY - 15, 48, 80, 24);
        c.fill();

        // Left foot
        this._drawFoot(cx - 58, topY + 65 - this.leftFootLift);
        // Right foot
        this._drawFoot(cx + 58, topY + 65 - this.rightFootLift);

        c.restore();
    }

    _drawFoot(x, y) {
        const c = this.ctx;
        c.save();

        // Foot oval
        c.fillStyle = '#eef1f5';
        c.beginPath();
        c.ellipse(x, y, 34, 18, 0, 0, Math.PI * 2);
        c.fill();

        // Main pad
        c.fillStyle = '#f9a8c9';
        c.beginPath();
        c.ellipse(x, y + 2, 16, 10, 0, 0, Math.PI * 2);
        c.fill();

        // Toe beans
        c.fillStyle = '#f9a8c9';
        for (let i = -1; i <= 1; i++) {
            c.beginPath();
            c.arc(x + i * 14, y - 8, 5.5, 0, Math.PI * 2);
            c.fill();
        }

        c.restore();
    }

    /* ─── Body ─── */
    _drawBody(cx, cy) {
        const c = this.ctx;
        c.save();

        // Fur gradient
        const bg = c.createRadialGradient(cx, cy - 20, 10, cx, cy, 120);
        bg.addColorStop(0, '#8a95a2');
        bg.addColorStop(0.5, '#727e8a');
        bg.addColorStop(1, '#5e6a76');
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(cx, cy, 82, 108, 0, 0, Math.PI * 2);
        c.fill();

        // Belly patch — lighter grey
        const wg = c.createRadialGradient(cx, cy + 8, 5, cx, cy + 15, 70);
        wg.addColorStop(0, '#ffffff');
        wg.addColorStop(0.6, '#f0f2f5');
        wg.addColorStop(1, '#d8dce2');
        c.fillStyle = wg;
        c.beginPath();
        c.ellipse(cx, cy + 12, 52, 76, 0, 0, Math.PI * 2);
        c.fill();

        c.restore();
    }

    /* ─── Arms ─── */
    _drawArms(cx, cy) {
        const c = this.ctx;
        c.save();

        // Left arm
        const lx = cx - 76 + this.leftPawOff.x;
        const ly = cy - 18 + this.leftPawOff.y;

        const lag = c.createLinearGradient(lx - 20, ly - 40, lx + 20, ly + 40);
        lag.addColorStop(0, '#7a8694');
        lag.addColorStop(1, '#6e7a85');
        c.fillStyle = lag;
        c.beginPath();
        c.ellipse(lx, ly, 20, 48, 0.3, 0, Math.PI * 2);
        c.fill();

        // Left paw
        c.fillStyle = '#eef1f5';
        c.beginPath();
        c.arc(lx - 6, ly + 38, 16, 0, Math.PI * 2);
        c.fill();
        // Paw pad
        c.fillStyle = '#f9a8c9';
        c.beginPath();
        c.ellipse(lx - 6, ly + 40, 8, 6, 0, 0, Math.PI * 2);
        c.fill();

        // Right arm
        const rx = cx + 76 + this.rightPawOff.x;
        const ry = cy - 18 + this.rightPawOff.y;

        const rag = c.createLinearGradient(rx - 20, ry - 40, rx + 20, ry + 40);
        rag.addColorStop(0, '#7a8694');
        rag.addColorStop(1, '#6e7a85');
        c.fillStyle = rag;
        c.beginPath();
        c.ellipse(rx, ry, 20, 48, -0.3, 0, Math.PI * 2);
        c.fill();

        // Right paw
        c.fillStyle = '#eef1f5';
        c.beginPath();
        c.arc(rx + 6, ry + 38, 16, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#f9a8c9';
        c.beginPath();
        c.ellipse(rx + 6, ry + 40, 8, 6, 0, 0, Math.PI * 2);
        c.fill();

        c.restore();
    }

    /* ─── Head ─── */
    _drawHead(cx, cy) {
        const c = this.ctx;
        c.save();
        c.translate(cx, cy);
        c.rotate(this.headAngle);

        // ── Ears ──
        this._drawEar(c, -1);   // left ear
        this._drawEar(c, 1);    // right ear

        // ── Head shape ──
        const hg = c.createRadialGradient(0, -5, 10, 0, 5, 100);
        hg.addColorStop(0, '#8a95a2');
        hg.addColorStop(0.6, '#727e8a');
        hg.addColorStop(1, '#5e6a76');
        c.fillStyle = hg;
        c.beginPath();
        c.ellipse(0, 0, 92, 80, 0, 0, Math.PI * 2);
        c.fill();

        // Cheek fluffs
        c.fillStyle = '#7a8694';
        c.beginPath(); c.arc(-82, 22, 22, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(82, 22, 22, 0, Math.PI * 2); c.fill();

        // ── White muzzle ──
        const mg = c.createRadialGradient(0, 30, 5, 0, 28, 45);
        mg.addColorStop(0, '#ffffff');
        mg.addColorStop(1, '#eff1f4');
        c.fillStyle = mg;
        c.beginPath();
        c.ellipse(-20, 26, 28, 22, -0.12, 0, Math.PI * 2);
        c.ellipse(20, 26, 28, 22, 0.12, 0, Math.PI * 2);
        c.fill();

        // ── Nose ──
        c.fillStyle = '#ff7093';
        c.beginPath();
        c.moveTo(0, 8);
        c.bezierCurveTo(-14, 2, -14, 18, 0, 22);
        c.bezierCurveTo(14, 18, 14, 2, 0, 8);
        c.fill();
        // Nose highlight
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.ellipse(-3, 10, 4, 3, -0.3, 0, Math.PI * 2);
        c.fill();

        // ── Mouth ──
        this._drawMouth(c, 0, 28);

        // ── Whiskers ──
        this._drawWhiskers(c);

        // ── Eyes ──
        this._drawEyes(c, cx, cy);

        c.restore();
    }

    _drawEar(c, side) {
        const sx = side;
        const ew = this.earWiggle * side;

        c.save();
        c.translate(sx * 62, -55);
        c.rotate(ew);

        // Outer ear
        c.fillStyle = '#6e7a85';
        c.beginPath();
        c.moveTo(-sx * 15, 15);
        c.lineTo(sx * 5, -85);
        c.lineTo(sx * 50, 10);
        c.closePath();
        c.fill();

        // Inner ear (pink)
        const ig = c.createLinearGradient(0, -60, 0, 10);
        ig.addColorStop(0, '#ffb8d0');
        ig.addColorStop(1, '#ff8aaf');
        c.fillStyle = ig;
        c.beginPath();
        c.moveTo(-sx * 7, 8);
        c.lineTo(sx * 8, -72);
        c.lineTo(sx * 40, 5);
        c.closePath();
        c.fill();

        c.restore();
    }

    _drawWhiskers(c) {
        c.strokeStyle = 'rgba(60,70,80,0.55)';
        c.lineWidth = 2.2;
        c.lineCap = 'round';

        for (let side = -1; side <= 1; side += 2) {
            for (let i = -1; i <= 1; i++) {
                c.beginPath();
                c.moveTo(side * 42, 26 + i * 7);
                c.lineTo(side * 118, 18 + i * 20);
                c.stroke();
            }
        }
    }

    _drawEyes(c, headAbsX, headAbsY) {
        c.save();

        const ex = 38, ey = -22;
        const erx = 24, ery = 30;

        // Eye tracking
        const dx = this.targetX - headAbsX;
        const dy = this.targetY - headAbsY;
        const dist = Math.hypot(dx, dy) || 1;
        const maxOff = 8;
        const px = (dx / dist) * Math.min(dist * 0.04, maxOff);
        const py = (dy / dist) * Math.min(dist * 0.04, maxOff);

        for (const side of [-1, 1]) {
            const x = side * ex;

            // Sclera (white)
            c.fillStyle = '#ffffff';
            c.beginPath();
            c.ellipse(x, ey, erx, ery, 0, 0, Math.PI * 2);
            c.fill();

            // Sclera shadow
            const sg = c.createLinearGradient(x, ey - ery, x, ey + ery);
            sg.addColorStop(0, 'rgba(0,0,0,0.06)');
            sg.addColorStop(0.3, 'rgba(0,0,0,0)');
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = sg;
            c.beginPath();
            c.ellipse(x, ey, erx, ery, 0, 0, Math.PI * 2);
            c.fill();

            // Iris
            const ig = c.createRadialGradient(x + px, ey + py - 3, 2, x + px, ey + py, 18);
            ig.addColorStop(0, '#42d872');
            ig.addColorStop(0.5, '#2cb85a');
            ig.addColorStop(1, '#1a8a40');
            c.fillStyle = ig;
            c.beginPath();
            c.ellipse(x + px, ey + py, 15, 18, 0, 0, Math.PI * 2);
            c.fill();

            // Pupil
            c.fillStyle = '#0d1520';
            c.beginPath();
            c.ellipse(x + px, ey + py, 8, 13, 0, 0, Math.PI * 2);
            c.fill();

            // Large highlight
            c.fillStyle = 'rgba(255,255,255,0.85)';
            c.beginPath();
            c.arc(x + px - 5, ey + py - 6, 4.5, 0, Math.PI * 2);
            c.fill();

            // Small highlight
            c.fillStyle = 'rgba(255,255,255,0.55)';
            c.beginPath();
            c.arc(x + px + 4, ey + py + 4, 2, 0, Math.PI * 2);
            c.fill();

            // Blink / eyelid
            const blinkAmt = this.state === 'petting' ? 0.88
                : this.isBlinking ? Math.sin(this.blinkProgress * Math.PI) : 0;
            if (blinkAmt > 0) {
                c.fillStyle = '#6e7a85';
                c.beginPath();
                c.ellipse(x, ey, erx + 2, (ery + 2) * blinkAmt, 0, Math.PI, Math.PI * 2);
                c.rect(x - erx - 2, ey - ery - 2, (erx + 2) * 2, (ery + 2) * blinkAmt);
                c.fill();
            }
        }

        // Eyebrows
        c.strokeStyle = '#4a535e';
        c.lineWidth = 4;
        c.lineCap = 'round';

        let lba = -0.08, rba = 0.08;
        if (this.state === 'dizzy' || this.state === 'slap_left' || this.state === 'slap_right') {
            lba = 0.35; rba = -0.35;
        } else if (this.state === 'belly_poke' || this.state === 'foot_poke') {
            lba = -0.3; rba = 0.3;
        } else if (this.state === 'petting') {
            lba = -0.15; rba = 0.15;
        }

        // Left brow
        c.beginPath();
        c.arc(-ex, ey - 35, 20, Math.PI + 0.3 + lba, Math.PI * 2 - 0.3 + lba);
        c.stroke();
        // Right brow
        c.beginPath();
        c.arc(ex, ey - 35, 20, Math.PI + 0.3 + rba, Math.PI * 2 - 0.3 + rba);
        c.stroke();

        c.restore();
    }

    _drawMouth(c, x, y) {
        c.save();
        c.translate(x, y);

        if (this.state === 'talking') {
            // Talking mouth synced to volume
            const oh = 6 + this.mouthOpen * 32;
            const ow = 18 + this.mouthOpen * 12;

            // Mouth cavity
            const cg = c.createRadialGradient(0, 12, 2, 0, 12, oh);
            cg.addColorStop(0, '#5c0020');
            cg.addColorStop(1, '#8a0e35');
            c.fillStyle = cg;
            c.beginPath();
            c.ellipse(0, 12, ow, oh, 0, 0, Math.PI * 2);
            c.fill();

            // Tongue
            c.fillStyle = '#ff758f';
            c.beginPath();
            c.ellipse(0, 12 + oh * 0.35, ow * 0.65, oh * 0.45, 0, 0, Math.PI);
            c.fill();

            // Teeth
            if (oh > 10) {
                c.fillStyle = '#fff';
                c.beginPath();
                c.roundRect(-10, 12 - oh + 1, 20, 5, 2);
                c.fill();
            }
        } else if (this.state === 'belly_poke' || this.state === 'petting') {
            // Big smile
            c.fillStyle = '#8a0e35';
            c.beginPath();
            c.arc(0, 4, 24, 0.1, Math.PI - 0.1);
            c.fill();
            c.fillStyle = '#ff758f';
            c.beginPath();
            c.arc(0, 14, 14, 0, Math.PI);
            c.fill();
        } else if (this.state === 'dizzy' || this.state === 'slap_left' || this.state === 'slap_right' || this.state === 'foot_poke') {
            // Shocked "O" mouth
            c.fillStyle = '#8a0e35';
            c.beginPath();
            c.ellipse(0, 14, 16, 20, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#ff758f';
            c.beginPath();
            c.ellipse(0, 22, 10, 8, 0, 0, Math.PI);
            c.fill();
        } else if (this.state === 'farting') {
            // Cringe smile
            c.strokeStyle = '#4a535e';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(-18, 10);
            for (let i = 0; i < 6; i++) {
                c.lineTo(-18 + i * 7.2, 10 + ((i % 2) ? -4 : 4));
            }
            c.stroke();
        } else {
            // Default cat smile (two curves)
            c.strokeStyle = '#3a444e';
            c.lineWidth = 3;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(-12, 4, 12, 0.2, Math.PI - 0.4);
            c.stroke();
            c.beginPath();
            c.arc(12, 4, 12, 0.4, Math.PI - 0.2);
            c.stroke();
        }

        c.restore();
    }

    /* ─── Milk Bowl ─── */
    _drawMilkBowl(cx, cy) {
        const c = this.ctx;
        c.save();

        // Bowl
        const bg = c.createLinearGradient(cx - 60, cy, cx + 60, cy + 30);
        bg.addColorStop(0, '#60a5fa');
        bg.addColorStop(1, '#3b82f6');
        c.fillStyle = bg;
        c.beginPath();
        c.ellipse(cx, cy + 10, 60, 28, 0, 0, Math.PI * 2);
        c.fill();

        // Milk
        c.fillStyle = '#fff';
        c.beginPath();
        c.ellipse(cx, cy + 4, 50, 20, 0, 0, Math.PI * 2);
        c.fill();

        // Rim highlight
        c.strokeStyle = 'rgba(255,255,255,0.4)';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(cx, cy + 10, 60, 28, 0, Math.PI + 0.3, Math.PI * 2 - 0.3);
        c.stroke();

        c.restore();
    }

    /* ─── Particles ─── */
    _drawParticles(hx, hy) {
        const c = this.ctx;
        c.save();

        for (const p of this.particles) {
            c.globalAlpha = Math.max(0, p.life);

            switch (p.type) {
                case 'star': {
                    const sx = hx + Math.cos(p.angle) * p.r;
                    const sy = hy - 50 + Math.sin(p.angle) * (p.r * 0.4);
                    this._drawStarShape(c, sx, sy, p.sz);
                    break;
                }
                case 'heart': {
                    c.fillStyle = '#ff4d6d';
                    this._drawHeartShape(c, p.x, p.y, p.sz);
                    break;
                }
                case 'fart': {
                    c.globalAlpha = Math.max(0, p.life * 0.45);
                    c.fillStyle = '#84cc16';
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                    break;
                }
                case 'impact': {
                    c.fillStyle = '#fbbf24';
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                    break;
                }
            }
        }

        c.globalAlpha = 1;
        c.restore();
    }

    _drawStarShape(c, x, y, sz) {
        c.fillStyle = '#facc15';
        c.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const r = (i % 2 === 0) ? sz : sz * 0.45;
            if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.closePath();
        c.fill();

        // Star uses 10-point path for proper star shape
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5 - Math.PI / 2;
            const r = (i % 2 === 0) ? sz : sz * 0.42;
            if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
    }

    _drawHeartShape(c, x, y, sz) {
        const s = sz / 30;
        c.beginPath();
        c.moveTo(x, y + 8 * s);
        c.bezierCurveTo(x, y + 5 * s, x - 5 * s, y, x - 10 * s, y);
        c.bezierCurveTo(x - 18 * s, y, x - 18 * s, y + 12 * s, x, y + 22 * s);
        c.moveTo(x, y + 8 * s);
        c.bezierCurveTo(x, y + 5 * s, x + 5 * s, y, x + 10 * s, y);
        c.bezierCurveTo(x + 18 * s, y, x + 18 * s, y + 12 * s, x, y + 22 * s);
        c.fill();
    }
}
