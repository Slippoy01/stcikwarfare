/**
 * stickenade - Procedural Web Audio Engine
 * 100% synthesized sound effects & dynamic cyberpunk combat music
 * Zero external audio files required!
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.isMuted = false;
        this.isMusicMuted = false;
        this.initialized = false;
        this.musicInterval = null;
        this.musicStep = 0;
        this.noiseBuffer = null;
    }

    init() {
        if (this.initialized && this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.85;
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.95;
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.35;
            this.musicGain.connect(this.masterGain);

            // Generate 3 seconds of white/pink noise for explosions, whooshes, footsteps
            this.createNoiseBuffer();

            this.initialized = true;
            this.startCombatMusic();
        } catch (e) {
            console.warn("Web Audio not supported or blocked:", e);
        }
    }

    createNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 3;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Pink noise filtering approximation for richer explosions
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime, 0.05);
        }
        return this.isMuted;
    }

    toggleMusic() {
        this.isMusicMuted = !this.isMusicMuted;
        if (this.musicGain && this.ctx) {
            this.musicGain.gain.setTargetAtTime(this.isMusicMuted ? 0 : 0.35, this.ctx.currentTime, 0.05);
        }
        return this.isMusicMuted;
    }

    // --- PROCEDURAL SFX ---

    /**
     * Grenade launcher fire thump
     * Layered: Deep gas expansion pop (sine sweep 220 -> 40Hz) + high mechanical click
     */
    playLaunch(isPlayer = true) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Sub-bass thump
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isPlayer ? 240 : 180, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

        gain.gain.setValueAtTime(isPlayer ? 1.0 : 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.22);

        // High pressure pneumatic burst (filtered noise)
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.Q.value = 2.0;

            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(isPlayer ? 0.7 : 0.35, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.sfxGain);
            noise.start(now);
            noise.stop(now + 0.12);
        }

        // Mechanical hammer release click
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(1800, now);
        click.frequency.exponentialRampToValueAtTime(400, now + 0.03);
        clickGain.gain.setValueAtTime(0.2, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        click.connect(clickGain);
        clickGain.connect(this.sfxGain);
        click.start(now);
        click.stop(now + 0.03);
    }

    /**
     * Grenade bounce click (metallic clatter / concrete bounce)
     */
    playBounce(strength = 1.0, distance = 0) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const distAtten = Math.max(0.1, 1 / (1 + distance * 0.08));

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Metallic resonance frequency
        osc.type = 'sine';
        const baseFreq = 1600 + Math.random() * 400;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.06);

        const vol = Math.min(1.0, Math.max(0.15, strength)) * 0.45 * distAtten;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    /**
     * Massive Realistic Explosion
     * Layer 1: Supersonic shockwave crack (noise burst)
     * Layer 2: Concussive sub-bass thump (swept sine with soft distortion)
     * Layer 3: Sustained explosive fireball roar (lowpass filter sweep)
     */
    playExplosion(distance = 0, isDirect = false) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const distFactor = Math.max(0.05, 1 / (1 + distance * 0.06));
        const directBoost = isDirect ? 1.3 : 1.0;

        // 1. Concussive Sub-bass Thump
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(160, now);
        subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.45);

        subGain.gain.setValueAtTime(1.2 * distFactor * directBoost, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(now);
        subOsc.stop(now + 0.65);

        // 2. Fireball Rumble (low-pass swept noise)
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(distance > 15 ? 400 : 1200, now);
            filter.frequency.exponentialRampToValueAtTime(70, now + 1.2);

            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.9 * distFactor * directBoost, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.sfxGain);
            noise.start(now);
            noise.stop(now + 1.3);

            // 3. Supersonic initial crack (if close)
            if (distance < 18) {
                const crack = this.ctx.createBufferSource();
                crack.buffer = this.noiseBuffer;
                const cFilter = this.ctx.createBiquadFilter();
                cFilter.type = 'highpass';
                cFilter.frequency.setValueAtTime(1800, now);

                const cGain = this.ctx.createGain();
                cGain.gain.setValueAtTime(0.7 * distFactor, now);
                cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

                crack.connect(cFilter);
                cFilter.connect(cGain);
                cGain.connect(this.sfxGain);
                crack.start(now);
                crack.stop(now + 0.08);
            }
        }

        // Tinnitus ringing if explosion happened right beside player
        if (distance < 3.5) {
            this.playTinnitus();
        }
    }

    /**
     * High-pitched ear ringing when an explosion detonates point-blank
     */
    playTinnitus() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(4200, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 1.8);
    }

    /**
     * Hitmarker sound: crisp tactical double-click / metallic bell
     */
    playHitmarker(isDirect = false) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        const freq = isDirect ? 2800 : 2100;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.045);

        gain.gain.setValueAtTime(isDirect ? 0.45 : 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    /**
     * Rocket Jump explosive boost whoosh
     */
    playRocketJump() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(1400, now + 0.35);
        filter.Q.value = 3.0;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.4);
    }

    /**
     * Respawn Invincible Shield Activation Hum & Energy Chime
     */
    playShieldActivate() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Rising futuristic harmonic sweep (C5 -> G5 -> C6)
        const freqs = [523.25, 783.99, 1046.50];
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f * 0.7, now + idx * 0.05);
            osc.frequency.exponentialRampToValueAtTime(f, now + idx * 0.05 + 0.15);

            gain.gain.setValueAtTime(0.001, now + idx * 0.05);
            gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.05 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.42);
        });
    }

    /**
     * Shield Deflect / Ricochet ping when taking fire during immunity
     */
    playShieldDeflect() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Crystal forcefield deflect sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(2800, now + 0.03);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.14);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    /**
     * Jump Pad / Trampoline propulsion sound (elastic spring bounce + upward whoosh)
     */
    playJumpPad() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // 1. High whoosh sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.32);

        // 2. Trampoline elastic bounce tone
        const springOsc = this.ctx.createOscillator();
        const springGain = this.ctx.createGain();
        springOsc.type = 'triangle';
        springOsc.frequency.setValueAtTime(85, now);
        springOsc.frequency.exponentialRampToValueAtTime(260, now + 0.12);
        springGain.gain.setValueAtTime(0.5, now);
        springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        springOsc.connect(springGain);
        springGain.connect(this.sfxGain);
        springOsc.start(now);
        springOsc.stop(now + 0.22);
    }

    /**
     * Multi-stage realistic grenade launcher reload sequence
     * Latch open -> Shells dump -> Speedloader insert -> Cylinder slam shut
     */
    playReload() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // 1. Latch release & cylinder swing out (now)
        this.playMechanicalClick(now, 850, 0.04, 0.3);
        this.playMechanicalClick(now + 0.05, 500, 0.06, 0.25);

        // 2. Spent shells dump & tinkle (now + 0.4s)
        setTimeout(() => {
            if (!this.initialized || this.isMuted) return;
            const t = this.ctx.currentTime;
            this.playMechanicalClick(t, 2400, 0.05, 0.2);
            this.playMechanicalClick(t + 0.08, 1900, 0.05, 0.18);
        }, 380);

        // 3. Speedloader / 6 rounds sliding into chambers (now + 0.9s)
        setTimeout(() => {
            if (!this.initialized || this.isMuted) return;
            const t = this.ctx.currentTime;
            this.playMechanicalClick(t, 1200, 0.08, 0.3);
            this.playMechanicalClick(t + 0.12, 1400, 0.07, 0.32);
        }, 850);

        // 4. Heavy cylinder slam shut (now + 1.4s)
        setTimeout(() => {
            if (!this.initialized || this.isMuted) return;
            const t = this.ctx.currentTime;
            this.playMechanicalClick(t, 350, 0.12, 0.5);
            this.playMechanicalClick(t + 0.03, 1600, 0.04, 0.35);
        }, 1350);
    }

    playMechanicalClick(time, freq, duration, vol) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + duration);

        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(time);
        osc.stop(time + duration);
    }

    /**
     * Procedural footstep sound
     */
    playFootstep(isSprint = false) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        if (!this.noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isSprint ? 450 : 320, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(isSprint ? 0.28 : 0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.09);
    }

    /**
     * Jump and Land
     */
    playJump() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.14);
    }

    playLand() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    /**
     * Player damage hurt sound
     */
    playHurt(amount = 25) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

        const vol = Math.min(0.7, 0.2 + (amount / 100) * 0.4);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    /**
     * Countdown beep (1, 2, 3 -> FIGHT!)
     */
    playCountdown(isFinal = false) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = isFinal ? 'triangle' : 'sine';
        const freq = isFinal ? 880 : 440;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.45 : 0.2));

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + (isFinal ? 0.45 : 0.2));
    }

    /**
     * Heavy Concussive .50 Cal Sniper Gunshot
     */
    playSniperShot(distance = 0) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const distFactor = Math.max(0.08, 1 / (1 + distance * 0.05));

        // 1. Supersonic High-Velocity Whip Crack
        if (this.noiseBuffer) {
            const crack = this.ctx.createBufferSource();
            crack.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2400, now);
            filter.Q.setValueAtTime(2.5, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(1.1 * distFactor, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            crack.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            crack.start(now);
            crack.stop(now + 0.12);
        }

        // 2. Heavy Sub-Bass Concussive Punch
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);

        const filterLow = this.ctx.createBiquadFilter();
        filterLow.type = 'lowpass';
        filterLow.frequency.setValueAtTime(600, now);
        filterLow.frequency.exponentialRampToValueAtTime(90, now + 0.35);

        oscGain.gain.setValueAtTime(1.3 * distFactor, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(filterLow);
        filterLow.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.45);

        // 3. Long Distant Reverb Tail
        if (this.noiseBuffer) {
            const echo = this.ctx.createBufferSource();
            echo.buffer = this.noiseBuffer;
            const eFilter = this.ctx.createBiquadFilter();
            eFilter.type = 'lowpass';
            eFilter.frequency.setValueAtTime(450, now);

            const eGain = this.ctx.createGain();
            eGain.gain.setValueAtTime(0.45 * distFactor, now + 0.05);
            eGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

            echo.connect(eFilter);
            eFilter.connect(eGain);
            eGain.connect(this.sfxGain);
            echo.start(now + 0.05);
            echo.stop(now + 0.95);
        }
    }

    /**
     * Bolt-Action Cycling Sound (clink-clack)
     */
    playBoltCycle() {
        if (!this.initialized || this.isMuted) return;
        // Click 1: Bolt handle up & pull back
        setTimeout(() => this.playMetalClick(880, 0.04), 120);
        setTimeout(() => this.playMetalClick(640, 0.05), 240);
        // Click 2: Bolt push forward & lock down
        setTimeout(() => this.playMetalClick(720, 0.04), 580);
        setTimeout(() => this.playMetalClick(1050, 0.06), 720);
    }

    playMetalClick(freq, duration) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * Sniper Tactical Reload (mag out, mag in, bolt rack)
     */
    playSniperReload() {
        if (!this.initialized || this.isMuted) return;
        // Eject mag
        setTimeout(() => this.playMetalClick(520, 0.08), 200);
        // Slap fresh 5-round mag in
        setTimeout(() => this.playMetalClick(740, 0.09), 1100);
        setTimeout(() => this.playMetalClick(880, 0.07), 1250);
        // Rack bolt
        setTimeout(() => this.playBoltCycle(), 1450);
    }

    /**
     * Optical Scope Zoom In/Out Chirp
     */
    playScopeZoom(isZoomIn = true) {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        if (isZoomIn) {
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.exponentialRampToValueAtTime(1400, now + 0.09);
        } else {
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(450, now + 0.09);
        }
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    /**
     * Satisfying Crisp Headshot Ding
     */
    playHeadshot() {
        if (!this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const freqs = [1760, 2637, 3520]; // High A6, E7, A7 ringing chime
        freqs.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.35 / (idx + 1), now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            osc.stop(now + 0.45);
        });
    }

    /**
     * Victory Fanfare / Defeat Sound
     */
    playVictory() {
        if (!this.initialized || this.isMuted) return;
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                if (!this.initialized || this.isMuted) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(now);
                osc.stop(now + 0.35);
            }, idx * 120);
        });
    }

    playDefeat() {
        if (!this.initialized || this.isMuted) return;
        const notes = [440, 392, 349.23, 293.66];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                if (!this.initialized || this.isMuted) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(now);
                osc.stop(now + 0.45);
            }, idx * 140);
        });
    }

    // ========================================================
    // EDF ALIEN CO-OP & SPECIAL WEAPON SYNTHESIS
    // ========================================================

    /**
     * Assault rifle rapid ballistic shot (crack + thump + metallic casing click)
     */
    playAssaultRifleShot() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;

        // Snappy supersonic crack (bandpass noise)
        if (this.noiseBuffer) {
            const crack = this.ctx.createBufferSource();
            crack.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2600, now);
            filter.Q.value = 3.5;

            const cGain = this.ctx.createGain();
            cGain.gain.setValueAtTime(0.55, now);
            cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            crack.connect(filter);
            filter.connect(cGain);
            cGain.connect(this.sfxGain);
            crack.start(now);
            crack.stop(now + 0.07);
        }

        // Bass punch thump
        const thump = this.ctx.createOscillator();
        const tGain = this.ctx.createGain();
        thump.type = 'triangle';
        thump.frequency.setValueAtTime(160, now);
        thump.frequency.exponentialRampToValueAtTime(45, now + 0.08);
        tGain.gain.setValueAtTime(0.5, now);
        tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        thump.connect(tGain);
        tGain.connect(this.sfxGain);
        thump.start(now);
        thump.stop(now + 0.09);
    }

    /**
     * Assault rifle tactical reload (magazine eject + insert + bolt slap)
     */
    playAssaultRifleReload() {
        if (!this.initialized || this.isMuted) return;
        this.playMechanicalClick(0.0, 950, 0.08, 0.35);    // Mag out
        this.playMechanicalClick(0.65, 1400, 0.09, 0.45);  // Mag in
        this.playMechanicalClick(1.25, 2100, 0.06, 0.55);  // Bolt release slap
    }

    /**
     * Flamethrower continuous roaring hiss & crackle
     */
    playFlamethrowerLoop() {
        if (!this.initialized || this.isMuted || !this.ctx || !this.noiseBuffer) return;
        const now = this.ctx.currentTime;

        const flame = this.ctx.createBufferSource();
        flame.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800 + Math.random() * 300, now);

        const fGain = this.ctx.createGain();
        fGain.gain.setValueAtTime(0.42, now);
        fGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

        flame.connect(filter);
        filter.connect(fGain);
        fGain.connect(this.sfxGain);
        flame.start(now);
        flame.stop(now + 0.14);

        // Low combustion rumble
        const rumble = this.ctx.createOscillator();
        const rGain = this.ctx.createGain();
        rumble.type = 'sawtooth';
        rumble.frequency.setValueAtTime(65 + Math.random() * 20, now);
        rGain.gain.setValueAtTime(0.18, now);
        rGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        rumble.connect(rGain);
        rGain.connect(this.sfxGain);
        rumble.start(now);
        rumble.stop(now + 0.12);
    }

    /**
     * Piercing high-tech laser discharge
     */
    playLaserShot() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.16);

        // Resonant high-pass sizzle
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3400, now);
            filter.Q.value = 5.0;

            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.25, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.sfxGain);
            noise.start(now);
            noise.stop(now + 0.12);
        }
    }

    /**
     * Bazooka rocket ignition and launch whoosh
     */
    playBazookaLaunch() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;

        // Sub launch pop
        const sub = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(150, now);
        sub.frequency.exponentialRampToValueAtTime(30, now + 0.28);
        sGain.gain.setValueAtTime(0.7, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        sub.connect(sGain);
        sGain.connect(this.sfxGain);
        sub.start(now);
        sub.stop(now + 0.3);

        // Rocket exhaust jet whoosh
        if (this.noiseBuffer) {
            const exhaust = this.ctx.createBufferSource();
            exhaust.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(700, now);
            filter.frequency.exponentialRampToValueAtTime(1800, now + 0.25);

            const eGain = this.ctx.createGain();
            eGain.gain.setValueAtTime(0.65, now);
            eGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

            exhaust.connect(filter);
            filter.connect(eGain);
            eGain.connect(this.sfxGain);
            exhaust.start(now);
            exhaust.stop(now + 0.38);
        }
    }

    /**
     * Massive bazooka warhead detonation
     */
    playBazookaExplode(distance = 0) {
        this.playExplosion(distance, true);
    }

    /**
     * Alien insect chatter / scuttle
     */
    playAlienChitter() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200 + Math.random() * 600, now);
        osc.frequency.setValueAtTime(600 + Math.random() * 400, now + 0.03);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.07);
    }

    /**
     * Alien screech / bug death cry
     */
    playAlienScreech() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900 + Math.random() * 300, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.24);
    }

    /**
     * Corrosive acid glob spit
     */
    playAlienSpit() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.14);
    }

    /**
     * Giant alien boss roar
     */
    playBossRoar() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;

        // Sub bass growl
        const sub = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        sub.type = 'sawtooth';
        sub.frequency.setValueAtTime(80, now);
        sub.frequency.exponentialRampToValueAtTime(35, now + 0.85);
        sGain.gain.setValueAtTime(0.85, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        sub.connect(sGain);
        sGain.connect(this.sfxGain);
        sub.start(now);
        sub.stop(now + 0.9);

        // Ferocious throat roar noise
        if (this.noiseBuffer) {
            const roar = this.ctx.createBufferSource();
            roar.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(450, now);
            filter.frequency.linearRampToValueAtTime(650, now + 0.4);
            filter.frequency.linearRampToValueAtTime(250, now + 0.8);
            filter.Q.value = 2.0;

            const rGain = this.ctx.createGain();
            rGain.gain.setValueAtTime(0.7, now);
            rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

            roar.connect(filter);
            filter.connect(rGain);
            rGain.connect(this.sfxGain);
            roar.start(now);
            roar.stop(now + 0.85);
        }
    }

    /**
     * Boss heavy footstep earthquake stomp
     */
    playBossStomp() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
        gain.gain.setValueAtTime(0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.38);
    }

    /**
     * Med-Bay nanite regeneration hum/chime (+50 HP tick)
     */
    playMedBayHeal() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    /**
     * Special Ammo Depot opens siren / beacon sound (every 2 minutes)
     */
    playAmmoDepotOpen() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const tones = [523.25, 659.25, 783.99, 1046.5]; // C E G C
        tones.forEach((freq, idx) => {
            setTimeout(() => {
                if (!this.initialized || this.isMuted || !this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(now);
                osc.stop(now + 0.28);
            }, idx * 110);
        });
    }

    /**
     * Special ammo resupply collected chime
     */
    playAmmoDepotRefill() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.12);
        osc.frequency.linearRampToValueAtTime(1320, now + 0.22);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.26);
    }

    /**
     * Boss weakness hit (shattering metallic critical hit)
     */
    playWeaknessHit() {
        if (!this.initialized || this.isMuted || !this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);

        // Electric / critical zap
        const zap = this.ctx.createOscillator();
        const zGain = this.ctx.createGain();
        zap.type = 'sawtooth';
        zap.frequency.setValueAtTime(3200, now);
        zap.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        zGain.gain.setValueAtTime(0.35, now);
        zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        zap.connect(zGain);
        zGain.connect(this.sfxGain);
        zap.start(now);
        zap.stop(now + 0.1);
    }

    // --- PROCEDURAL COMBAT SYNTH MUSIC ---
    // Driving 135 BPM Cyberpunk Combat Synthwave
    startCombatMusic() {
        if (this.musicInterval) clearInterval(this.musicInterval);
        const bpm = 135;
        const stepTime = (60 / bpm) / 4; // 16th note in seconds

        // Bassline progression in D minor: D, F, G, Bb
        const bassNotes = [
            73.42, 73.42, 146.83, 73.42, 73.42, 73.42, 146.83, 73.42, // D2
            87.31, 87.31, 174.61, 87.31, 87.31, 87.31, 174.61, 87.31, // F2
            98.00, 98.00, 196.00, 98.00, 98.00, 98.00, 196.00, 98.00, // G2
            116.54, 116.54, 233.08, 116.54, 110.00, 110.00, 220.00, 110.00 // Bb2 -> A2
        ];

        this.musicStep = 0;
        this.musicInterval = setInterval(() => {
            if (!this.initialized || this.isMusicMuted || this.isMuted || !this.ctx) return;
            const now = this.ctx.currentTime;
            const step = this.musicStep % 32;

            // 1. Synth Bass Pulse
            const bassFreq = bassNotes[step];
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            const bassFilter = this.ctx.createBiquadFilter();

            bassOsc.type = 'sawtooth';
            bassOsc.frequency.setValueAtTime(bassFreq, now);

            bassFilter.type = 'lowpass';
            bassFilter.frequency.setValueAtTime(450, now);
            bassFilter.frequency.exponentialRampToValueAtTime(120, now + stepTime * 0.9);

            bassGain.gain.setValueAtTime(0.24, now);
            bassGain.gain.exponentialRampToValueAtTime(0.001, now + stepTime * 0.95);

            bassOsc.connect(bassFilter);
            bassFilter.connect(bassGain);
            bassGain.connect(this.musicGain);

            bassOsc.start(now);
            bassOsc.stop(now + stepTime * 0.95);

            // 2. Procedural Kick Drum on 1, 5, 9, 13 (4-on-the-floor beat)
            if (step % 4 === 0) {
                const kickOsc = this.ctx.createOscillator();
                const kickGain = this.ctx.createGain();
                kickOsc.type = 'sine';
                kickOsc.frequency.setValueAtTime(140, now);
                kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.12);

                kickGain.gain.setValueAtTime(0.35, now);
                kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

                kickOsc.connect(kickGain);
                kickGain.connect(this.musicGain);
                kickOsc.start(now);
                kickOsc.stop(now + 0.14);
            }

            // 3. Snare / Clack on beats 5 and 13 (2 & 4)
            if (step % 8 === 4 && this.noiseBuffer) {
                const snareNoise = this.ctx.createBufferSource();
                snareNoise.buffer = this.noiseBuffer;
                const snareFilter = this.ctx.createBiquadFilter();
                snareFilter.type = 'bandpass';
                snareFilter.frequency.setValueAtTime(1800, now);

                const snareGain = this.ctx.createGain();
                snareGain.gain.setValueAtTime(0.2, now);
                snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

                snareNoise.connect(snareFilter);
                snareFilter.connect(snareGain);
                snareGain.connect(this.musicGain);
                snareNoise.start(now);
                snareNoise.stop(now + 0.1);
            }

            // 4. Closed Hi-Hat on off-beats
            if (step % 2 === 1 && this.noiseBuffer) {
                const hat = this.ctx.createBufferSource();
                hat.buffer = this.noiseBuffer;
                const hatFilter = this.ctx.createBiquadFilter();
                hatFilter.type = 'highpass';
                hatFilter.frequency.setValueAtTime(7000, now);

                const hatGain = this.ctx.createGain();
                hatGain.gain.setValueAtTime(0.09, now);
                hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

                hat.connect(hatFilter);
                hatFilter.connect(hatGain);
                hatGain.connect(this.musicGain);
                hat.start(now);
                hat.stop(now + 0.04);
            }

            this.musicStep++;
        }, stepTime * 1000);
    }
}

// Global singleton
window.soundEngine = new SoundEngine();

