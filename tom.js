/**
 * Talking Tom Canvas Renderer & Interactive Animation Engine
 * Draws animated vector Tom cat with head, eye tracking, expressions,
 * mouth sync, tail physics, hitboxes, and particle effects.
 */

class TalkingTomRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Dimensions
        this.width = canvas.width;
        this.height = canvas.height;

        // Pointer target for eye tracking
        this.targetX = this.width / 2;
        this.targetY = this.height / 2;
        
        // Animation States: 'idle', 'listening', 'recording', 'talking', 'slap_left', 'slap_right', 'dizzy', 'belly_poke', 'foot_poke', 'drinking', 'farting', 'petting'
        this.state = 'idle';
        this.stateTimer = 0;

        // Audio mouth opening level (0..1)
        this.mouthOpen = 0;

        // Blink logic
        this.blinkProgress = 0; // 0 (open) to 1 (closed)
        this.nextBlinkTime = Date.now() + 2000 + Math.random() * 3000;
        this.isBlinking = false;

        // Body movement springs / sway
        this.time = 0;
        this.tailAngle = 0;
        this.headAngle = 0;
        this.headOffsetY = 0;
        this.bodyOffsetY = 0;

        // Hand positions (relative)
        this.leftHandOffset = { x: 0, y: 0 };
        this.rightHandOffset = { x: 0, y: 0 };

        // Particles (stars, hearts, fart cloud, impact bursts)
        this.particles = [];

        // Milk prop state
        this.milkProgress = 0;

        // Callback for hit detection events
        this.onHitZone = null; // (zoneName, canvasX, canvasY)

        this.initEvents();
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.width = width;
        this.height = height;
    }

    initEvents() {
        const updatePointer = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.targetX = (e.clientX - rect.left) * (this.width / rect.width);
            this.targetY = (e.clientY - rect.top) * (this.height / rect.height);
        };

        this.canvas.addEventListener('mousemove', updatePointer);
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) updatePointer(e.touches[0]);
        });

        const handleClick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
            const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
            
            const scaleX = this.width / rect.width;
            const scaleY = this.height / rect.height;
            const canvasX = x * scaleX;
            const canvasY = y * scaleY;

            const hitZone = this.checkHitZone(canvasX, canvasY);
            if (hitZone && this.onHitZone) {
                this.onHitZone(hitZone, canvasX, canvasY);
            }
        };

        this.canvas.addEventListener('click', handleClick);
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) updatePointer(e.touches[0]);
        }, { passive: true });
    }

    checkHitZone(x, y) {
        // Tom geometry center
        const cx = this.width / 2;
        const cy = this.height * 0.52;

        // Head hit zone
        const headDist = Math.hypot(x - cx, y - (cy - 120));
        if (headDist < 95) {
            if (x < cx - 25) return 'head_left';
            if (x > cx + 25) return 'head_right';
            return 'head_center';
        }

        // Belly hit zone
        const bellyDist = Math.hypot(x - cx, y - (cy + 25));
        if (bellyDist < 75) return 'belly';

        // Left foot
        const lFootDist = Math.hypot(x - (cx - 60), y - (cy + 180));
        if (lFootDist < 45) return 'left_foot';

        // Right foot
        const rFootDist = Math.hypot(x - (cx + 60), y - (cy + 180));
        if (rFootDist < 45) return 'right_foot';

        // Tail
        const tailDist = Math.hypot(x - (cx + 120), y - (cy + 80));
        if (tailDist < 50) return 'tail';

        return null;
    }

    setState(newState, duration = 0, hitX = null, hitY = null) {
        this.state = newState;
        this.stateTimer = duration > 0 ? performance.now() + duration : 0;

        if (newState === 'dizzy') {
            this.spawnDizzyStars();
        } else if (newState === 'petting') {
            this.spawnHearts();
        } else if (newState === 'farting') {
            this.spawnFartCloud();
        }

        if (hitX !== null && hitY !== null) {
            this.spawnImpactBurst(hitX, hitY);
        }
    }

    setMouthOpen(level) {
        this.mouthOpen = Math.min(1, Math.max(0, level));
    }

    spawnImpactBurst(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 4 + Math.random() * 4;
            this.particles.push({
                type: 'impact',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 6 + Math.random() * 6,
                life: 1.0
            });
        }
    }

    spawnDizzyStars() {
        this.particles = [];
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                type: 'star',
                angle: (i / 5) * Math.PI * 2,
                radius: 65,
                speed: 0.08,
                life: 1.0,
                scale: 12
            });
        }
    }

    spawnHearts() {
        const cx = this.width / 2;
        const cy = this.height * 0.45;
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                type: 'heart',
                x: cx + (Math.random() * 80 - 40),
                y: cy + (Math.random() * 40 - 20),
                vy: -1.5 - Math.random() * 1.5,
                vx: (Math.random() - 0.5) * 1.2,
                life: 1.0,
                size: 14 + Math.random() * 10
            });
        }
    }

    spawnFartCloud() {
        const cx = this.width / 2 + 70;
        const cy = this.height * 0.6;
        for (let i = 0; i < 12; i++) {
            this.particles.push({
                type: 'fart',
                x: cx + (Math.random() * 30 - 15),
                y: cy + (Math.random() * 30 - 15),
                vx: 1.5 + Math.random() * 2,
                vy: (Math.random() - 0.5) * 1.5,
                radius: 18 + Math.random() * 16,
                life: 1.0
            });
        }
    }

    update() {
        this.time += 0.05;
        const now = performance.now();

        // Handle auto state timeout return to idle
        if (this.stateTimer > 0 && now > this.stateTimer) {
            this.stateTimer = 0;
            this.state = 'idle';
        }

        // Handle Blinking
        if (now > this.nextBlinkTime && !this.isBlinking) {
            this.isBlinking = true;
            this.blinkProgress = 0;
        }
        if (this.isBlinking) {
            this.blinkProgress += 0.2;
            if (this.blinkProgress >= 1) {
                this.isBlinking = false;
                this.blinkProgress = 0;
                this.nextBlinkTime = now + 2500 + Math.random() * 4000;
            }
        }

        // Tail Swaying Physics
        this.tailAngle = Math.sin(this.time * 0.8) * 0.25;

        // Head and Body Animation State Machine
        if (this.state === 'idle') {
            this.headOffsetY = Math.sin(this.time * 1.2) * 4;
            this.bodyOffsetY = Math.sin(this.time * 1.2) * 2;
            this.headAngle = Math.sin(this.time * 0.6) * 0.03;
            this.leftHandOffset = { x: 0, y: 0 };
            this.rightHandOffset = { x: 0, y: 0 };
        } else if (this.state === 'listening' || this.state === 'recording') {
            // Hand to ear gesture!
            this.headOffsetY = Math.sin(this.time * 2.5) * 3;
            this.headAngle = 0.08;
            this.rightHandOffset = { x: -35, y: -90 };
            this.leftHandOffset = { x: 0, y: 0 };
        } else if (this.state === 'talking') {
            this.headOffsetY = Math.sin(this.time * 3) * 6;
            this.headAngle = Math.sin(this.time * 2) * 0.06;
            this.leftHandOffset = { x: Math.sin(this.time * 2.5) * 10, y: -Math.cos(this.time * 2.5) * 10 };
            this.rightHandOffset = { x: -Math.sin(this.time * 2.5) * 10, y: -Math.sin(this.time * 2.5) * 10 };
        } else if (this.state === 'slap_left') {
            // Head snaps sharply right!
            this.headAngle = -0.42;
            this.headOffsetY = -15;
            this.leftHandOffset = { x: -40, y: -30 };
            this.rightHandOffset = { x: 20, y: 0 };
        } else if (this.state === 'slap_right') {
            // Head snaps sharply left!
            this.headAngle = 0.42;
            this.headOffsetY = -15;
            this.leftHandOffset = { x: -20, y: 0 };
            this.rightHandOffset = { x: 40, y: -30 };
        } else if (this.state === 'dizzy') {
            // Heavy knockdown dizzy sway
            this.headAngle = Math.sin(this.time * 10) * 0.32;
            this.headOffsetY = Math.cos(this.time * 10) * 12 + 10;
            this.bodyOffsetY = Math.sin(this.time * 8) * 8;
            this.leftHandOffset = { x: 20, y: -50 };
            this.rightHandOffset = { x: -20, y: -50 };
        } else if (this.state === 'belly_poke') {
            this.headOffsetY = Math.sin(this.time * 6) * 8;
            this.bodyOffsetY = Math.sin(this.time * 6) * 5;
            this.leftHandOffset = { x: 25, y: -30 };
            this.rightHandOffset = { x: -25, y: -30 };
        } else if (this.state === 'foot_poke') {
            this.headAngle = -0.15;
            this.headOffsetY = Math.sin(this.time * 10) * 10;
        } else if (this.state === 'drinking') {
            this.rightHandOffset = { x: -40, y: -60 };
            this.leftHandOffset = { x: 40, y: -60 };
            this.headOffsetY = Math.sin(this.time * 4) * 4;
        } else if (this.state === 'farting') {
            this.headAngle = -0.12;
            this.headOffsetY = 5;
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.type === 'star') {
                p.angle += p.speed;
            } else if (p.type === 'heart') {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02;
                if (p.life <= 0) this.particles.splice(i, 1);
            } else if (p.type === 'fart') {
                p.x += p.vx;
                p.y += p.vy;
                p.radius += 0.4;
                p.life -= 0.025;
                if (p.life <= 0) this.particles.splice(i, 1);
            } else if (p.type === 'impact') {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        const cx = this.width / 2;
        const cy = this.height * 0.52;

        this.ctx.save();
        
        // Shadow on ground
        this.drawShadow(cx, cy + 200);

        // Tail behind body
        this.drawTail(cx, cy + 60);

        // Legs and Feet
        this.drawLegs(cx, cy + 120);

        // Main Body & Belly
        this.drawBody(cx, cy + this.bodyOffsetY);

        // Arms and Hands
        this.drawArms(cx, cy + this.bodyOffsetY);

        // Head and Face
        this.drawHead(cx, cy - 110 + this.headOffsetY);

        // Special Props (Milk Bowl)
        if (this.state === 'drinking') {
            this.drawMilkBowl(cx, cy - 10);
        }

        // Render Particles (Dizzy Stars, Hearts, Fart Cloud, Impact Bursts)
        this.drawParticles(cx, cy - 110 + this.headOffsetY);

        this.ctx.restore();
    }

    drawShadow(cx, cy) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, 110, 24, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    drawTail(cx, cy) {
        this.ctx.save();
        this.ctx.translate(cx + 40, cy);
        this.ctx.rotate(this.tailAngle);

        this.ctx.lineWidth = 32;
        this.ctx.lineCap = 'round';
        this.ctx.strokeStyle = '#6e7a85';

        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.quadraticCurveTo(60, 20, 95, -40);
        this.ctx.stroke();

        // White tail tip
        this.ctx.lineWidth = 30;
        this.ctx.strokeStyle = '#f4f5f7';
        this.ctx.beginPath();
        this.ctx.moveTo(70, 0);
        this.ctx.quadraticCurveTo(85, -20, 95, -40);
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawLegs(cx, cy) {
        this.ctx.save();

        // Left Leg
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.roundRect(cx - 85, cy - 40, 50, 90, 25);
        this.ctx.fill();

        // Right Leg
        this.ctx.beginPath();
        this.ctx.roundRect(cx + 35, cy - 40, 50, 90, 25);
        this.ctx.fill();

        // Foot - Left
        const lYOffset = (this.state === 'foot_poke') ? -25 : 0;
        this.drawFoot(cx - 60, cy + 60 + lYOffset);

        // Foot - Right
        this.drawFoot(cx + 60, cy + 60);

        this.ctx.restore();
    }

    drawFoot(x, y) {
        this.ctx.save();
        // Base foot oval
        this.ctx.fillStyle = '#f4f5f7';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, 32, 20, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Pink foot pads
        this.ctx.fillStyle = '#ffb0c4';
        this.ctx.beginPath();
        this.ctx.ellipse(x, y + 2, 14, 10, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Toe pads
        for (let i = -1; i <= 1; i++) {
            this.ctx.beginPath();
            this.ctx.arc(x + i * 14, y - 10, 5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawBody(cx, cy) {
        this.ctx.save();

        // Outer Body Fur
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, 80, 110, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Light Grey / White Belly Patch
        this.ctx.fillStyle = '#e4e7eb';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + 10, 54, 80, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Belly Fur Highlights
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + 15, 38, 60, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawArms(cx, cy) {
        this.ctx.save();

        // Left Arm
        const lX = cx - 75 + this.leftHandOffset.x;
        const lY = cy - 20 + this.leftHandOffset.y;
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.ellipse(lX, lY, 22, 50, 0.3, 0, Math.PI * 2);
        this.ctx.fill();

        // Left Paw
        this.ctx.fillStyle = '#f4f5f7';
        this.ctx.beginPath();
        this.ctx.arc(lX - 8, lY + 35, 18, 0, Math.PI * 2);
        this.ctx.fill();

        // Right Arm
        const rX = cx + 75 + this.rightHandOffset.x;
        const rY = cy - 20 + this.rightHandOffset.y;
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.ellipse(rX, rY, 22, 50, -0.3, 0, Math.PI * 2);
        this.ctx.fill();

        // Right Paw
        this.ctx.fillStyle = '#f4f5f7';
        this.ctx.beginPath();
        this.ctx.arc(rX + 8, rY + 35, 18, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawHead(cx, cy) {
        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate(this.headAngle);

        // EARS
        // Left Ear
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.moveTo(-75, -50);
        this.ctx.lineTo(-115, -135);
        this.ctx.lineTo(-25, -95);
        this.ctx.closePath();
        this.ctx.fill();

        // Left Inner Ear (Pink)
        this.ctx.fillStyle = '#ffb0c4';
        this.ctx.beginPath();
        this.ctx.moveTo(-70, -60);
        this.ctx.lineTo(-105, -125);
        this.ctx.lineTo(-35, -92);
        this.ctx.closePath();
        this.ctx.fill();

        // Right Ear
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.moveTo(75, -50);
        this.ctx.lineTo(115, -135);
        this.ctx.lineTo(25, -95);
        this.ctx.closePath();
        this.ctx.fill();

        // Right Inner Ear (Pink)
        this.ctx.fillStyle = '#ffb0c4';
        this.ctx.beginPath();
        this.ctx.moveTo(70, -60);
        this.ctx.lineTo(105, -125);
        this.ctx.lineTo(35, -92);
        this.ctx.closePath();
        this.ctx.fill();

        // HEAD MAIN BASE
        this.ctx.fillStyle = '#6e7a85';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 95, 82, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Cheek Fur Fluffs
        this.ctx.beginPath();
        this.ctx.arc(-85, 20, 25, 0, Math.PI * 2);
        this.ctx.arc(85, 20, 25, 0, Math.PI * 2);
        this.ctx.fill();

        // WHITE SNOUT & MUZZLE
        this.ctx.fillStyle = '#f4f5f7';
        this.ctx.beginPath();
        this.ctx.ellipse(-24, 25, 30, 24, -0.15, 0, Math.PI * 2);
        this.ctx.ellipse(24, 25, 30, 24, 0.15, 0, Math.PI * 2);
        this.ctx.fill();

        // PINK NOSE
        this.ctx.fillStyle = '#ff7b9c';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 6);
        this.ctx.quadraticCurveTo(-14, 0, -14, 12);
        this.ctx.quadraticCurveTo(0, 24, 14, 12);
        this.ctx.quadraticCurveTo(14, 0, 0, 6);
        this.ctx.fill();

        // MOUTHS & EXPRESSIONS
        this.drawMouth(0, 25);

        // WHISKERS
        this.drawWhiskers();

        // EYES & EYEBROWS
        this.drawEyes(cx, cy);

        this.ctx.restore();
    }

    drawWhiskers() {
        this.ctx.strokeStyle = '#4a525a';
        this.ctx.lineWidth = 2.5;

        // Left Whiskers
        for (let i = -1; i <= 1; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(-45, 24 + i * 6);
            this.ctx.lineTo(-115, 14 + i * 22);
            this.ctx.stroke();
        }

        // Right Whiskers
        for (let i = -1; i <= 1; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(45, 24 + i * 6);
            this.ctx.lineTo(115, 14 + i * 22);
            this.ctx.stroke();
        }
    }

    drawEyes(headAbsoluteX, headAbsoluteY) {
        this.ctx.save();

        const eyeOffsetX = 40;
        const eyeOffsetY = -24;
        const eyeRadiusX = 26;
        const eyeRadiusY = 32;

        // Eye tracking math
        const dx = this.targetX - headAbsoluteX;
        const dy = this.targetY - headAbsoluteY;
        const dist = Math.hypot(dx, dy) || 1;
        const maxPupilOffset = 9;
        const pupilDx = (dx / dist) * Math.min(dist * 0.05, maxPupilOffset);
        const pupilDy = (dy / dist) * Math.min(dist * 0.05, maxPupilOffset);

        const eyes = [-eyeOffsetX, eyeOffsetX];

        eyes.forEach(ex => {
            // White Sclera
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.ellipse(ex, eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Vibrant Green Iris
            this.ctx.fillStyle = '#3ac65d';
            this.ctx.beginPath();
            this.ctx.ellipse(ex + pupilDx, eyeOffsetY + pupilDy, 16, 20, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Black Pupil
            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.ellipse(ex + pupilDx, eyeOffsetY + pupilDy, 9, 14, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Glint / Catchlight
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(ex + pupilDx - 5, eyeOffsetY + pupilDy - 5, 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Eyelids / Blinking / Expressions
            if (this.isBlinking || this.state === 'petting') {
                const closeAmount = this.state === 'petting' ? 0.9 : Math.sin(this.blinkProgress * Math.PI);
                this.ctx.fillStyle = '#6e7a85';
                this.ctx.beginPath();
                this.ctx.rect(ex - eyeRadiusX - 2, eyeOffsetY - eyeRadiusY - 2, eyeRadiusX * 2 + 4, (eyeRadiusY * 2 + 4) * closeAmount);
                this.ctx.fill();
            }
        });

        // Eyebrows
        this.ctx.strokeStyle = '#4a525a';
        this.ctx.lineWidth = 4.5;
        this.ctx.lineCap = 'round';

        let eyebrowAngleLeft = -0.1;
        let eyebrowAngleRight = 0.1;

        if (this.state === 'dizzy' || this.state === 'slap_left' || this.state === 'slap_right') {
            eyebrowAngleLeft = 0.35;
            eyebrowAngleRight = -0.35;
        } else if (this.state === 'belly_poke') {
            eyebrowAngleLeft = -0.25;
            eyebrowAngleRight = 0.25;
        }

        // Left Eyebrow
        this.ctx.beginPath();
        this.ctx.arc(-eyeOffsetX, eyeOffsetY - 36, 22, Math.PI + 0.3 + eyebrowAngleLeft, Math.PI * 2 - 0.3 + eyebrowAngleLeft);
        this.ctx.stroke();

        // Right Eyebrow
        this.ctx.beginPath();
        this.ctx.arc(eyeOffsetX, eyeOffsetY - 36, 22, Math.PI + 0.3 + eyebrowAngleRight, Math.PI * 2 - 0.3 + eyebrowAngleRight);
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawMouth(x, y) {
        this.ctx.save();
        this.ctx.translate(x, y);

        if (this.state === 'talking') {
            const openH = 8 + this.mouthOpen * 38;
            const openW = 20 + this.mouthOpen * 14;

            this.ctx.fillStyle = '#800f2f';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 14, openW, openH, 0, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#ff758f';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 14 + openH * 0.4, openW * 0.7, openH * 0.5, 0, 0, Math.PI);
            this.ctx.fill();

            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.roundRect(-12, 14 - openH + 2, 24, 7, 3);
            this.ctx.fill();
        } else if (this.state === 'belly_poke' || this.state === 'petting') {
            this.ctx.fillStyle = '#800f2f';
            this.ctx.beginPath();
            this.ctx.arc(0, 6, 26, 0, Math.PI);
            this.ctx.fill();

            this.ctx.fillStyle = '#ff758f';
            this.ctx.beginPath();
            this.ctx.arc(0, 18, 16, 0, Math.PI);
            this.ctx.fill();
        } else if (this.state === 'dizzy' || this.state === 'slap_left' || this.state === 'slap_right' || this.state === 'foot_poke') {
            this.ctx.fillStyle = '#800f2f';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 14, 22, 18, 0, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            this.ctx.strokeStyle = '#334155';
            this.ctx.lineWidth = 3.5;
            this.ctx.lineCap = 'round';

            this.ctx.beginPath();
            this.ctx.arc(-14, 4, 14, 0.2, Math.PI - 0.4);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(14, 4, 14, 0.4, Math.PI - 0.2);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawMilkBowl(cx, cy) {
        this.ctx.save();
        
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + 120, 65, 30, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy + 114, 55, 22, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawParticles(headX, headY) {
        this.ctx.save();

        this.particles.forEach(p => {
            if (p.type === 'star') {
                const sx = headX + Math.cos(p.angle) * p.radius;
                const sy = headY - 40 + Math.sin(p.angle) * (p.radius * 0.4);

                this.ctx.fillStyle = '#facc15';
                this.ctx.beginPath();
                this.ctx.arc(sx, sy, p.scale, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'heart') {
                this.ctx.globalAlpha = Math.max(0, p.life);
                this.ctx.fillStyle = '#ff4d6d';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'fart') {
                this.ctx.globalAlpha = Math.max(0, p.life * 0.5);
                this.ctx.fillStyle = '#84cc16';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'impact') {
                this.ctx.globalAlpha = Math.max(0, p.life);
                this.ctx.fillStyle = '#ff3366';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        this.ctx.restore();
    }
}
