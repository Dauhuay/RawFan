// --- GAME CONFIGURATION & STATE ---
const WORLD_SIZE = 2000;
const GRID_SIZE = 80;
const SWORD_LENGTH = 75;
const SWING_DURATION = 250; // ms
const SWING_COOLDOWN = 320; // ms
const PLAYER_SPEED = 240; // pixels per second
const BASE_ENEMY_SPEED = 90; // pixels per second
const BASE_SPAWN_INTERVAL = 1400; // ms
let canvas, ctx;
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let highScore = parseInt(localStorage.getItem('neon_blade_high_score')) || 0;
let wave = 1;
let keys = { w: false, a: false, s: false, d: false };
let mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
let lastTime = 0;
let screenShake = 0;
let damageOverlayTimer = 0;
// Game Entities
let player;
let enemies = [];
let particles = [];
let floatingTexts = [];
let scenery = [];
let nextSpawnTime = 0;
// Camera
let camera = { x: 0, y: 0, lerpSpeed: 0.1 };
// --- AUDIO SYNTHESIZER (WEB AUDIO API) ---
const Sound = {
    ctx: null,
    muted: false,
    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
        }
    },
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    toggleMute() {
        this.muted = !this.muted;
        const btnStart = document.getElementById('mute-btn-start');
        const btnFloat = document.getElementById('floating-mute-btn');
        const text = this.muted ? '🔇 音效已關閉' : '🔊 音效已開啟';
        const icon = this.muted ? '🔇' : '🔊';

        if (btnStart) btnStart.textContent = text;
        if (btnFloat) btnFloat.textContent = icon;
        return this.muted;
    },
    playSlash() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        // 1. Synthesize swoosh noise
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(1000, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        noiseFilter.Q.value = 2.0;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.25, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noiseNode.start(now);
        // 2. Blade ring tone (sawtooth + triangle blend)
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
        oscGain.gain.setValueAtTime(0.12, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    },
    playExplosion() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        // Noise rumble
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(250, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noiseNode.start(now);
        // Low pitch blast
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 150;
        oscGain.gain.setValueAtTime(0.25, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    },
    playHurt() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.2);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
    },
    playGameOver() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const notes = [293.66, 261.63, 220.00, 196.00]; // D4, C4, A3, G3
        const durations = [0.15, 0.15, 0.15, 0.45];
        const startTimes = [0, 0.15, 0.3, 0.45];
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + startTimes[i]);
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            const tStart = now + startTimes[i];
            const tDur = durations[i];
            oscGain.gain.setValueAtTime(0, tStart);
            oscGain.gain.linearRampToValueAtTime(0.18, tStart + 0.02);
            oscGain.gain.exponentialRampToValueAtTime(0.001, tStart + tDur);
            osc.connect(filter);
            filter.connect(oscGain);
            oscGain.connect(this.ctx.destination);
            osc.start(tStart);
            osc.stop(tStart + tDur);
        });
    }
};
// --- HELPER MATH FUNCTIONS ---
// Checks if an angle is between two bounds, wrapping correctly
function isAngleBetween(target, angle1, angle2) {
    const normalize = a => (a % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const t = normalize(target);
    const a = normalize(angle1);
    const b = normalize(angle2);
    if (a <= b) {
        return t >= a && t <= b;
    } else {
        return t >= a || t <= b;
    }
}
// --- GAME ENTITIES ---
// Floating Score Popups
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.alpha = 1.0;
        this.vy = -50; // moves up at 50px/sec
    }
    update(dt) {
        this.y += this.vy * dt;
        this.alpha -= 1.2 * dt;
        return this.alpha > 0;
    }
    draw(ctx) {
        ctx.save();
        ctx.font = 'bold 16px "Space Grotesk", sans-serif';
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.textAlign = 'center';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fillText(this.text, this.x - camera.x, this.y - camera.y);
        ctx.restore();
    }
}
// Particle FX
class Particle {
    constructor(x, y, color, angle, speed, isSlashSpark = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = Math.random() * (isSlashSpark ? 2 : 4) + 2;
        this.alpha = 1.0;
        this.decay = Math.random() * 1.5 + 1.2; // decay factor per second
        this.friction = 0.96;
    }
    update(dt) {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.alpha -= this.decay * dt;
        this.size = Math.max(0.1, this.size - dt * 2);
        return this.alpha > 0;
    }
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(this.x - camera.x - this.size / 2, this.y - camera.y - this.size / 2, this.size, this.size);
        ctx.restore();
    }
}
// Player Class
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.speed = PLAYER_SPEED;
        this.angle = 0; // facing direction (towards mouse)

        // HP status
        this.maxHp = 100;
        this.hp = 100;
        this.invulnTime = 0; // in seconds
        // Swings (Dual Blades)
        this.swingTime = 0; // remaining duration of active swing
        this.cooldownTime = 0; // remaining cooldown to next swing
        this.lastSlashTargets = new Set(); // to prevent double hits in same swing
        
        // Skill Flash properties
        this.skillFlashCD = 6000;
        this.lastSkillFlash = 0;
        this.dashDistance = 300;
    }
    triggerSwing() {
        if (this.cooldownTime <= 0) {
            this.swingTime = SWING_DURATION;
            this.cooldownTime = SWING_COOLDOWN;
            this.lastSlashTargets.clear();
            screenShake = Math.max(screenShake, 3); // subtle screen shake on swing
            Sound.playSlash();
            // Spawn sword swing sparks
            for (let i = 0; i < 6; i++) {
                const sparkAngle = this.angle + (Math.random() - 0.5) * 1.5;
                const sparkSpeed = Math.random() * 150 + 100;
                particles.push(new Particle(
                    this.x + Math.cos(sparkAngle) * this.radius,
                    this.y + Math.sin(sparkAngle) * this.radius,
                    '#00f2fe',
                    sparkAngle,
                    sparkSpeed,
                    true
                ));
            }
        }
    }
    
    executeSkillFlash(enemiesList) {
        const now = Date.now();
        if (now - this.lastSkillFlash < this.skillFlashCD) return;
        this.lastSkillFlash = now;

        const startPos = { x: this.x, y: this.y };
        
        // 瞬間移動主角位置
        this.x += Math.cos(this.angle) * this.dashDistance;
        this.y += Math.sin(this.angle) * this.dashDistance;

        // Clamp to WORLD bounds
        this.x = Math.max(this.radius + 15, Math.min(WORLD_SIZE - this.radius - 15, this.x));
        this.y = Math.max(this.radius + 15, Math.min(WORLD_SIZE - this.radius - 15, this.y));

        const endPos = { x: this.x, y: this.y };

        // 碰撞偵測：找出衝刺路徑上的敵人
        enemiesList.forEach(enemy => {
            if (this.isLineInteracting(startPos, endPos, enemy)) {
                if (!enemy.deathMark) {
                    enemy.deathMark = true;
                    score += 100;
                    floatingTexts.push(new FloatingText(enemy.x, enemy.y - 15, '+100', '#a8e6cf'));
                    
                    // Dynamic wave escalation
                    const newWave = Math.floor(score / 1200) + 1;
                    if (newWave > wave) {
                        wave = newWave;
                        floatingTexts.push(new FloatingText(this.x, this.y - 40, `WAVE ${wave} LOADED`, '#ffb800'));
                    }
                    updateHUD();
                }
            }
        });

        // 觸發音效與震動
        Sound.playSlash();
        screenShake = Math.max(screenShake, 15);

        // 播放芒草殘影特效 (綠色線條飛散)
        for (let i = 0; i < 30; i++) {
            const progress = Math.random();
            const px = startPos.x + (endPos.x - startPos.x) * progress;
            const py = startPos.y + (endPos.y - startPos.y) * progress;
            
            const sparkAngle = this.angle + (Math.random() - 0.5) * Math.PI * 0.8;
            const sparkSpeed = Math.random() * 200 + 100;
            
            const colors = ['#a8e6cf', '#00ff88', '#dcedc1', '#ffffff'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particles.push(new Particle(px, py, color, sparkAngle, sparkSpeed, true));
        }
    }

    isLineInteracting(start, end, enemy) {
        const px = enemy.x;
        const py = enemy.y;
        const x1 = start.x;
        const y1 = start.y;
        const x2 = end.x;
        const y2 = end.y;

        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) {
            param = dot / len_sq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy) <= enemy.size + this.radius;
    }
    takeDamage(amount) {
        if (this.invulnTime > 0) return;

        this.hp = Math.max(0, this.hp - amount);
        this.invulnTime = 1.0; // 1s invulnerability
        screenShake = 14; // heavy screen shake on hit
        damageOverlayTimer = 0.15; // flash screen edge red
        Sound.playHurt();
        // Spawn hit particles
        for (let i = 0; i < 15; i++) {
            const partAngle = Math.random() * Math.PI * 2;
            const partSpeed = Math.random() * 120 + 80;
            particles.push(new Particle(this.x, this.y, '#ff3b30', partAngle, partSpeed));
        }
        // Update health bar HUD
        updateHUD();
        if (this.hp <= 0) {
            triggerGameOver();
        }
    }
    update(dt) {
        // Handle invulnerability cooldown
        if (this.invulnTime > 0) {
            this.invulnTime -= dt;
        }
        // Update swing & swing cooldown timers
        if (this.swingTime > 0) {
            this.swingTime -= dt * 1000; // convert to ms
        }
        if (this.cooldownTime > 0) {
            this.cooldownTime -= dt * 1000;
        }
        // Handle WASD movement
        let dx = 0;
        let dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        // Clamp to WORLD bounds
        this.x = Math.max(this.radius + 15, Math.min(WORLD_SIZE - this.radius - 15, this.x));
        this.y = Math.max(this.radius + 15, Math.min(WORLD_SIZE - this.radius - 15, this.y));
        // Update Facing direction to follow mouse cursor relative to screen center
        const screenPlayerX = this.x - camera.x;
        const screenPlayerY = this.y - camera.y;
        this.angle = Math.atan2(mouse.y - screenPlayerY, mouse.x - screenPlayerX);
    }
    draw(ctx) {
        const isInvulnFlashing = this.invulnTime > 0 && Math.floor(Date.now() / 60) % 2 === 0;
        ctx.save();
        ctx.translate(this.x - camera.x, this.y - camera.y);
        // --- DRAW SWORD TRAILS (SWING ARCS) ---
        if (this.swingTime > 0) {
            const t = 1 - (this.swingTime / SWING_DURATION); // progress 0 to 1

            // Sword 1 (Cyan) sweeps clockwise
            const startA1 = this.angle - Math.PI * 0.75;
            const endA1 = this.angle + Math.PI * 0.5;
            const currAngle1 = startA1 + (endA1 - startA1) * t;

            // Sword 2 (Magenta) sweeps counter-clockwise
            const startA2 = this.angle + Math.PI * 0.75;
            const endA2 = this.angle - Math.PI * 0.5;
            const currAngle2 = startA2 + (endA2 - startA2) * t;
            // Draw glowing trails
            const tailLength = Math.PI * 0.55;
            // Clockwise trail (Cyan)
            ctx.save();
            ctx.shadowColor = '#00f2fe';
            // Core stroke
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, SWORD_LENGTH, currAngle1 - tailLength, currAngle1);
            ctx.stroke();
            // Outer glow stroke
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(0, 0, SWORD_LENGTH, currAngle1 - tailLength, currAngle1);
            ctx.stroke();
            ctx.restore();
            // Counter-clockwise trail (Magenta)
            ctx.save();
            ctx.shadowColor = '#ff007f';
            // Core stroke
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, SWORD_LENGTH, currAngle2, currAngle2 + tailLength);
            ctx.stroke();
            // Outer glow stroke
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(0, 0, SWORD_LENGTH, currAngle2, currAngle2 + tailLength);
            ctx.stroke();
            ctx.restore();
        }
        // Draw Player Body (Invulnerability effect sets alpha)
        if (!isInvulnFlashing) {
            // Layered neon outer circle (Cyan glow)
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
            ctx.fill();
            // Glowing ring outline
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
            // Solid core
            ctx.beginPath();
            ctx.arc(0, 0, this.radius - 4, 0, Math.PI * 2);
            ctx.fillStyle = '#08080f';
            ctx.fill();
            // Dynamic sword holsters / indicators when not swinging
            if (this.swingTime <= 0) {
                ctx.rotate(this.angle);

                // Draw 2 sword hilts pointing back diagonally
                ctx.fillStyle = '#00f2fe';
                ctx.fillRect(-15, -12, 10, 3);
                ctx.fillStyle = '#ff007f';
                ctx.fillRect(-15, 9, 10, 3);
            } else {
                // Direction facing indicator dot
                ctx.rotate(this.angle);
                ctx.beginPath();
                ctx.arc(this.radius - 2, 0, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
// Enemy (Red Square Monster) Class
class Enemy {
    constructor(x, y, speedMult = 1.0) {
        this.x = x;
        this.y = y;
        this.size = 22;
        this.speed = BASE_ENEMY_SPEED * speedMult * (Math.random() * 0.2 + 0.9);
        this.hp = 1;
        this.angle = 0;
        this.deathMark = false;
        // History tail for ghosting motion blur effect
        this.history = [];
        this.maxHistory = 3;
    }
    update(playerX, playerY, dt) {
        // Save current position to history
        this.history.push({ x: this.x, y: this.y });
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        // Calculate vector to player
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        this.angle = Math.atan2(dy, dx);
        // Move towards player
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
    }
    draw(ctx) {
        // Draw ghost trails
        ctx.save();
        this.history.forEach((pos, index) => {
            const alpha = 0.08 * (index + 1);
            ctx.fillStyle = `rgba(255, 59, 48, ${alpha})`;
            ctx.fillRect(pos.x - camera.x - this.size / 2, pos.y - camera.y - this.size / 2, this.size, this.size);
        });
        // Draw main body
        ctx.translate(this.x - camera.x, this.y - camera.y);
        ctx.rotate(this.angle);
        // Neon Glow Red outline
        ctx.fillStyle = '#08080f';
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);

        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff3b30';
        ctx.shadowBlur = 8;
        ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.shadowBlur = 0; // reset
        // Draw glitched grid design inside
        ctx.fillStyle = 'rgba(255, 59, 48, 0.2)';
        ctx.fillRect(-this.size / 4, -this.size / 4, this.size / 2, this.size / 2);

        ctx.restore();
    }
}
// --- SPANNING LOGIC ---
function spawnEnemy() {
    if (!player) return;
    // Determine spawn angle
    const spawnAngle = Math.random() * Math.PI * 2;

    // Spawn distance: just outside the canvas diagonal range (approx 750px)
    const dist = Math.max(canvas.width, canvas.height) * 0.6 + 100;

    let spawnX = player.x + Math.cos(spawnAngle) * dist;
    let spawnY = player.y + Math.sin(spawnAngle) * dist;
    // Clamp coordinates within world bounds to ensure they exist in arena
    spawnX = Math.max(30, Math.min(WORLD_SIZE - 30, spawnX));
    spawnY = Math.max(30, Math.min(WORLD_SIZE - 30, spawnY));
    // Do not spawn too close to the player in case of viewport bounds clamping
    const distToPlayer = Math.hypot(spawnX - player.x, spawnY - player.y);
    if (distToPlayer < 200) return; // cancel this spawn cycle
    // Enemy speed multiplier scales with Wave Level
    const speedMult = 1.0 + (wave - 1) * 0.12;
    enemies.push(new Enemy(spawnX, spawnY, speedMult));
}
// --- HUD & UI UPDATES ---
function updateHUD() {
    const scoreVal = document.getElementById('score');
    if (scoreVal) {
        scoreVal.textContent = String(score).padStart(6, '0');
    }
    const hpFill = document.getElementById('health-bar-fill');
    if (hpFill) {
        const hpPercent = Math.max(0, (player.hp / player.maxHp) * 100);
        hpFill.style.width = `${hpPercent}%`;

        // Dynamic hp coloring
        if (hpPercent < 30) {
            hpFill.style.background = 'linear-gradient(90deg, #ff003c, #ff3b30)';
            hpFill.style.boxShadow = '0 0 16px rgba(255, 0, 60, 0.9)';
        } else {
            hpFill.style.background = 'linear-gradient(90deg, #ff0055, #ff3b30)';
            hpFill.style.boxShadow = '0 0 12px rgba(255, 0, 85, 0.8)';
        }
    }
    const waveVal = document.getElementById('wave-level');
    if (waveVal) {
        waveVal.textContent = wave;
    }
}
function generateScenery() {
    scenery = [];
    for (let i = 0; i < 150; i++) {
        scenery.push({
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            size: Math.random() * 20 + 8,
            type: Math.random() > 0.5 ? 'cross' : 'square',
            opacity: Math.random() * 0.15 + 0.05
        });
    }
}

// --- SYSTEM GAME LOOPS ---
function initGame() {
    Sound.init();
    Sound.resume();
    // Reset scores & level parameters
    score = 0;
    wave = 1;
    updateHUD();
    // Spawn player in center of world
    player = new Player(WORLD_SIZE / 2, WORLD_SIZE / 2);
    enemies = [];
    particles = [];
    floatingTexts = [];
    generateScenery();
    screenShake = 0;
    damageOverlayTimer = 0;
    // Reset keyboard keys
    keys = { w: false, a: false, s: false, d: false };
    // Reset spawn timers
    nextSpawnTime = Date.now() + 1000;
    // Set camera immediately on player
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
    gameState = 'PLAYING';
    lastTime = performance.now();
    // Start rendering frame loop
    requestAnimationFrame(gameLoop);
}
function triggerGameOver() {
    gameState = 'GAMEOVER';
    Sound.playGameOver();
    // Check high score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neon_blade_high_score', highScore);
    }
    // Toggle screen visibilities
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('floating-mute-btn').classList.add('hidden');

    document.getElementById('final-score').textContent = score;
    document.getElementById('high-score').textContent = highScore;
    document.getElementById('game-over-screen').classList.remove('hidden');
}
function update(dt) {
    if (gameState !== 'PLAYING') return;
    // 1. Update player
    player.update(dt);
    // 2. Camera Lerping to center player with screen shake offset
    let targetCamX = player.x - canvas.width / 2;
    let targetCamY = player.y - canvas.height / 2;

    // Clamp camera to keep arena inside viewport if possible (unless screen is larger than world)
    if (canvas.width < WORLD_SIZE) {
        targetCamX = Math.max(0, Math.min(WORLD_SIZE - canvas.width, targetCamX));
    } else {
        targetCamX = (WORLD_SIZE - canvas.width) / 2;
    }
    if (canvas.height < WORLD_SIZE) {
        targetCamY = Math.max(0, Math.min(WORLD_SIZE - canvas.height, targetCamY));
    } else {
        targetCamY = (WORLD_SIZE - canvas.height) / 2;
    }
    camera.x += (targetCamX - camera.x) * camera.lerpSpeed;
    camera.y += (targetCamY - camera.y) * camera.lerpSpeed;
    // 3. Spawning Enemies (Scale spawning interval with wave level)
    const currentSpawnInterval = Math.max(280, BASE_SPAWN_INTERVAL - (wave - 1) * 120);
    if (Date.now() > nextSpawnTime) {
        spawnEnemy();
        nextSpawnTime = Date.now() + currentSpawnInterval;
    }
    // 4. Update enemies & collision detection
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.update(player.x, player.y, dt);
        // Check contact collision with player
        const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
        if (distToPlayer < player.radius + e.size / 2 - 3) {
            player.takeDamage(20);
            e.deathMark = true; // destroy enemy on hit
        }
        // Check sword slash collision if player is swinging
        if (player.swingTime > 0 && !player.lastSlashTargets.has(e)) {
            const distToSword = Math.hypot(e.x - player.x, e.y - player.y);

            // Check radius bounds
            if (distToSword >= player.radius - 10 && distToSword <= player.radius + SWORD_LENGTH + e.size / 2) {
                // Calculate angle to enemy relative to player
                const angleToEnemy = Math.atan2(e.y - player.y, e.x - player.x);

                // Compute current active sword sweep regions
                const t = 1 - (player.swingTime / SWING_DURATION);

                // Sword 1 limits
                const startA1 = player.angle - Math.PI * 0.75;
                const endA1 = player.angle + Math.PI * 0.5;
                const currAngle1 = startA1 + (endA1 - startA1) * t;
                const tailLength = Math.PI * 0.55;
                // Sword 2 limits
                const startA2 = player.angle + Math.PI * 0.75;
                const endA2 = player.angle - Math.PI * 0.5;
                const currAngle2 = startA2 + (endA2 - startA2) * t;
                const isHitBySword1 = isAngleBetween(angleToEnemy, currAngle1 - tailLength - 0.15, currAngle1 + 0.15);
                const isHitBySword2 = isAngleBetween(angleToEnemy, currAngle2 - 0.15, currAngle2 + tailLength + 0.15);
                if (isHitBySword1 || isHitBySword2) {
                    e.deathMark = true;
                    player.lastSlashTargets.add(e);

                    // Score award
                    score += 100;

                    // Spawn score popup
                    floatingTexts.push(new FloatingText(e.x, e.y - 15, '+100', isHitBySword1 ? '#00f2fe' : '#ff007f'));
                    // Dynamic wave escalation
                    const newWave = Math.floor(score / 1200) + 1;
                    if (newWave > wave) {
                        wave = newWave;
                        floatingTexts.push(new FloatingText(player.x, player.y - 40, `WAVE ${wave} LOADED`, '#ffb800'));
                    }
                    updateHUD();
                }
            }
        }
        // Handle enemy cleanup
        if (e.deathMark) {
            // Play dynamic synth blow
            Sound.playExplosion();
            // Spark particles
            const particleColor = e.hp <= 0 ? '#ff3b30' : '#ffffff';
            for (let k = 0; k < 12; k++) {
                const partAngle = Math.random() * Math.PI * 2;
                const partSpeed = Math.random() * 160 + 90;
                particles.push(new Particle(e.x, e.y, particleColor, partAngle, partSpeed));
            }
            enemies.splice(i, 1);
        }
    }
    // 5. Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p.update(dt)) {
            particles.splice(i, 1);
        }
    }
    // 6. Update floating text scores
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        if (!ft.update(dt)) {
            floatingTexts.splice(i, 1);
        }
    }
    // 7. Decr screen damage flash timer
    if (damageOverlayTimer > 0) {
        damageOverlayTimer -= dt;
    }
}
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Apply Camera Screen Shake offset
    ctx.save();
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake;
        const shakeY = (Math.random() - 0.5) * screenShake;
        ctx.translate(shakeX, shakeY);

        // Decay shake effect
        screenShake *= 0.88;
        if (screenShake < 0.1) screenShake = 0;
    }
    // --- DRAW NEON GRID BACKGROUND ---
    // Calculate scroll grids
    const startGridX = Math.floor(camera.x / GRID_SIZE) * GRID_SIZE;
    const startGridY = Math.floor(camera.y / GRID_SIZE) * GRID_SIZE;
    const endGridX = startGridX + canvas.width + GRID_SIZE;
    const endGridY = startGridY + canvas.height + GRID_SIZE;
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical grid lines
    for (let x = Math.max(0, startGridX); x <= Math.min(WORLD_SIZE, endGridX); x += GRID_SIZE) {
        ctx.moveTo(x - camera.x, Math.max(0, startGridY) - camera.y);
        ctx.lineTo(x - camera.x, Math.min(WORLD_SIZE, endGridY) - camera.y);
    }
    // Horizontal grid lines
    for (let y = Math.max(0, startGridY); y <= Math.min(WORLD_SIZE, endGridY); y += GRID_SIZE) {
        ctx.moveTo(Math.max(0, startGridX) - camera.x, y - camera.y);
        ctx.lineTo(Math.min(WORLD_SIZE, endGridX) - camera.x, y - camera.y);
    }
    ctx.stroke();
    
    // --- DRAW SCENERY ---
    ctx.lineWidth = 1.5;
    scenery.forEach(item => {
        // Only draw if inside camera view
        if (item.x > camera.x - 50 && item.x < camera.x + canvas.width + 50 &&
            item.y > camera.y - 50 && item.y < camera.y + canvas.height + 50) {
            ctx.strokeStyle = `rgba(0, 242, 254, ${item.opacity})`;
            if (item.type === 'square') {
                ctx.strokeRect(item.x - camera.x - item.size/2, item.y - camera.y - item.size/2, item.size, item.size);
            } else if (item.type === 'cross') {
                ctx.beginPath();
                ctx.moveTo(item.x - camera.x - item.size/2, item.y - camera.y);
                ctx.lineTo(item.x - camera.x + item.size/2, item.y - camera.y);
                ctx.moveTo(item.x - camera.x, item.y - camera.y - item.size/2);
                ctx.lineTo(item.x - camera.x, item.y - camera.y + item.size/2);
                ctx.stroke();
            }
        }
    });

    // --- DRAW WORLD ARENA BOUNDARIES ---
    // Outer Border (Heavy neon glow styling)
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 6;
    ctx.strokeRect(-camera.x, -camera.y, WORLD_SIZE, WORLD_SIZE);

    // Outer Border Sub-stroke for high intensity cyber glow
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.2)';
    ctx.lineWidth = 14;
    ctx.strokeRect(-camera.x, -camera.y, WORLD_SIZE, WORLD_SIZE);
    // --- DRAW ALL ENTITIES ---

    // Draw enemies
    enemies.forEach(e => e.draw(ctx));
    // Draw player
    if (player) {
        player.draw(ctx);
    }
    // Draw particles
    particles.forEach(p => p.draw(ctx));
    // Draw floating score text pops
    floatingTexts.forEach(ft => ft.draw(ctx));
    ctx.restore(); // cancel camera translation
    // --- DRAW DAMAGE FLASH OVERLAY ---
    if (damageOverlayTimer > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 0, 85, ${damageOverlayTimer * 1.5})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}
// --- MAIN RUNNING FRAME LOOP ---
function gameLoop(time) {
    if (!lastTime) lastTime = time;
    const dt = (time - lastTime) / 1000;
    lastTime = time;
    // Cap frame step jump if browser context switches
    const cappedDt = Math.min(0.08, dt);
    update(cappedDt);
    draw();
    if (gameState === 'PLAYING') {
        requestAnimationFrame(gameLoop);
    }
}
// --- RESIZING HANDLER ---
function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        // Instantly force redraw if game is not active
        if (gameState !== 'PLAYING' && player) {
            camera.x = player.x - canvas.width / 2;
            camera.y = player.y - canvas.height / 2;
            draw();
        }
    }
}
// --- MAIN EVENT SETUP ---
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    // Scale canvas sizes
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    // Initial setup (draw menu preview backdrop)
    player = new Player(WORLD_SIZE / 2, WORLD_SIZE / 2);
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
    generateScenery();
    draw();
    // Input Handlers (Keyboard WASD)
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'escape' || key === 'p') {
            if (gameState === 'PLAYING') {
                gameState = 'PAUSED';
                document.getElementById('pause-screen').classList.remove('hidden');
                if (Sound.ctx) Sound.ctx.suspend();
            } else if (gameState === 'PAUSED') {
                gameState = 'PLAYING';
                document.getElementById('pause-screen').classList.add('hidden');
                Sound.resume();
                lastTime = performance.now();
                requestAnimationFrame(gameLoop);
            }
        } else if (key === ' ') {
            if (gameState === 'PLAYING' && player) {
                player.executeSkillFlash(enemies);
            }
        } else if (key in keys) {
            keys[key] = true;
        }
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) keys[key] = false;
    });
    // Input Handlers (Mouse Coordinates)
    window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    // Sword Swings
    window.addEventListener('mousedown', (e) => {
        if (gameState === 'PLAYING' && e.button === 0) {
            player.triggerSwing();
        }
    });
    // Button Click Interactions
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            document.getElementById('start-screen').classList.add('hidden');
            document.getElementById('hud').classList.remove('hidden');
            document.getElementById('floating-mute-btn').classList.remove('hidden');
            initGame();
        });
    }
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            document.getElementById('game-over-screen').classList.add('hidden');
            document.getElementById('hud').classList.remove('hidden');
            document.getElementById('floating-mute-btn').classList.remove('hidden');
            initGame();
        });
    }

    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (gameState === 'PAUSED') {
                gameState = 'PLAYING';
                document.getElementById('pause-screen').classList.add('hidden');
                Sound.resume();
                lastTime = performance.now();
                requestAnimationFrame(gameLoop);
            }
        });
    }

    const mainMenuBtn = document.getElementById('main-menu-btn');
    if (mainMenuBtn) {
        mainMenuBtn.addEventListener('click', () => {
            gameState = 'START';
            document.getElementById('pause-screen').classList.add('hidden');
            document.getElementById('hud').classList.add('hidden');
            document.getElementById('floating-mute-btn').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            // reset background preview
            player = new Player(WORLD_SIZE / 2, WORLD_SIZE / 2);
            enemies = [];
            particles = [];
            scenery = [];
            generateScenery();
            camera.x = player.x - canvas.width / 2;
            camera.y = player.y - canvas.height / 2;
            if (Sound.ctx) Sound.ctx.suspend();
            draw();
        });
    }
    // Audio Mute Buttons
    const muteBtnStart = document.getElementById('mute-btn-start');
    if (muteBtnStart) {
        muteBtnStart.addEventListener('click', (e) => {
            e.stopPropagation();
            Sound.init();
            Sound.toggleMute();
        });
    }
    const floatMuteBtn = document.getElementById('floating-mute-btn');
    if (floatMuteBtn) {
        floatMuteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            Sound.init();
            Sound.toggleMute();
        });
    }
});
