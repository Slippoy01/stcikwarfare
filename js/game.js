/**
 * stickenade - Main Game Orchestrator
 * High-performance 1v1 & Multi-Player (2-4 Players) FPS Duel Game
 * Features:
 * - 100% Pure Code (Procedural Audio, Procedural VFX, Procedural Rig)
 * - WebRTC P2P Star Topology Multiplayer (Up to 4 Players Free-For-All)
 * - Full Gamepad Controller Support with Dual-Rumble Haptics
 * - Full Mobile / Smartphone Optimization
 */

const SLOT_CONFIG = {
    1: { name: 'P1 (CYAN)', color: 0x00f0ff, hex: '#00f0ff' },
    2: { name: 'P2 (ORANGE)', color: 0xf97316, hex: '#f97316' },
    3: { name: 'P3 (GREEN)', color: 0x22c55e, hex: '#22c55e' },
    4: { name: 'P4 (PURPLE)', color: 0xd946ef, hex: '#d946ef' }
};

class StickenadeGame {
    constructor() {
        this.container = document.getElementById('game-container');

        // Game Configuration & State
        this.mode = 'BOT'; // 'BOT' | 'ONLINE_HOST' | 'ONLINE_CLIENT' | 'EDF_SOLO' | 'EDF_COOP'
        this.isEDFMode = false;
        this.edfZones = null;
        this.alienManager = null;
        this.isPaused = true; // Start in Main Menu (Matching stickken)
        this.isGameOver = false;
        this.matchDuration = 180; // 3-Minute Match Duration (180 Seconds)
        this.matchTimer = this.matchDuration;
        this.timeSyncTimer = 0;
        this.myScore = 0;
        this.enemyScore = 0;

        // Multi-player State (2 to 4 Players)
        this.localSlot = 1;
        this.maxMatchPlayers = 2;
        this.playerScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.opponents = new Map(); // key: slot (2, 3, 4), value: { slot, name, visorColor, hex, stickman, isBot }

        // Device detection
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);

        // Player Physical Entity
        this.player = {
            position: new THREE.Vector3(-32, 1.2, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            impulse: new THREE.Vector3(0, 0, 0),
            health: 100,
            maxHealth: 100,
            immunityTimer: 3.5, // 3.5 detik immunity / invincible saat respawn
            isGrounded: true,
            isSprinting: false,
            isCrouching: false,
            isDead: false,
            yaw: -Math.PI / 2, // Facing towards arena center (+X)
            pitch: 0,
            takeDamage: (amount, attacker) => this.onLocalPlayerDamaged(amount, attacker),
            applyImpulse: (force) => this.onLocalPlayerImpulse(force)
        };

        // Movement constants
        this.walkSpeed = 7.5;
        this.sprintSpeed = 11.2;
        this.crouchSpeed = 4.2;
        this.jumpForce = 10.2;
        this.gravity = -24.0;

        // Mouse look sensitivity (Configurable for PC/Desktop)
        this.baseMouseSensitivity = 0.0022;
        let savedSens = 1.0;
        try {
            const s = localStorage.getItem('stickenade_mouse_sens');
            if (s !== null) savedSens = parseFloat(s) || 1.0;
        } catch (_) {}
        this.mouseSensMultiplier = savedSens;
        this.mouseSensitivity = this.baseMouseSensitivity * this.mouseSensMultiplier;
        this.isPointerLocked = false;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.shieldActiveInHUD = false;

        // Gamepad Subsystem State
        this.gamepadConnected = false;
        this.gamepadLookSensitivity = 2.6;
        this.prevPadButtons = {};
        this.gamepadToastEl = document.getElementById('gamepad-toast');
        this.gamepadToastMsgEl = document.getElementById('gamepad-toast-msg');
        this.gamepadBadgeEl = document.getElementById('gamepad-badge-status');
        this.gamepadStatusEl = document.getElementById('gamepad-status-text');
        this.gamepadToastTimer = null;

        // Input state
        this.keys = {};
        this.mouseLeft = false;
        this.mouseRight = false;
        this.fireCooldown = 0.38;
        this.fireTimer = 0;

        // Footstep timing
        this.footstepTimer = 0;

        // Local Player Nickname (persistent across sessions)
        let savedName = 'HERO';
        try {
            const n = localStorage.getItem('stick_player_name');
            if (n && n.trim()) savedName = n.trim().slice(0, 15);
        } catch (_) {}
        this.localPlayerName = savedName;

        // Network sync timer
        this.networkSyncTimer = 0;

        this.initThree();
        this.initSystems();
        this.initInputListeners();
        this.initGamepad();
        this.initNetworkListeners();

        // Start render loop
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initThree() {
        // Scene with bright daylight sky background
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x8ec5fc);

        // FPS Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
        this.camera.rotation.order = 'YXZ';
        this.scene.add(this.camera);

        // Photorealistic Daylight Renderer with Filmic Tone Mapping
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initSystems() {
        // Weapon & Difficulty state
        this.weaponMode = 'GRENADE';
        this.botDifficulty = 'normal';

        // 1. VFX System
        this.vfx = new VFXSystem(this.scene, this.camera);

        // 2. Tactical Arena
        this.arena = new TacticalArena(this.scene);

        // 3. 1st-Person Weapon Rig
        this.weapon = new WeaponRig(this.camera);

        // 4. Grenade Ballistics Physics Engine
        this.physics = new GrenadePhysicsEngine(this.scene, this.arena, this.vfx);

        // 5. Enemy Stickman (Bot or Remote Player)
        this.enemyStickman = new TacticalStickman(this.scene, {
            isBot: true,
            name: "BOT-OMEGA",
            visorColor: 0xff2244,
            weaponMode: this.weaponMode
        });
        this.enemyStickman.respawn(this.arena.spawnPoints[1]);

        // 6. Tactical AI Bot Controller
        this.botController = new TacticalBotController(this.enemyStickman, this.arena, this.physics, this.vfx);
        this.enemyStickman.botController = this.botController;

        // 7. EDF Tactical Zones (Area Isi Darah + Special Ammo Depot)
        if (typeof EDFZones !== 'undefined') {
            this.edfZones = new EDFZones(this.scene, this.vfx);
        }

        // 8. EDF Alien Wave & Boss Coordinator
        if (typeof AlienWaveManager !== 'undefined') {
            this.alienManager = new AlienWaveManager(this.scene, this.vfx);
            this.alienManager.onWaveChange = (wave, maxWaves, phase) => {
                this.updateEDFWaveHUD();
            };
            this.alienManager.onBossSpawned = (boss) => {
                this.updateEDFWaveHUD();
                this.showToast(`🚨 WARNING: BOS WAVE ${boss.wave}: ${boss.name} TELAH DATANG!`);
                if (this.vfx) this.vfx.addTrauma(0.4);
            };
            this.alienManager.onBossDefeated = (boss) => {
                this.showToast(`🏆 BOS ${boss.name} BERHASIL DIKALAHKAN!`);
                this.updateEDFWaveHUD();
            };
            this.alienManager.onVictory = () => {
                this.endEDFVictory();
            };
        }

        // Place local player at spawn
        this.respawnLocalPlayer();
    }

    setLocalPlayerName(name) {
        if (!name || typeof name !== 'string') return;
        const clean = name.trim().slice(0, 15);
        if (!clean) return;
        this.localPlayerName = clean;
        try {
            localStorage.setItem('stick_player_name', clean);
        } catch (_) {}
        this.updateScoreboard();
    }

    syncPlayerNames(playerList) {
        if (!playerList || !Array.isArray(playerList)) return;
        for (let p of playerList) {
            if (p.slot === this.localSlot) {
                if (p.name && p.name !== this.localPlayerName) {
                    this.localPlayerName = p.name;
                }
            } else if (p.name) {
                const opp = this.opponents.get(p.slot);
                if (opp) {
                    if (opp.name !== p.name) {
                        opp.name = p.name;
                        if (opp.stickman) {
                            opp.stickman.name = p.name;
                            if (opp.stickman.updateNameTag) {
                                opp.stickman.updateNameTag();
                            }
                        }
                    }
                }
            }
        }
        this.updateScoreboard();
    }

    getOrCreateOpponent(slot, customName = null) {
        if (this.opponents.has(slot)) {
            const existingOpp = this.opponents.get(slot);
            if (customName && existingOpp && existingOpp.name !== customName) {
                existingOpp.name = customName;
                if (existingOpp.stickman) {
                    existingOpp.stickman.name = customName;
                    if (existingOpp.stickman.updateNameTag) {
                        existingOpp.stickman.updateNameTag();
                    }
                }
            }
            return existingOpp;
        }
        const conf = SLOT_CONFIG[slot] || { name: `P${slot}`, color: 0xffffff, hex: '#ffffff' };
        const name = customName || conf.name;
        const stickman = new TacticalStickman(this.scene, {
            isBot: false,
            name: name,
            visorColor: conf.color,
            weaponMode: this.weaponMode
        });
        stickman.slot = slot;
        const spawnIdx = (slot - 1) % this.arena.spawnPoints.length;
        stickman.respawn(this.arena.spawnPoints[spawnIdx], false);
        stickman.yaw = this.arena.spawnYaws[spawnIdx];
        stickman.targetYaw = this.arena.spawnYaws[spawnIdx];

        const opp = {
            slot: slot,
            name: name,
            visorColor: conf.color,
            hex: conf.hex,
            stickman: stickman,
            isBot: false
        };
        this.opponents.set(slot, opp);
        return opp;
    }

    getSlotByStickman(sm) {
        if (!sm) return null;
        if (sm.slot) return sm.slot;
        for (let [slot, opp] of this.opponents) {
            if (opp && opp.stickman === sm) return slot;
        }
        return null;
    }

    getActiveTargets() {
        if (this.mode === 'BOT') {
            return this.enemyStickman ? [this.enemyStickman] : [];
        }
        const list = [];
        for (let [slot, opp] of this.opponents) {
            if (opp && opp.stickman) {
                opp.stickman.slot = slot;
                list.push(opp.stickman);
            }
        }
        return list;
    }

    getPlayerNameBySlot(slot) {
        if (slot === this.localSlot) return this.localPlayerName || "KAMU";
        if (this.mode === 'BOT' && slot === 2) return this.enemyStickman ? this.enemyStickman.name : "BOT-OMEGA";
        const opp = this.opponents.get(slot);
        if (opp) return opp.name;
        const conf = SLOT_CONFIG[slot];
        return conf ? conf.name : `P${slot}`;
    }

    getMyName() {
        return this.localPlayerName || (this.mode === 'BOT' ? "HERO" : (SLOT_CONFIG[this.localSlot] ? SLOT_CONFIG[this.localSlot].name : `P${this.localSlot}`));
    }

    formatTimer() {
        const totalSecs = Math.max(0, Math.ceil(this.matchTimer));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Configure Mouse Sensitivity (PC / Desktop)
     */
    setMouseSensitivity(multiplier) {
        const mult = Math.max(0.2, Math.min(3.0, parseFloat(multiplier) || 1.0));
        this.mouseSensMultiplier = mult;
        this.mouseSensitivity = this.baseMouseSensitivity * this.mouseSensMultiplier;
        try {
            localStorage.setItem('stickenade_mouse_sens', mult.toFixed(1));
        } catch (_) {}
        this.updateSensitivityUI();
    }

    updateSensitivityUI() {
        const textVal = `${this.mouseSensMultiplier.toFixed(1)}x`;
        const menuSlider = document.getElementById('select-mouse-sens');
        const menuVal = document.getElementById('mouse-sens-display');
        const promptSlider = document.getElementById('prompt-mouse-sens');
        const promptVal = document.getElementById('prompt-sens-display');

        if (menuSlider && parseFloat(menuSlider.value) !== this.mouseSensMultiplier) {
            menuSlider.value = this.mouseSensMultiplier.toFixed(1);
        }
        if (menuVal) menuVal.innerText = textVal;

        if (promptSlider && parseFloat(promptSlider.value) !== this.mouseSensMultiplier) {
            promptSlider.value = this.mouseSensMultiplier.toFixed(1);
        }
        if (promptVal) promptVal.innerText = textVal;
    }

    /**
     * Update HUD visual state for Respawn Invincibility / Immunity Shield
     */
    updateShieldHUD() {
        const badge = document.getElementById('hud-shield-indicator');
        const valEl = document.getElementById('hud-shield-timer');
        const vig = document.getElementById('shield-vignette');

        if (this.player.immunityTimer > 0 && !this.player.isDead) {
            this.shieldActiveInHUD = true;
            if (badge) badge.style.display = 'flex';
            if (valEl) valEl.innerText = `${this.player.immunityTimer.toFixed(1)}s`;
            if (vig) vig.classList.add('active');
        } else {
            this.shieldActiveInHUD = false;
            if (badge) badge.style.display = 'none';
            if (vig) vig.classList.remove('active');
        }
    }

    initInputListeners() {
        // Keyboard inputs
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Audio init on first user gesture
            if (window.soundEngine && !window.soundEngine.initialized) {
                window.soundEngine.init();
            }

            if (e.code === 'KeyR') {
                this.weapon.startReload();
            }

            // Quick Weapon Hotkeys (1-5, Q, E)
            if (e.code === 'Digit1') this.switchWeaponSlot(0);
            if (e.code === 'Digit2') this.switchWeaponSlot(1);
            if (e.code === 'Digit3') this.switchWeaponSlot(2);
            if (e.code === 'Digit4') this.switchWeaponSlot(3);
            if (e.code === 'Digit5') this.switchWeaponSlot(4);
            if (e.code === 'KeyQ') this.switchWeaponPrev();
            if (e.code === 'KeyE') this.switchWeaponNext();

            if (e.code === 'KeyP' || e.code === 'Escape') {
                if (this.isPointerLocked) {
                    document.exitPointerLock();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse Wheel Weapon Switching
        window.addEventListener('wheel', (e) => {
            if (!this.isPointerLocked) return;
            if (e.deltaY > 0) this.switchWeaponNext();
            else if (e.deltaY < 0) this.switchWeaponPrev();
        }, { passive: true });

        // Pointer Lock / Tap to Start Overlay
        const canvas = this.renderer.domElement;
        const lockPrompt = document.getElementById('pointer-lock-prompt');

        const handleScreenInteract = () => {
            if (window.soundEngine && !window.soundEngine.initialized) {
                window.soundEngine.init();
            }

            if (this.isTouchDevice) {
                // On mobile devices, pointer lock is not needed; simply hide prompt
                if (lockPrompt) lockPrompt.style.display = 'none';
                return;
            }

            // On Desktop, request Pointer Lock
            if (!this.isPointerLocked && !this.isGameOver) {
                try {
                    canvas.requestPointerLock();
                } catch (_) {}
            }
        };

        canvas.addEventListener('click', handleScreenInteract);
        if (lockPrompt) {
            lockPrompt.addEventListener('click', handleScreenInteract);
            lockPrompt.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleScreenInteract();
            }, { passive: false });
        }

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === canvas);
            if (lockPrompt && !this.isTouchDevice) {
                lockPrompt.style.display = this.isPointerLocked ? 'none' : 'flex';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked || this.player.isDead) return;

            this.mouseDeltaX = e.movementX;
            this.mouseDeltaY = e.movementY;

            let sens = this.mouseSensitivity;
            if (this.weapon && this.weapon.isADS) {
                sens *= (this.weaponMode === 'SNIPER' ? 0.24 : 0.65);
            }

            this.player.yaw -= e.movementX * sens;
            this.player.pitch -= e.movementY * sens;

            // Clamp pitch to prevent somersaults
            const maxPitch = Math.PI * 0.48; // ~86 degrees
            this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
        });

        // Mouse buttons for Fire & ADS
        window.addEventListener('mousedown', (e) => {
            if (!this.isPointerLocked) return;
            if (e.button === 0) { // LMB
                this.mouseLeft = true;
                this.tryFireActiveWeapon();
            } else if (e.button === 2) { // RMB
                this.mouseRight = true;
                this.weapon.setADS(true);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouseLeft = false;
            } else if (e.button === 2) {
                this.mouseRight = false;
                this.weapon.setADS(false);
            }
        });

        // Prevent context menu on right click
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // ===============================================
    // GAMEPAD CONTROLLER SUBSYSTEM & HAPTICS
    // ===============================================
    initGamepad() {
        window.addEventListener('gamepadconnected', (e) => {
            this.onGamepadConnected(e.gamepad);
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            this.onGamepadDisconnected(e.gamepad);
        });

        this.updateGamepadBadge();
    }

    onGamepadConnected(gp) {
        if (window.soundEngine && !window.soundEngine.initialized) {
            window.soundEngine.init();
        }

        this.gamepadConnected = true;
        const name = gp.id.split('(')[0].trim() || 'Gamepad';
        this.showGamepadToast(`🎮 ${name} Terhubung!`);
        this.updateGamepadBadge();

        // Welcome vibration bump
        this.triggerGamepadRumble(120, 0.35, 0.6);

        // Hide pointer lock prompt if gamepad is active
        const lockPrompt = document.getElementById('pointer-lock-prompt');
        if (lockPrompt) lockPrompt.style.display = 'none';
    }

    onGamepadDisconnected(gp) {
        this.showGamepadToast(`⚠️ Gamepad Terputus`, true);
        this.updateGamepadBadge();
    }

    updateGamepadBadge() {
        const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
        const activePads = Array.from(rawPads).filter(p => p !== null && p.connected);

        if (!this.gamepadBadgeEl || !this.gamepadStatusEl) return;

        if (activePads.length > 0) {
            this.gamepadBadgeEl.className = 'gamepad-status-pill connected';
            const padName = activePads[0].id.split('(')[0].trim() || 'Controller';
            this.gamepadStatusEl.textContent = `🎮 ${padName.slice(0, 14)}`;
            this.gamepadConnected = true;
        } else {
            this.gamepadBadgeEl.className = 'gamepad-status-pill disconnected';
            this.gamepadStatusEl.textContent = '🎮 Gamepad';
            this.gamepadConnected = false;
        }
    }

    showGamepadToast(message, isDisconnect = false) {
        if (!this.gamepadToastEl || !this.gamepadToastMsgEl) return;
        this.gamepadToastMsgEl.textContent = message;
        if (isDisconnect) {
            this.gamepadToastEl.classList.add('toast-disconnect');
        } else {
            this.gamepadToastEl.classList.remove('toast-disconnect');
        }

        this.gamepadToastEl.classList.add('show');
        clearTimeout(this.gamepadToastTimer);
        this.gamepadToastTimer = setTimeout(() => {
            if (this.gamepadToastEl) this.gamepadToastEl.classList.remove('show');
        }, 3200);
    }

    triggerGamepadRumble(durationMs = 100, weak = 0.4, strong = 0.7) {
        try {
            const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (let pad of rawPads) {
                if (pad && pad.connected && pad.vibrationActuator && pad.vibrationActuator.playEffect) {
                    pad.vibrationActuator.playEffect('dual-rumble', {
                        startDelay: 0,
                        duration: durationMs,
                        weakMagnitude: weak,
                        strongMagnitude: strong
                    }).catch(() => {});
                }
            }
        } catch (_) {}
    }

    pollGamepadState(dt) {
        const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
        let pad = null;
        for (let p of rawPads) {
            if (p && p.connected) {
                pad = p;
                break;
            }
        }

        if (!pad) return null;

        const prevBtns = this.prevPadButtons || {};
        const isDown = (idx) => Boolean(pad.buttons && pad.buttons[idx] && (pad.buttons[idx].pressed || pad.buttons[idx].value > 0.35));
        const justPressed = (idx) => Boolean(isDown(idx) && !prevBtns[idx]);

        // Left Analog Stick (Movement: Axes 0 & 1)
        const leftX = pad.axes && pad.axes[0] !== undefined ? pad.axes[0] : 0;
        const leftY = pad.axes && pad.axes[1] !== undefined ? pad.axes[1] : 0;

        let padMoveX = 0;
        let padMoveZ = 0;
        const deadzoneMove = 0.16;

        if (Math.abs(leftX) > deadzoneMove) {
            padMoveX = leftX;
        }
        if (Math.abs(leftY) > deadzoneMove) {
            padMoveZ = -leftY; // Invert so push forward = forward (+Z)
        }

        // D-Pad support for movement
        if (isDown(14)) padMoveX = -1.0; // Left
        if (isDown(15)) padMoveX = 1.0;  // Right
        if (isDown(12)) padMoveZ = 1.0;  // Up
        if (isDown(13)) padMoveZ = -1.0; // Down

        // Right Analog Stick (Aim / Camera: Axes 2 & 3)
        const rightX = pad.axes && pad.axes[2] !== undefined ? pad.axes[2] : 0;
        const rightY = pad.axes && pad.axes[3] !== undefined ? pad.axes[3] : 0;
        const deadzoneLook = 0.16;

        if (Math.abs(rightX) > deadzoneLook || Math.abs(rightY) > deadzoneLook) {
            // Non-linear power curve for precision + flick capability
            const signX = Math.sign(rightX);
            const signY = Math.sign(rightY);
            const magX = Math.max(0, Math.abs(rightX) - deadzoneLook) / (1.0 - deadzoneLook);
            const magY = Math.max(0, Math.abs(rightY) - deadzoneLook) / (1.0 - deadzoneLook);

            const lookDeltaX = signX * (magX * magX) * this.gamepadLookSensitivity;
            const lookDeltaY = signY * (magY * magY) * this.gamepadLookSensitivity;

            let padSensMultiplier = 1.0;
            if (this.weapon && this.weapon.isADS) {
                padSensMultiplier = (this.weaponMode === 'SNIPER' ? 0.35 : 0.70);
            }

            this.player.yaw -= lookDeltaX * dt * padSensMultiplier;
            this.player.pitch -= lookDeltaY * dt * padSensMultiplier;

            const maxPitch = Math.PI * 0.48;
            this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
        }

        // Buttons
        // RT / R2 (Button 7): Fire Grenade
        const isFire = isDown(7) || isDown(5); // RT or RB
        // LT / L2 (Button 6): Aim Down Sights (ADS)
        const isADS = isDown(6);
        // A / Cross (Button 0): Jump
        const isJump = justPressed(0);
        // X / Square (Button 2): Reload
        const isReload = justPressed(2);
        // B / Circle (Button 1): Crouch
        const isCrouch = isDown(1);
        // LB / L1 (Button 4) or L3 (Button 10): Sprint
        const isSprint = isDown(4) || isDown(10);
        // START (Button 9): Rematch or Lobby
        const isStart = justPressed(9);

        // Store previous button state for edge triggers
        if (pad.buttons) {
            for (let i = 0; i < pad.buttons.length; i++) {
                this.prevPadButtons[i] = isDown(i);
            }
        }

        return {
            moveX: padMoveX,
            moveZ: padMoveZ,
            fire: isFire,
            ads: isADS,
            jump: isJump,
            reload: isReload,
            crouch: isCrouch,
            sprint: isSprint,
            start: isStart
        };
    }

    // ===============================================
    // WEBRTC REALTIME MULTIPLAYER SUBSYSTEM
    // ===============================================
    initNetworkListeners() {
        const net = window.networkEngine;
        if (!net) return;

        net.onConnected = (info) => {
            console.log('[Game] Connected to lobby!', info);
            this.mode = info.isHost ? 'ONLINE_HOST' : 'ONLINE_CLIENT';
            this.localSlot = info.slot || (info.isHost ? 1 : 2);
            this.maxMatchPlayers = info.maxPlayers || 2;
            this.updateOnlineHUD();
        };

        net.onMatchStart = (packet) => {
            console.log('[Game] Match start packet:', packet);
            this.mode = window.networkEngine.isHost ? 'ONLINE_HOST' : 'ONLINE_CLIENT';
            this.localSlot = window.networkEngine.mySlot || 1;
            this.maxMatchPlayers = packet.maxPlayers || window.networkEngine.maxPlayers || 2;

            const isEDF = (packet.isEDF || packet.gameType === 'EDF' || packet.weaponMode === 'EDF_COOP');
            if (isEDF) {
                this.isEDFMode = true;
                this.mode = 'EDF_COOP';
                this.player.maxHealth = 1000;
                this.player.health = 1000;

                if (this.arena && this.arena.loadMap) {
                    this.arena.loadMap('EDF');
                }
                if (this.edfZones && this.edfZones.root) {
                    this.edfZones.root.visible = true;
                }

                const sb = document.getElementById('top-scoreboard');
                if (sb) sb.style.display = 'none';
                const edfHud = document.getElementById('edf-wave-hud');
                if (edfHud) edfHud.style.display = 'flex';
                const loadoutBar = document.getElementById('edf-loadout-bar');
                if (loadoutBar) loadoutBar.style.display = 'flex';

                if (this.enemyStickman && this.enemyStickman.root) {
                    this.enemyStickman.root.visible = false;
                }
                for (let [_, opp] of this.opponents) {
                    if (opp.stickman && opp.stickman.root) {
                        this.scene.remove(opp.stickman.root);
                    }
                }
                this.opponents.clear();

                const playerList = packet.players || window.networkEngine.getPlayerList();
                for (let p of playerList) {
                    if (p.slot !== this.localSlot && p.connected) {
                        this.getOrCreateOpponent(p.slot, p.name);
                    }
                }

                this.setupEDFLoadoutForPlayerCount(this.maxMatchPlayers, this.localSlot);

                if (this.alienManager) {
                    this.alienManager.reset();
                    this.alienManager.startWave(1);
                }

                this.respawnLocalPlayer();
                this.updateHealthHUD();
                this.updateAmmoHUD();
                this.updateEDFWaveHUD();

                this.isPaused = false;
                const startScreen = document.getElementById('start-screen');
                if (startScreen) startScreen.style.display = 'none';
                const lobbyModal = document.getElementById('lobby-modal');
                if (lobbyModal) lobbyModal.style.display = 'none';

                this.updateOnlineHUD();
                this.showToast(`🐜 EDF CO-OP: ${this.maxMatchPlayers} PEMAIN! PERTAHANKAN BUMI DARI ALIEN!`);
                return;
            }

            this.isEDFMode = false;
            this.player.maxHealth = 100;
            this.player.health = 100;

            if (this.arena && this.arena.loadMap) {
                this.arena.loadMap('EDF');
            }
            if (this.edfZones && this.edfZones.root) {
                this.edfZones.root.visible = false;
            }

            if (packet.weaponMode) {
                this.setWeaponMode(packet.weaponMode);
            }
            this.matchDuration = packet.timer || 180;
            this.matchTimer = this.matchDuration;
            this.isGameOver = false;

            // Reset scores
            this.playerScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
            this.myScore = 0;
            this.enemyScore = 0;

            // Disable AI bot in online mode
            this.botController = null;
            if (this.enemyStickman && this.enemyStickman.root) {
                this.enemyStickman.root.visible = false;
            }

            // Clean existing opponents and register connected players
            for (let [_, opp] of this.opponents) {
                if (opp.stickman && opp.stickman.root) {
                    this.scene.remove(opp.stickman.root);
                }
            }
            this.opponents.clear();

            const playerList = packet.players || window.networkEngine.getPlayerList();
            for (let p of playerList) {
                if (p.slot !== this.localSlot && p.connected) {
                    this.getOrCreateOpponent(p.slot, p.name);
                }
            }

            // Set local player spawn with 3.5s respawn immunity
            this.respawnLocalPlayer();

            this.updateHealthHUD();
            this.updateScoreboard();
            this.updateTimerHUD();

            this.isPaused = false;
            const startScreen = document.getElementById('start-screen');
            if (startScreen) startScreen.style.display = 'none';
            const lobbyModal = document.getElementById('lobby-modal');
            if (lobbyModal) lobbyModal.style.display = 'none';

            this.updateOnlineHUD();
            this.showToast(`Pertandingan ${this.maxMatchPlayers} Pemain Dimulai! 3 Menit Duel!`);
        };

        net.onRemoteData = (packet) => {
            this.handleRemotePacket(packet);
        };

        net.onPingUpdate = (ping) => {
            const pingEl = document.getElementById('online-ping-display');
            if (pingEl) pingEl.innerText = `📶 ${ping}ms`;
        };

        const existingPlayerListHandler = net.onPlayerListUpdate;
        net.onPlayerListUpdate = (players) => {
            if (typeof existingPlayerListHandler === 'function') {
                existingPlayerListHandler(players);
            }
            this.syncPlayerNames(players);
        };

        net.onDisconnected = (reason) => {
            this.showToast(reason);
        };

        net.onError = (msg) => {
            this.showToast(`Error: ${msg}`);
        };
    }

    handleRemotePacket(packet) {
        if (!packet || !packet.type) return;

        switch (packet.type) {
            case 'STATE': {
                const senderSlot = packet.senderSlot || packet.slot;
                if (senderSlot && senderSlot !== this.localSlot) {
                    const opp = this.getOrCreateOpponent(senderSlot, packet.name);
                    if (opp && opp.stickman) {
                        if (packet.name && opp.name !== packet.name) {
                            opp.name = packet.name;
                            opp.stickman.name = packet.name;
                            if (opp.stickman.updateNameTag) {
                                opp.stickman.updateNameTag();
                            }
                        }
                        opp.stickman.targetPos.set(packet.x, packet.y, packet.z);
                        opp.stickman.targetYaw = packet.yaw;
                        opp.stickman.targetPitch = packet.pitch;
                        opp.stickman.isMoving = packet.isMoving;
                        opp.stickman.isGrounded = packet.isGrounded;
                        if (packet.weaponMode && opp.stickman.weaponMode !== packet.weaponMode) {
                            opp.stickman.setWeapon(packet.weaponMode);
                        }
                        if (opp.stickman.isDead && packet.hp > 0) {
                            opp.stickman.respawn(new THREE.Vector3(packet.x, packet.y, packet.z), !!packet.immune);
                        }
                        // Strictly sync immunity timer and shield from remote player's authoritative state
                        opp.stickman.immunityTimer = packet.immune ? 3.5 : 0;
                        if (opp.stickman.shieldMesh) {
                            opp.stickman.shieldMesh.visible = !!packet.immune;
                        }
                        opp.stickman.setHealth(packet.hp);
                    }
                }
                break;
            }

            case 'SET_NAME': {
                const senderSlot = packet.slot;
                if (senderSlot && senderSlot !== this.localSlot && packet.name) {
                    const opp = this.opponents.get(senderSlot);
                    if (opp) {
                        opp.name = packet.name;
                        if (opp.stickman) {
                            opp.stickman.name = packet.name;
                            if (opp.stickman.updateNameTag) {
                                opp.stickman.updateNameTag();
                            }
                        }
                    }
                    this.updateScoreboard();
                }
                break;
            }

            case 'RESPAWN': {
                const senderSlot = packet.senderSlot || packet.slot;
                if (senderSlot && senderSlot !== this.localSlot) {
                    const opp = this.getOrCreateOpponent(senderSlot);
                    if (opp && opp.stickman) {
                        const spawnPos = new THREE.Vector3(packet.x, packet.y, packet.z);
                        opp.stickman.respawn(spawnPos);
                        opp.stickman.targetPos.copy(spawnPos);
                        opp.stickman.yaw = packet.yaw || 0;
                        opp.stickman.targetYaw = packet.yaw || 0;
                        opp.stickman.setHealth(packet.hp || 100);
                    }
                }
                break;
            }

            case 'FIRE': {
                this.physics.spawnGrenade({
                    id: packet.id,
                    origin: new THREE.Vector3(packet.ox, packet.oy, packet.oz),
                    direction: new THREE.Vector3(packet.dx, packet.dy, packet.dz),
                    owner: packet.senderSlot || 'remote',
                    speed: packet.speed || 38.0
                });
                break;
            }

            case 'FIRE_SNIPER': {
                const fromPos = new THREE.Vector3(packet.ox, packet.oy, packet.oz);
                const toPos = new THREE.Vector3(packet.hx, packet.hy, packet.hz);
                this.vfx.createSniperTracer(fromPos, toPos, packet.isHeadshot);
                this.vfx.createBulletImpact(toPos, new THREE.Vector3(0, 1, 0), packet.isEntity);

                const distToMe = fromPos.distanceTo(this.camera.position);
                if (window.soundEngine) {
                    window.soundEngine.playSniperShot(distToMe);
                    if (packet.isHeadshot) {
                        window.soundEngine.playHeadshot();
                    }
                }
                break;
            }

            case 'DAMAGE': {
                if (packet.victimSlot === this.localSlot && !this.player.isDead) {
                    this.onLocalPlayerDamaged(packet.damage, packet.killerSlot || 'remote', packet.isDirect);
                }
                break;
            }

            case 'PLAYER_DEATH': {
                if (packet.isSuicide) {
                    this.playerScores[packet.victimSlot] = Math.max(-99, (this.playerScores[packet.victimSlot] || 0) - 1);
                    this.onKillfeed(this.getPlayerNameBySlot(packet.victimSlot), "BUNUH DIRI 💀 (-1 POIN)", false);
                } else {
                    this.playerScores[packet.killerSlot] = (this.playerScores[packet.killerSlot] || 0) + 1;
                    this.onKillfeed(this.getPlayerNameBySlot(packet.killerSlot), this.getPlayerNameBySlot(packet.victimSlot), packet.isDirect);
                }

                if (packet.victimSlot !== this.localSlot) {
                    const victimOpp = this.opponents.get(packet.victimSlot);
                    if (victimOpp && victimOpp.stickman && !victimOpp.stickman.isDead) {
                        victimOpp.stickman.triggerDeath();
                    }
                }
                const otherSlot = (this.localSlot === 1) ? 2 : 1;
                this.myScore = this.playerScores[this.localSlot] || 0;
                this.enemyScore = this.playerScores[otherSlot] || 0;
                this.updateScoreboard();
                break;
            }

            case 'TIME_SYNC': {
                if (typeof packet.timer === 'number') {
                    this.matchTimer = packet.timer;
                    this.updateTimerHUD();
                }
                break;
            }

            case 'RESTART': {
                if (packet.weaponMode) {
                    this.setWeaponMode(packet.weaponMode);
                }
                this.restartMatch();
                break;
            }
        }
    }

    /**
     * Switch Active Weapon Mode ('GRENADE' | 'SNIPER')
     */
    setWeaponMode(mode) {
        this.weaponMode = mode || 'GRENADE';
        if (this.weapon) {
            this.weapon.setMode(this.weaponMode);
        }
        if (this.enemyStickman) {
            this.enemyStickman.setWeapon(this.weaponMode);
        }
        if (this.botController) {
            this.botController.setDifficulty(this.botDifficulty || 'normal');
        }
        this.updateAmmoHUD();

        // Update tips
        const promptDesc = document.getElementById('prompt-pc-desc');
        if (promptDesc) {
            if (this.weaponMode === 'SNIPER') {
                promptDesc.innerHTML = `
                    <p><strong>W, A, S, D</strong> : Gerak &nbsp;|&nbsp; <strong>Shift</strong> : Sprint &nbsp;|&nbsp; <strong>Spasi</strong> : Lompat</p>
                    <p><strong>Klik Kiri</strong> : Tembak .50 Cal &nbsp;|&nbsp; <strong>Klik Kanan</strong> : Keker Scope (ADS) &nbsp;|&nbsp; <strong>R</strong> : Reload</p>
                `;
            } else {
                promptDesc.innerHTML = `
                    <p><strong>W, A, S, D</strong> : Gerak &nbsp;|&nbsp; <strong>Shift</strong> : Sprint &nbsp;|&nbsp; <strong>Spasi</strong> : Lompat</p>
                    <p><strong>Klik Kiri</strong> : Tembak &nbsp;|&nbsp; <strong>Klik Kanan</strong> : Keker (ADS) &nbsp;|&nbsp; <strong>R</strong> : Reload</p>
                `;
            }
        }
    }

    /**
     * Unified Weapon Fire Dispatcher with Med-Bay Lock Check
     */
    tryFireActiveWeapon() {
        if (this.player.isDead || this.isGameOver) return;

        // Area Isi Darah (Med-Bay) Weapon Lock Check:
        // "kalau mau isi darah harus ke area isi darah tapi ga bisa nembak jadi harus dilindungi atau bisa tau timing pas berdiri diatas isi darah setiap detik tambah 50HP"
        if (this.isEDFMode && this.edfZones && this.edfZones.isInsideMedBay(this.player.position)) {
            this.showToast("⚠️ SENJATA DIKUNCI DI AREA MED-BAY! Keluar dari area untuk menembak.");
            if (window.soundEngine) window.soundEngine.playMechanicalClick(0, 300, 0.05, 0.3);
            return;
        }

        const mode = this.weapon ? this.weapon.weaponMode : 'GRENADE';
        if (mode === 'ASSAULT_RIFLE') {
            this.tryFireAssaultRifle();
        } else if (mode === 'FLAMETHROWER') {
            this.tryFireFlamethrower();
        } else if (mode === 'LASER') {
            this.tryFireLaser();
        } else if (mode === 'BAZOOKA') {
            this.tryFireBazooka();
        } else if (mode === 'SNIPER') {
            this.tryFireSniper();
        } else {
            this.tryFireGrenade();
        }
    }

    /**
     * Local Player fires 35-Round Infinite Assault Rifle
     */
    tryFireAssaultRifle() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = 0.10; // Rapid ~10 rounds/sec
            if (window.soundEngine) window.soundEngine.playAssaultRifleShot();
            this.triggerGamepadRumble(40, 0.3, 0.4);

            const muzzle = this.weapon.getMuzzleWorldTransform();
            const rayOrigin = this.camera.position.clone();
            const rayDir = new THREE.Vector3();
            this.camera.getWorldDirection(rayDir);

            this.vfx.createMuzzleFlash(muzzle.pos, rayDir);

            // Raycast against arena colliders
            const ray = new THREE.Ray(rayOrigin, rayDir);
            let maxDist = 220;
            let hitPos = rayOrigin.clone().addScaledVector(rayDir, maxDist);

            if (this.arena && this.arena.colliders) {
                for (const box of this.arena.colliders) {
                    const hit = new THREE.Vector3();
                    if (ray.intersectBox(box, hit)) {
                        const d = rayOrigin.distanceTo(hit);
                        if (d < maxDist) {
                            maxDist = d;
                            hitPos = hit;
                        }
                    }
                }
            }

            // Check against active Aliens
            let hitAlien = null;
            if (this.isEDFMode && this.alienManager && this.alienManager.aliens) {
                for (let alien of this.alienManager.aliens) {
                    if (alien.isDead) continue;
                    const scale = alien.scale || 1.0;
                    const center = alien.root.position.clone().add(new THREE.Vector3(0, scale * 0.9, 0));
                    const sphere = new THREE.Sphere(center, scale * 0.95);
                    const inter = new THREE.Vector3();
                    if (ray.intersectSphere(sphere, inter)) {
                        const d = rayOrigin.distanceTo(inter);
                        if (d < maxDist) {
                            maxDist = d;
                            hitPos = inter;
                            hitAlien = alien;
                        }
                    }
                }
            }

            if (hitAlien) {
                const res = hitAlien.takeDamage(25, 'ASSAULT_RIFLE');
                this.vfx.createAlienBloodSplatter(hitPos, 6);
                if (res.isWeakness) {
                    this.vfx.spawnWeaknessCombatText(res.damage, hitPos, '🔫');
                } else {
                    this.vfx.spawnCombatText(Math.round(res.damage), hitPos, '#ffffff');
                }
                this.vfx.showHitmarker(false);
                if (window.soundEngine) window.soundEngine.playHitmarker(false);
            } else {
                this.vfx.createBulletImpact(hitPos, new THREE.Vector3(0, 1, 0), false);
            }

            // Realistic high-velocity bullet tracer projectile originating exactly from gun muzzle
            this.vfx.spawnRealisticBulletTracer(muzzle.pos, hitPos, 'ASSAULT_RIFLE', hitAlien !== null);

            // Pop brass shell casing from side ejection port
            const eject = this.weapon.getEjectionWorldTransform();
            this.vfx.spawnShellCasing(eject.pos, eject.dir);

            this.updateAmmoHUD();
        } else if (this.weapon.currentAmmo <= 0) {
            this.weapon.startReload();
            this.updateAmmoHUD();
        }
    }

    /**
     * Local Player fires Flamethrower (Cone Burn against Swarms)
     */
    tryFireFlamethrower() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = 0.08; // ~12 ticks/sec
            if (window.soundEngine) window.soundEngine.playFlamethrowerLoop();
            this.triggerGamepadRumble(25, 0.2, 0.25);

            const muzzle = this.weapon.getMuzzleWorldTransform();
            const aimDir = new THREE.Vector3();
            this.camera.getWorldDirection(aimDir);

            this.vfx.createFlameParticle(muzzle.pos, aimDir, 0.12);

            // Cone damage to active aliens in front
            if (this.isEDFMode && this.alienManager && this.alienManager.aliens) {
                const flameRange = 16.0;
                const cosAngle = Math.cos(THREE.MathUtils.degToRad(32));

                for (let alien of this.alienManager.aliens) {
                    if (alien.isDead) continue;
                    const toAlien = alien.root.position.clone().sub(this.camera.position);
                    const dist = toAlien.length();

                    if (dist <= flameRange) {
                        toAlien.normalize();
                        const dot = aimDir.dot(toAlien);
                        if (dot >= cosAngle) {
                            const res = alien.takeDamage(24, 'FLAMETHROWER');
                            if (res.isWeakness) {
                                this.vfx.spawnWeaknessCombatText(res.damage, alien.root.position, '🔥');
                                if (window.soundEngine) window.soundEngine.playWeaknessHit();
                            } else {
                                this.vfx.spawnCombatText(Math.round(res.damage), alien.root.position, '#ff5500');
                            }
                            this.vfx.createAlienBloodSplatter(alien.root.position, 3);
                            this.vfx.showHitmarker(res.isWeakness);
                        }
                    }
                }
            }
            this.updateAmmoHUD();
        }
    }

    /**
     * Local Player fires Laser Cannon (Piercing Directed Energy Beam)
     */
    tryFireLaser() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = 0.15;
            if (window.soundEngine) window.soundEngine.playLaserShot();
            this.triggerGamepadRumble(60, 0.45, 0.55);

            const muzzle = this.weapon.getMuzzleWorldTransform();
            const rayOrigin = this.camera.position.clone();
            const rayDir = new THREE.Vector3();
            this.camera.getWorldDirection(rayDir);

            const laserRange = 95.0;
            const endPos = rayOrigin.clone().addScaledVector(rayDir, laserRange);
            this.vfx.createLaserBeam(muzzle.pos, endPos);

            // Laser pierces multiple aliens in line
            if (this.isEDFMode && this.alienManager && this.alienManager.aliens) {
                const ray = new THREE.Ray(rayOrigin, rayDir);

                for (let alien of this.alienManager.aliens) {
                    if (alien.isDead) continue;
                    const scale = alien.scale || 1.0;
                    const center = alien.root.position.clone().add(new THREE.Vector3(0, scale * 0.9, 0));
                    const hitRadius = scale * 1.0;
                    const sphere = new THREE.Sphere(center, hitRadius);
                    const inter = new THREE.Vector3();

                    if (ray.intersectSphere(sphere, inter)) {
                        const res = alien.takeDamage(65, 'LASER');
                        if (res.isWeakness) {
                            this.vfx.spawnWeaknessCombatText(res.damage, inter, '⚡');
                            if (window.soundEngine) window.soundEngine.playWeaknessHit();
                        } else {
                            this.vfx.spawnCombatText(Math.round(res.damage), inter, '#00f0ff');
                        }
                        this.vfx.createAlienBloodSplatter(inter, 8);
                        this.vfx.showHitmarker(res.isWeakness);
                    }
                }
            }
            this.updateAmmoHUD();
        }
    }

    /**
     * Local Player fires Heavy Bazooka Rocket Launcher
     */
    tryFireBazooka() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = 0.85;
            this.triggerGamepadRumble(140, 0.8, 0.95);
            this.vfx.addTrauma(0.22);

            const muzzle = this.weapon.getMuzzleWorldTransform();
            const aimDir = new THREE.Vector3();
            this.camera.getWorldDirection(aimDir);

            this.vfx.createMuzzleFlash(muzzle.pos, aimDir);

            this.physics.spawnRocket({
                origin: muzzle.pos,
                direction: aimDir,
                owner: 'local',
                speed: 48.0
            });
            this.updateAmmoHUD();
        }
    }

    /**
     * Local Player fires grenade launcher
     */
    tryFireGrenade() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = this.fireCooldown;

            // Haptic feedback
            this.triggerGamepadRumble(80, 0.45, 0.75);
            if (navigator.vibrate) {
                try { navigator.vibrate(25); } catch (_) {}
            }

            // Get muzzle transform
            const muzzle = this.weapon.getMuzzleWorldTransform();

            // Calculate exact camera crosshair aim ray
            const aimDir = new THREE.Vector3();
            this.camera.getWorldDirection(aimDir);

            // Spawn local grenade
            const g = this.physics.spawnGrenade({
                origin: muzzle.pos,
                direction: aimDir,
                owner: 'local',
                speed: 38.0
            });

            // Muzzle flash VFX
            this.vfx.createMuzzleFlash(muzzle.pos, aimDir);

            // Sync over network if in online duel
            if (window.networkEngine && window.networkEngine.isConnected) {
                window.networkEngine.send({
                    type: 'FIRE',
                    id: g.id,
                    ox: muzzle.pos.x,
                    oy: muzzle.pos.y,
                    oz: muzzle.pos.z,
                    dx: aimDir.x,
                    dy: aimDir.y,
                    dz: aimDir.z,
                    speed: 38.0
                });
            }
        } else if (this.weapon.currentAmmo <= 0) {
            // Auto reload on empty click
            this.weapon.startReload();
        }
    }

    /**
     * Local Player fires .50 Cal Bolt-Action Tactical Sniper Rifle
     */
    tryFireSniper() {
        if (this.player.isDead || this.isGameOver) return;
        if (this.fireTimer > 0) return;

        const fired = this.weapon.triggerFire();
        if (fired) {
            this.fireTimer = 0.22; // Quick input buffer, bolt-action cooldown enforced by weapon.boltTimer

            // Sound
            if (window.soundEngine) {
                window.soundEngine.playSniperShot(0);
            }

            // Recoil Haptics & Screen Shake
            this.triggerGamepadRumble(170, 0.9, 0.95);
            if (navigator.vibrate) {
                try { navigator.vibrate(35); } catch (_) {}
            }
            this.vfx.addTrauma(0.18);

            // Get 3D muzzle world position and ejection port
            const muzzle = this.weapon.getMuzzleWorldTransform();
            const eject = this.weapon.getEjectionWorldTransform();
            this.vfx.spawnShellCasing(eject.pos, eject.dir);

            // Crosshair aim ray from camera
            const rayOrigin = this.camera.position.clone();
            const rayDir = new THREE.Vector3();
            this.camera.getWorldDirection(rayDir);

            // Muzzle flash VFX
            this.vfx.createMuzzleFlash(muzzle.pos, rayDir);

            // 1. Raycast against Arena geometry
            const ray = new THREE.Ray(rayOrigin, rayDir);
            let maxDist = 300;
            let wallHitPoint = null;
            let wallHitNormal = new THREE.Vector3(0, 1, 0);

            if (this.arena && this.arena.colliders) {
                for (const box of this.arena.colliders) {
                    const hit = new THREE.Vector3();
                    if (ray.intersectBox(box, hit)) {
                        const d = rayOrigin.distanceTo(hit);
                        if (d < maxDist) {
                            maxDist = d;
                            wallHitPoint = hit;
                            const eps = 0.08;
                            if (Math.abs(hit.x - box.min.x) < eps) wallHitNormal.set(-1, 0, 0);
                            else if (Math.abs(hit.x - box.max.x) < eps) wallHitNormal.set(1, 0, 0);
                            else if (Math.abs(hit.y - box.min.y) < eps) wallHitNormal.set(0, -1, 0);
                            else if (Math.abs(hit.y - box.max.y) < eps) wallHitNormal.set(0, 1, 0);
                            else if (Math.abs(hit.z - box.min.z) < eps) wallHitNormal.set(0, 0, -1);
                            else if (Math.abs(hit.z - box.max.z) < eps) wallHitNormal.set(0, 0, 1);
                        }
                    }
                }
            }

            // 2. Check Hit against all active Opponents
            let hitType = 'NONE'; // 'NONE', 'HEAD', 'BODY'
            let hitPos = null;
            let isHeadshot = false;
            let hitOpponent = null;

            const targets = (this.mode === 'BOT')
                ? [{ slot: 2, name: this.enemyStickman ? this.enemyStickman.name : 'BOT-OMEGA', stickman: this.enemyStickman }]
                : [...this.opponents.values()];

            for (let opp of targets) {
                const sm = opp.stickman;
                if (!sm || sm.isDead) continue;

                const enemyBase = sm.position.clone();

                // Head Sphere Hitbox: Center = enemyBase + (0, 1.72, 0), radius = 0.32
                const headCenter = enemyBase.clone().add(new THREE.Vector3(0, 1.72, 0));
                const headSphere = new THREE.Sphere(headCenter, 0.32);
                const headRay = new THREE.Ray(rayOrigin, rayDir);
                const headHitTarget = new THREE.Vector3();

                if (headRay.intersectSphere(headSphere, headHitTarget)) {
                    const distToHead = rayOrigin.distanceTo(headHitTarget);
                    if (distToHead < maxDist) {
                        hitType = 'HEAD';
                        isHeadshot = true;
                        hitPos = headHitTarget;
                        maxDist = distToHead;
                        hitOpponent = opp;
                    }
                }

                // Body Hitbox (if not headshot)
                if (hitType !== 'HEAD') {
                    const bodyBox = new THREE.Box3(
                        new THREE.Vector3(enemyBase.x - 0.45, enemyBase.y + 0.1, enemyBase.z - 0.45),
                        new THREE.Vector3(enemyBase.x + 0.45, enemyBase.y + 1.55, enemyBase.z + 0.45)
                    );
                    const bodyHitTarget = new THREE.Vector3();
                    if (headRay.intersectBox(bodyBox, bodyHitTarget)) {
                        const distToBody = rayOrigin.distanceTo(bodyHitTarget);
                        if (distToBody < maxDist) {
                            hitType = 'BODY';
                            isHeadshot = false;
                            hitPos = bodyHitTarget;
                            maxDist = distToBody;
                            hitOpponent = opp;
                        }
                    }
                }
            }

            // Check Hit against Aliens (if in EDF Mode)
            let hitAlien = null;
            if (this.isEDFMode && this.alienManager && this.alienManager.aliens) {
                for (let alien of this.alienManager.aliens) {
                    if (alien.isDead) continue;
                    const scale = alien.scale || 1.0;
                    const center = alien.root.position.clone().add(new THREE.Vector3(0, scale * 1.0, 0));
                    const sphere = new THREE.Sphere(center, scale * 1.0);
                    const inter = new THREE.Vector3();

                    if (ray.intersectSphere(sphere, inter)) {
                        const d = rayOrigin.distanceTo(inter);
                        if (d < maxDist) {
                            maxDist = d;
                            hitPos = inter;
                            hitAlien = alien;
                            isHeadshot = (inter.y > center.y + scale * 0.2);
                        }
                    }
                }
            }

            if (hitAlien) {
                const baseDmg = isHeadshot ? 400 : 220;
                const res = hitAlien.takeDamage(baseDmg, 'SNIPER');

                this.vfx.createSniperTracer(muzzle.pos, hitPos, isHeadshot);
                this.vfx.createBulletImpact(hitPos, rayDir.clone().negate(), true);
                this.vfx.createAlienBloodSplatter(hitPos, 12);

                if (res.isWeakness) {
                    this.vfx.spawnWeaknessCombatText(res.damage, hitPos, '🎯');
                    if (window.soundEngine) window.soundEngine.playWeaknessHit();
                } else if (isHeadshot) {
                    if (window.soundEngine) window.soundEngine.playHeadshot();
                    this.vfx.spawnCombatText(`HEADSHOT! -${Math.round(res.damage)}`, hitPos, '#ff0055', true);
                } else {
                    this.vfx.spawnCombatText(`-${Math.round(res.damage)}`, hitPos, '#00f0ff', false);
                }
                this.vfx.showHitmarker(isHeadshot || res.isWeakness);
                this.updateAmmoHUD();
                return;
            }

            // 3. Process Hit Outcomes
            if (hitType !== 'NONE' && hitOpponent) {
                const sm = hitOpponent.stickman;

                // Check opponent respawn immunity
                if (sm && sm.isImmune) {
                    this.vfx.createSniperTracer(muzzle.pos, hitPos, isHeadshot);
                    this.vfx.createBulletImpact(hitPos, rayDir.clone().negate(), true);
                    this.vfx.spawnCombatText("🛡️ KEBAL!", hitPos, "#00f0ff", true);
                    if (window.soundEngine) window.soundEngine.playShieldDeflect();
                    return;
                }

                const damage = isHeadshot ? 150 : 75;

                // Bullet Tracer & Impact
                this.vfx.createSniperTracer(muzzle.pos, hitPos, isHeadshot);
                this.vfx.createBulletImpact(hitPos, rayDir.clone().negate(), true);

                // Audio & Visual Hit Feedback
                if (isHeadshot) {
                    if (window.soundEngine) window.soundEngine.playHeadshot();
                    this.vfx.showHitmarker(true);
                    this.vfx.spawnCombatText("HEADSHOT! -150", hitPos, "#ff0055", true);
                } else {
                    if (window.soundEngine) window.soundEngine.playHitmarker(true);
                    this.vfx.showHitmarker(false);
                    this.vfx.spawnCombatText("-75", hitPos, "#00f0ff", false);
                }

                // Damage application
                if (this.mode === 'BOT') {
                    const sm = hitOpponent.stickman;
                    if (sm && !sm.isDead) {
                        sm.flinch();
                        const wasDead = sm.isDead;
                        const newHp = Math.max(0, sm.health - damage);
                        sm.setHealth(newHp);

                        if (newHp <= 0 && !wasDead) {
                            this.myScore++;
                            this.playerScores[1] = this.myScore;
                            this.updateScoreboard();
                            this.onKillfeed("HERO", sm.name, isHeadshot ? "HEADSHOT" : "SNIPER");

                            // Schedule Bot Respawn
                            if (!this.isGameOver) {
                                setTimeout(() => {
                                    if (this.mode === 'BOT' && !this.isGameOver) {
                                        const spawnIdx = 1 + Math.floor(Math.random() * (this.arena.spawnPoints.length - 1));
                                        sm.respawn(this.arena.spawnPoints[spawnIdx]);
                                        sm.yaw = this.arena.spawnYaws[spawnIdx];
                                        sm.targetYaw = this.arena.spawnYaws[spawnIdx];
                                    }
                                }, 2500);
                            }
                        }
                    }
                } else if (window.networkEngine && window.networkEngine.isConnected) {
                    if (hitOpponent.stickman) hitOpponent.stickman.flinch();
                    window.networkEngine.send({
                        type: 'FIRE_SNIPER',
                        ox: muzzle.pos.x,
                        oy: muzzle.pos.y,
                        oz: muzzle.pos.z,
                        hx: hitPos.x,
                        hy: hitPos.y,
                        hz: hitPos.z,
                        isHeadshot: isHeadshot,
                        isEntity: true
                    });
                    window.networkEngine.send({
                        type: 'DAMAGE',
                        victimSlot: hitOpponent.slot,
                        killerSlot: this.localSlot,
                        damage: damage,
                        isDirect: isHeadshot ? 'HEADSHOT' : 'SNIPER'
                    });
                }
            } else if (wallHitPoint) {
                // Hit arena obstacle / wall
                this.vfx.createSniperTracer(muzzle.pos, wallHitPoint, false);
                this.vfx.createBulletImpact(wallHitPoint, wallHitNormal, false);

                if (window.networkEngine && window.networkEngine.isConnected) {
                    window.networkEngine.send({
                        type: 'FIRE_SNIPER',
                        ox: muzzle.pos.x,
                        oy: muzzle.pos.y,
                        oz: muzzle.pos.z,
                        hx: wallHitPoint.x,
                        hy: wallHitPoint.y,
                        hz: wallHitPoint.z,
                        isHeadshot: false,
                        isEntity: false
                    });
                }
            } else {
                // Missed into skybox
                const skyPoint = rayOrigin.clone().add(rayDir.clone().multiplyScalar(250));
                this.vfx.createSniperTracer(muzzle.pos, skyPoint, false);

                if (window.networkEngine && window.networkEngine.isConnected) {
                    window.networkEngine.send({
                        type: 'FIRE_SNIPER',
                        ox: muzzle.pos.x,
                        oy: muzzle.pos.y,
                        oz: muzzle.pos.z,
                        hx: skyPoint.x,
                        hy: skyPoint.y,
                        hz: skyPoint.z,
                        isHeadshot: false,
                        isEntity: false
                    });
                }
            }
        } else if (this.weapon.currentAmmo <= 0 && !this.weapon.isReloading) {
            // Auto reload on empty click
            this.weapon.startReload();
        }
    }

    /**
     * Callback when any grenade deals damage to an enemy/bot
     */
    onDamageDealt(info) {
        if (info.owner !== 'local') return;

        // Hitmarker & Sound & Haptic
        this.vfx.showHitmarker(info.isDirect);
        if (window.soundEngine) {
            window.soundEngine.playHitmarker(info.isDirect);
        }

        this.triggerGamepadRumble(info.isDirect ? 120 : 60, 0.8, 0.3);

        // Floating combat text
        const text = info.isDirect ? `DIRECT HIT! -${info.damage}` : `-${info.damage}`;
        const color = info.isDirect ? '#ff3344' : '#ffcc00';
        this.vfx.spawnCombatText(text, info.hitPos, color, info.isDirect);

        const target = info.target;
        if (!target) return;

        // In BOT Mode, handle AI bot kill / suicide
        if (this.mode === 'BOT') {
            const wasDead = target.isDead;
            const newHp = Math.max(0, target.health - info.damage);
            target.setHealth(newHp);

            if (newHp <= 0 && !wasDead) {
                if (info.owner === 'bot') {
                    // Bot committed suicide -> -1 point
                    this.enemyScore = Math.max(-99, this.enemyScore - 1);
                    this.playerScores[2] = this.enemyScore;
                    this.updateScoreboard();
                    this.onKillfeed(target.name, "BUNUH DIRI 💀 (-1 POIN)", false);
                } else {
                    // Local player killed bot -> +1 point
                    this.myScore++;
                    this.playerScores[1] = this.myScore;
                    this.updateScoreboard();
                    this.onKillfeed("HERO", target.name, info.isDirect ? 'DIRECT HIT' : false);
                }

                // Schedule Bot Respawn after 2.5s
                if (!this.isGameOver) {
                    setTimeout(() => {
                        if (this.mode === 'BOT' && !this.isGameOver) {
                            const spawnIdx = 1 + Math.floor(Math.random() * (this.arena.spawnPoints.length - 1));
                            target.respawn(this.arena.spawnPoints[spawnIdx]);
                            target.yaw = this.arena.spawnYaws[spawnIdx];
                            target.targetYaw = this.arena.spawnYaws[spawnIdx];
                        }
                    }, 2500);
                }
            }
        } else if (window.networkEngine && window.networkEngine.isConnected) {
            // Visual flinch for damaged opponent on thrower's screen
            if (target && target.flinch) {
                target.flinch();
            }

            // In online PvP, do not set health locally (which triggers premature death & shield glitch).
            // Send authoritative DAMAGE packet to victim client.
            const victimSlot = target.slot || this.getSlotByStickman(target);
            if (victimSlot) {
                window.networkEngine.send({
                    type: 'DAMAGE',
                    victimSlot: victimSlot,
                    killerSlot: this.localSlot,
                    damage: info.damage,
                    isDirect: info.isDirect ? 'DIRECT HIT' : false
                });
            }
        }
    }

    /**
     * Callback when local player receives blast impulse (Rocket Jumping & Knockback)
     */
    onLocalPlayerImpulse(force) {
        this.player.velocity.add(force);
        this.player.isGrounded = false;
        this.blastRecoveryTimer = 0.55; // 0.55s of free ballistic flight!
        this.triggerGamepadRumble(130, 0.75, 0.5);
    }

    /**
     * Callback when local player takes blast damage or bullet damage
     */
    onLocalPlayerDamaged(amount, attacker, isDirect = false) {
        if (this.player.isDead || this.isGameOver) return;

        // Respawn Invincibility / Immunity check: 3.5s protection against spawn-killing
        if (this.player.immunityTimer > 0) {
            if (window.soundEngine) {
                window.soundEngine.playShieldDeflect();
            }
            const headPos = this.camera.position.clone();
            this.vfx.spawnCombatText("🛡️ KEBAL!", headPos, "#00f0ff", true);
            return;
        }

        this.player.health = Math.max(0, this.player.health - amount);
        this.updateHealthHUD();

        // Screen red vignette & audio hurt grunt & haptics
        this.triggerDamageVignette();
        this.triggerGamepadRumble(160, 0.7, 0.95);
        if (navigator.vibrate) {
            try { navigator.vibrate(40); } catch (_) {}
        }

        if (window.soundEngine) {
            window.soundEngine.playHurt(amount);
        }

        // Check local death
        if (this.player.health <= 0) {
            this.player.isDead = true;

            const isSuicide = (attacker === 'local');
            if (isSuicide) {
                // Self-inflicted grenade blast -> -1 Poin
                this.playerScores[this.localSlot] = Math.max(-99, (this.playerScores[this.localSlot] || 0) - 1);
                this.myScore = this.playerScores[this.localSlot];
                this.updateScoreboard();
                this.onKillfeed(this.getMyName(), "BUNUH DIRI 💀 (-1 POIN)", false);

                if (window.networkEngine && window.networkEngine.isConnected) {
                    window.networkEngine.send({
                        type: 'PLAYER_DEATH',
                        victimSlot: this.localSlot,
                        killerSlot: this.localSlot,
                        isSuicide: true
                    });
                }
            } else {
                // Eliminated by opponent -> killer gets +1 point
                let killerSlot = 2;
                if (typeof attacker === 'number') {
                    killerSlot = attacker;
                } else if (!isNaN(parseInt(attacker))) {
                    killerSlot = parseInt(attacker);
                } else if (attacker === 'bot') {
                    killerSlot = 2;
                } else {
                    killerSlot = (this.localSlot === 1) ? 2 : 1;
                }
                this.playerScores[killerSlot] = (this.playerScores[killerSlot] || 0) + 1;
                const otherSlot = (this.localSlot === 1) ? 2 : 1;
                this.myScore = this.playerScores[this.localSlot] || 0;
                this.enemyScore = this.playerScores[otherSlot] || 0;
                this.updateScoreboard();

                const killerName = this.getPlayerNameBySlot(killerSlot);
                this.onKillfeed(killerName, this.getMyName(), isDirect);

                if (window.networkEngine && window.networkEngine.isConnected) {
                    window.networkEngine.send({
                        type: 'PLAYER_DEATH',
                        victimSlot: this.localSlot,
                        killerSlot: killerSlot,
                        isDirect: isDirect,
                        isSuicide: false
                    });
                }
            }

            // Respawn local player after 2.5s
            if (!this.isGameOver) {
                setTimeout(() => {
                    this.respawnLocalPlayer();
                }, 2500);
            }
        }
    }

    respawnLocalPlayer() {
        this.player.isDead = false;
        this.player.health = this.player.maxHealth;
        this.player.velocity.set(0, 0, 0);
        this.blastRecoveryTimer = 0;
        this.player.immunityTimer = 3.5; // 3.5 detik immunity / invincible saat respawn

        if (window.soundEngine) {
            window.soundEngine.playShieldActivate();
        }
        this.updateShieldHUD();

        // Reset red damage & critical health vignettes on respawn
        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        const vig = document.getElementById('damage-vignette');
        if (vig) {
            vig.classList.remove('vignette-pulse', 'critical-health');
        }

        const spawnIdx = (this.mode === 'BOT')
            ? 0
            : ((this.localSlot - 1) % this.arena.spawnPoints.length);

        this.player.position.copy(this.arena.spawnPoints[spawnIdx]);
        this.player.yaw = this.arena.spawnYaws[spawnIdx];
        this.player.pitch = 0;

        this.updateHealthHUD();

        // Broadcast RESPAWN packet to remote opponents
        if (window.networkEngine && window.networkEngine.isConnected) {
            window.networkEngine.send({
                type: 'RESPAWN',
                slot: this.localSlot,
                x: this.player.position.x,
                y: this.player.position.y,
                z: this.player.position.z,
                yaw: this.player.yaw,
                hp: this.player.health
            });
        }
    }

    triggerDamageVignette() {
        const vig = document.getElementById('damage-vignette');
        if (!vig) return;
        vig.classList.add('vignette-pulse');
        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        this.vignetteTimer = setTimeout(() => {
            vig.classList.remove('vignette-pulse');
            if (this.player.health < 35 && !this.player.isDead) {
                vig.classList.add('critical-health');
            } else {
                vig.classList.remove('critical-health');
            }
        }, 320);
    }

    onKillfeed(killer, victim, isDirect) {
        const feed = document.getElementById('killfeed-container');
        if (!feed) return;

        const row = document.createElement('div');
        row.className = 'killfeed-row';
        let icon = '💣';
        if (isDirect === 'HEADSHOT') {
            icon = '🎯 HEADSHOT 💥';
        } else if (isDirect === 'DIRECT HIT' || isDirect === true) {
            icon = '💥 DIRECT HIT 💣';
        } else if (isDirect === 'SNIPER') {
            icon = '🎯 .50 CAL';
        } else if (isDirect) {
            icon = '🎯💥';
        }
        row.innerHTML = `<span class="kf-killer">${killer}</span> <span class="kf-icon">${icon}</span> <span class="kf-victim">${victim}</span>`;
        feed.appendChild(row);

        setTimeout(() => {
            if (row.parentNode) row.parentNode.removeChild(row);
        }, 4000);
    }

    updateHealthHUD() {
        const hpFill = document.getElementById('hud-health-fill');
        const hpNum = document.getElementById('hud-health-val');
        const hpRatio = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        if (hpFill) hpFill.style.width = `${hpRatio}%`;
        if (hpNum) hpNum.innerText = `${Math.max(0, Math.ceil(this.player.health))} / ${this.player.maxHealth}`;

        // Low health pulsing alert (< 30% of max health)
        const hpBar = document.getElementById('hud-health-bar');
        const vig = document.getElementById('damage-vignette');
        if (this.player.health < (this.player.maxHealth * 0.3) && !this.player.isDead) {
            if (hpBar) hpBar.classList.add('low-hp-pulse');
            if (vig && !vig.classList.contains('vignette-pulse')) {
                vig.classList.add('critical-health');
            }
        } else {
            if (hpBar) hpBar.classList.remove('low-hp-pulse');
            if (vig) vig.classList.remove('critical-health');
        }
    }

    updateAmmoHUD() {
        const ammoLabel = document.querySelector('.ammo-label');
        const cylinderDial = document.querySelector('.cylinder-dial');
        const sniperMag = document.querySelector('.sniper-mag-display');
        const ammoNum = document.getElementById('hud-ammo-val');

        if (!this.weapon) return;
        const curMode = this.weapon.weaponMode;

        if (curMode === 'ASSAULT_RIFLE') {
            if (ammoLabel) ammoLabel.innerText = 'ASSAULT RIFLE';
            if (cylinderDial) cylinderDial.style.display = 'none';
            if (sniperMag) sniperMag.style.display = 'none';
            if (ammoNum) {
                ammoNum.innerText = this.weapon.isReloading ? "RELOADING..." : `${this.weapon.currentAmmo} / 35 (∞)`;
            }
        } else if (curMode === 'FLAMETHROWER') {
            if (ammoLabel) ammoLabel.innerText = '🔥 FLAMETHROWER';
            if (cylinderDial) cylinderDial.style.display = 'none';
            if (sniperMag) sniperMag.style.display = 'none';
            if (ammoNum) ammoNum.innerText = `${this.weapon.currentAmmo} / 200`;
        } else if (curMode === 'LASER') {
            if (ammoLabel) ammoLabel.innerText = '⚡ LASER CANNON';
            if (cylinderDial) cylinderDial.style.display = 'none';
            if (sniperMag) sniperMag.style.display = 'none';
            if (ammoNum) ammoNum.innerText = `${this.weapon.currentAmmo} / 100`;
        } else if (curMode === 'BAZOOKA') {
            if (ammoLabel) ammoLabel.innerText = '🚀 BAZOOKA';
            if (cylinderDial) cylinderDial.style.display = 'none';
            if (sniperMag) sniperMag.style.display = 'none';
            if (ammoNum) ammoNum.innerText = `${this.weapon.currentAmmo} / 15`;
        } else if (curMode === 'SNIPER') {
            if (ammoLabel) ammoLabel.innerText = '🎯 .50 CAL MAGNUM';
            if (cylinderDial) cylinderDial.style.display = 'none';
            if (sniperMag) sniperMag.style.display = 'flex';

            const bulletNodes = document.querySelectorAll('.sniper-bullet-pip');
            bulletNodes.forEach((node, idx) => {
                if (idx < (this.weapon.currentAmmo % 6)) {
                    node.classList.add('loaded');
                    node.classList.remove('empty');
                } else {
                    node.classList.remove('loaded');
                    node.classList.add('empty');
                }
            });

            if (ammoNum) {
                ammoNum.innerText = `${this.weapon.currentAmmo} / ${this.weapon.maxAmmo}`;
                if (this.weapon.isReloading) {
                    ammoNum.innerText = "RELOADING...";
                } else if (this.weapon.boltTimer > 0) {
                    ammoNum.innerText = "BOLT CYCLE...";
                }
            }
        } else {
            if (ammoLabel) ammoLabel.innerText = '40MM GRENADE';
            if (cylinderDial) cylinderDial.style.display = 'flex';
            if (sniperMag) sniperMag.style.display = 'none';

            // 6 chambers in the revolving cylinder UI
            const chamberNodes = document.querySelectorAll('.cylinder-chamber');
            chamberNodes.forEach((node, idx) => {
                if (idx < this.weapon.currentAmmo) {
                    node.classList.add('loaded');
                    node.classList.remove('empty');
                } else {
                    node.classList.remove('loaded');
                    node.classList.add('empty');
                }
            });

            if (ammoNum) {
                ammoNum.innerText = `${this.weapon.currentAmmo} / 6`;
                if (this.weapon.isReloading) {
                    ammoNum.innerText = "RELOADING...";
                }
            }
        }

        if (this.isEDFMode) {
            this.updateEDFLoadoutHUD();
        }
    }

    updateScoreboard() {
        const board = document.getElementById('top-scoreboard');
        if (!board) return;

        if (this.mode !== 'BOT' && this.maxMatchPlayers > 2) {
            // Multi-Player Dynamic Scoreboard (3 or 4 Players)
            const playerList = window.networkEngine ? window.networkEngine.getPlayerList() : [];
            const timerHtml = `<div class="score-center"><div id="match-timer" class="match-timer">${this.formatTimer()}</div><span class="score-vs">FFA</span></div>`;

            const pills = playerList.filter(p => p.connected || p.isMe).map(p => {
                const conf = SLOT_CONFIG[p.slot] || { hex: '#fff', name: `P${p.slot}` };
                const score = this.playerScores[p.slot] || 0;
                const isMe = (p.slot === this.localSlot);
                const displayName = isMe ? (this.localPlayerName || 'KAMU') : (p.name || `P${p.slot}`);
                return `
                    <div class="player-score-pill" style="border-color: ${conf.hex}; color: ${conf.hex};">
                        <span class="slot-color-dot" style="background: ${conf.hex};"></span>
                        <span>${displayName}:</span>
                        <span class="pill-score" style="color: #fff;">${score}</span>
                    </div>
                `;
            });

            const half = Math.ceil(pills.length / 2);
            const leftPills = pills.slice(0, half).join('');
            const rightPills = pills.slice(half).join('');

            board.innerHTML = `<div style="display:flex;gap:8px;align-items:center;">${leftPills}</div>${timerHtml}<div style="display:flex;gap:8px;align-items:center;">${rightPills}</div>`;
        } else {
            // 2-Player or Solo Bot Scoreboard
            const s1 = document.getElementById('score-player');
            const s2 = document.getElementById('score-enemy');
            const s1Name = document.getElementById('score-hero-name');
            const s2Name = document.getElementById('score-enemy-name');

            if (s1Name) {
                s1Name.innerText = (this.localPlayerName || 'HERO') + ' (KAMU)';
            }
            if (s1) s1.innerText = (this.mode === 'BOT') ? this.myScore : (this.playerScores[this.localSlot] || 0);
            if (s2) {
                if (this.mode === 'BOT') {
                    s2.innerText = this.enemyScore;
                    if (s2Name) s2Name.innerText = this.enemyStickman ? this.enemyStickman.name : 'BOT-OMEGA';
                } else {
                    const otherSlot = (this.localSlot === 1) ? 2 : 1;
                    s2.innerText = this.playerScores[otherSlot] || 0;
                    if (s2Name) {
                        const otherOpp = this.opponents.get(otherSlot);
                        if (otherOpp && otherOpp.name) {
                            s2Name.innerText = otherOpp.name;
                        } else if (window.networkEngine) {
                            const otherPlayer = window.networkEngine.getPlayerList().find(p => p.slot === otherSlot);
                            if (otherPlayer && otherPlayer.name) {
                                s2Name.innerText = otherPlayer.name;
                            }
                        }
                    }
                }
            }
        }
    }

    updateOnlineHUD() {
        const pill = document.getElementById('online-status-pill');
        const roomCodeEl = document.getElementById('online-room-code');
        const roleLabel = document.getElementById('online-role-label');
        if (pill) {
            pill.style.display = (this.mode !== 'BOT') ? 'flex' : 'none';
        }
        if (roomCodeEl && window.networkEngine) {
            roomCodeEl.innerText = window.networkEngine.roomCode || '';
        }
        if (roleLabel) {
            roleLabel.innerText = (this.mode === 'ONLINE_HOST') ? '👑 HOST' : `⚔️ P${this.localSlot}`;
        }
    }

    updateTimerHUD() {
        const timerEl = document.getElementById('match-timer');
        if (!timerEl) return;
        const totalSecs = Math.max(0, Math.ceil(this.matchTimer));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (totalSecs <= 30) {
            timerEl.classList.add('timer-danger');
        } else {
            timerEl.classList.remove('timer-danger');
        }
    }

    endMatchByTime() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        const modal = document.getElementById('game-over-modal');
        const title = document.getElementById('game-over-title');
        const desc = document.getElementById('game-over-desc');
        const duoBox = document.getElementById('go-duo-score-box');
        const leaderboard = document.getElementById('go-leaderboard');

        // Compile all players ranking
        let rankings = [];
        if (this.mode === 'BOT') {
            rankings = [
                { slot: 1, name: 'KAMU (HERO)', hex: '#00f0ff', score: this.myScore, isMe: true },
                { slot: 2, name: this.enemyStickman ? this.enemyStickman.name : 'BOT-OMEGA', hex: '#ff2244', score: this.enemyScore, isMe: false }
            ];
        } else {
            const playerList = window.networkEngine ? window.networkEngine.getPlayerList() : [];
            rankings = playerList.filter(p => p.connected || p.isMe).map(p => {
                const conf = SLOT_CONFIG[p.slot] || { name: `P${p.slot}`, hex: '#fff' };
                return {
                    slot: p.slot,
                    name: (p.slot === this.localSlot) ? 'KAMU' : conf.name,
                    hex: conf.hex,
                    score: this.playerScores[p.slot] || 0,
                    isMe: (p.slot === this.localSlot)
                };
            });
        }

        // Sort descending by score
        rankings.sort((a, b) => b.score - a.score);

        const winner = rankings[0];
        const isWinner = winner && winner.isMe;
        const isDraw = rankings.length > 1 && rankings[0].score === rankings[1].score;

        if (isDraw) {
            if (title) { title.innerText = "DRAW / SERI!"; title.style.color = "#ffaa00"; }
            if (desc) desc.innerText = `Waktu 3 menit telah berakhir! Pertandingan berakhir imbang!`;
            if (window.soundEngine) window.soundEngine.playDefeat();
        } else if (isWinner) {
            if (title) { title.innerText = "VICTORY!"; title.style.color = "#00f0ff"; }
            if (desc) desc.innerText = `Selamat! Kamu memenangkan pertandingan dengan skor tertinggi (${winner.score} Poin)!`;
            if (window.soundEngine) window.soundEngine.playVictory();
        } else {
            if (title) { title.innerText = "DEFEAT!"; title.style.color = "#ff2244"; }
            if (desc) desc.innerText = `Waktu 3 menit habis! ${winner.name} memenangkan duel dengan ${winner.score} Poin.`;
            if (window.soundEngine) window.soundEngine.playDefeat();
        }

        // Leaderboard display
        if (leaderboard) {
            leaderboard.style.display = 'flex';
            leaderboard.innerHTML = rankings.map((r, idx) => `
                <div class="leaderboard-row ${idx === 0 ? 'rank-1' : ''}">
                    <span style="display:flex;align-items:center;gap:8px;">
                        <span class="rank-tag">${idx === 0 ? '👑' : '#' + (idx + 1)}</span>
                        <span class="slot-color-dot" style="background: ${r.hex};"></span>
                        <span style="color: ${r.hex || '#fff'}; font-weight: bold;">${r.name}</span>
                    </span>
                    <span style="font-weight: 900; font-size: 16px;">${r.score} POIN</span>
                </div>
            `).join('');
        }

        if (duoBox) duoBox.style.display = 'none';
        if (modal) modal.style.display = 'flex';

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    // ========================================================
    // EDF ALIEN CO-OP & LOADOUT MANAGEMENT
    // ========================================================

    switchWeaponSlot(slotIdx) {
        if (!this.weapon) return;
        const switched = this.weapon.switchToSlot(slotIdx);
        if (switched) {
            this.setWeaponMode(this.weapon.weaponMode);
            this.updateEDFLoadoutHUD();
            this.updateAmmoHUD();
            if (window.soundEngine) window.soundEngine.playMechanicalClick(0, 1600, 0.04, 0.3);
        }
    }

    switchWeaponNext() {
        if (!this.weapon) return;
        this.weapon.nextWeapon();
        this.setWeaponMode(this.weapon.weaponMode);
        this.updateEDFLoadoutHUD();
        this.updateAmmoHUD();
        if (window.soundEngine) window.soundEngine.playMechanicalClick(0, 1600, 0.04, 0.3);
    }

    switchWeaponPrev() {
        if (!this.weapon) return;
        this.weapon.prevWeapon();
        this.setWeaponMode(this.weapon.weaponMode);
        this.updateEDFLoadoutHUD();
        this.updateAmmoHUD();
        if (window.soundEngine) window.soundEngine.playMechanicalClick(0, 1600, 0.04, 0.3);
    }

    /**
     * Special Weapon Allocation rules based on Player Count:
     * - Solo (1P): carries ALL 4 special weapons (AR + Flame + Laser + Bazooka + Sniper)
     * - Duo (2P): each carries 2 special weapons per person + AR
     * - Trio (3P): Host carries 2 special weapons, Guests carry 1 each + AR
     * - 4 Players: each carries 1 unique special weapon + AR
     */
    setupEDFLoadoutForPlayerCount(pCount = 1, mySlot = 1) {
        if (pCount === 1) {
            // Solo: carries all 4 special weapons
            this.weapon.setLoadout(['ASSAULT_RIFLE', 'FLAMETHROWER', 'LASER', 'BAZOOKA', 'SNIPER']);
        } else if (pCount === 2) {
            // Duo: 2 special weapons per player
            if (mySlot === 1) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'FLAMETHROWER', 'LASER']);
            } else {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'BAZOOKA', 'SNIPER']);
            }
        } else if (pCount === 3) {
            // Trio: Host 2, others 1
            if (mySlot === 1) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'FLAMETHROWER', 'LASER']);
            } else if (mySlot === 2) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'BAZOOKA']);
            } else {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'SNIPER']);
            }
        } else {
            // 4 Players: each carries 1 special weapon
            if (mySlot === 1) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'FLAMETHROWER']);
            } else if (mySlot === 2) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'LASER']);
            } else if (mySlot === 3) {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'BAZOOKA']);
            } else {
                this.weapon.setLoadout(['ASSAULT_RIFLE', 'SNIPER']);
            }
        }
        this.updateEDFLoadoutHUD();
    }

    updateEDFLoadoutHUD() {
        const bar = document.getElementById('edf-loadout-bar');
        if (!bar || !this.weapon || !this.weapon.loadout) return;

        const WEAPON_META = {
            'ASSAULT_RIFLE': { name: 'AR-35', icon: '🔫' },
            'FLAMETHROWER': { name: 'FLAME', icon: '🔥' },
            'LASER': { name: 'LASER', icon: '⚡' },
            'BAZOOKA': { name: 'BAZOOKA', icon: '🚀' },
            'SNIPER': { name: 'SNIPER', icon: '🎯' }
        };

        bar.innerHTML = this.weapon.loadout.map((wKey, idx) => {
            const meta = WEAPON_META[wKey] || { name: wKey, icon: '⚔️' };
            const isActive = (this.weapon.weaponMode === wKey);
            const pool = this.weapon.ammoPools[wKey] || { current: 0, max: 0 };
            const ammoStr = (wKey === 'ASSAULT_RIFLE') ? `${pool.current}/35(∞)` : `${pool.current}`;

            return `
                <div class="edf-slot-pill ${isActive ? 'active' : ''}" data-slot="${idx}">
                    <span class="slot-key">${idx + 1}</span>
                    <span class="slot-icon">${meta.icon}</span>
                    <span class="slot-name">${meta.name}</span>
                    <span class="slot-ammo">${ammoStr}</span>
                </div>
            `;
        }).join('');

        bar.querySelectorAll('.edf-slot-pill').forEach(pill => {
            const handleSwitch = (e) => {
                if (e.type === 'touchstart') e.preventDefault();
                const slot = parseInt(pill.getAttribute('data-slot'));
                this.switchWeaponSlot(slot);
            };
            pill.addEventListener('click', handleSwitch);
            pill.addEventListener('touchstart', handleSwitch, { passive: false });
        });
    }

    updateEDFWaveHUD() {
        if (!this.isEDFMode || !this.alienManager) return;

        const waveNumEl = document.getElementById('edf-wave-number');
        const swarmStatusEl = document.getElementById('edf-swarm-status');
        const bossCard = document.getElementById('edf-boss-card');
        const bossNameEl = document.getElementById('edf-boss-name');
        const bossWeaknessBadge = document.getElementById('edf-boss-weakness');
        const bossHpFill = document.getElementById('edf-boss-hp-fill');
        const bossHpText = document.getElementById('edf-boss-hp-text');

        if (waveNumEl) {
            waveNumEl.innerText = `WAVE ${this.alienManager.currentWave} / ${this.alienManager.maxWaves}`;
        }

        const aliveCount = this.alienManager.aliens.filter(a => !a.isDead && !a.isBoss).length;
        if (swarmStatusEl) {
            if (this.alienManager.phase === 'INTERMISSION') {
                const sec = Math.ceil(this.alienManager.intermissionTimer);
                swarmStatusEl.innerHTML = `⏱️ JEDA: WAVE BERIKUTNYA DALAM <strong>${sec}s</strong>`;
            } else if (this.alienManager.phase === 'BOSS') {
                swarmStatusEl.innerHTML = `⚠️ <strong style="color: #ff2244;">BOS AKTIF! HABISI SEKARANG!</strong>`;
            } else {
                swarmStatusEl.innerHTML = `🐜 SWARM: <strong>${aliveCount}</strong> ALIEN TERSISA`;
            }
        }

        // Top Boss Card & Weakness Display
        if (bossCard) {
            if (this.alienManager.currentBoss && !this.alienManager.currentBoss.isDead) {
                bossCard.style.display = 'flex';
                const b = this.alienManager.currentBoss;
                if (bossNameEl) bossNameEl.innerText = b.name;

                if (bossWeaknessBadge) {
                    const w = (typeof WEAKNESS_TYPES !== 'undefined') ? (WEAKNESS_TYPES[b.weakness] || WEAKNESS_TYPES.FLAMETHROWER) : { icon: '🔥', label: 'FLAME', color: '#ff5500' };
                    bossWeaknessBadge.innerHTML = `<span style="font-size: 14px;">${w.icon}</span> LEMAH: ${w.label} (3x DMG!)`;
                    bossWeaknessBadge.style.color = w.color;
                    bossWeaknessBadge.style.borderColor = w.color;
                }

                const ratio = Math.max(0, b.health / b.maxHealth);
                if (bossHpFill) bossHpFill.style.width = `${ratio * 100}%`;
                if (bossHpText) bossHpText.innerText = `${Math.ceil(b.health)} / ${b.maxHealth} HP`;
            } else {
                bossCard.style.display = 'none';
            }
        }

        // Zone status badges in HUD
        const medBayBadge = document.getElementById('hud-medbay-badge');
        const ammoDepotBadge = document.getElementById('hud-ammo-depot-badge');

        if (this.edfZones) {
            const inMedBay = this.edfZones.isInsideMedBay(this.player.position);
            if (medBayBadge) {
                if (inMedBay) {
                    medBayBadge.className = 'zone-pill medbay active-healing';
                    medBayBadge.innerHTML = '➕ <strong>MED-BAY REGENERATING (+50 HP/s)</strong> <span style="color:#ff3333;">[SENJATA DIKUNCI]</span>';
                } else {
                    medBayBadge.className = 'zone-pill medbay';
                    medBayBadge.innerHTML = '➕ MED-BAY (ISI DARAH)';
                }
            }

            if (ammoDepotBadge) {
                if (this.edfZones.isAmmoDepotOpen) {
                    const s = Math.ceil(this.edfZones.ammoTimer);
                    ammoDepotBadge.className = 'zone-pill ammo-depot open-alert';
                    ammoDepotBadge.innerHTML = `🔓 <strong>AMMO DEPOT DIBUKA! (${s}s)</strong>`;
                } else {
                    const formatted = this.edfZones.formatTime(this.edfZones.ammoTimer);
                    ammoDepotBadge.className = 'zone-pill ammo-depot';
                    ammoDepotBadge.innerHTML = `🔒 AMMO DEPOT: ${formatted}`;
                }
            }
        }
    }

    onAlienDamagedPlayer(amount, attacker) {
        if (this.player.isDead || this.isGameOver) return;
        if (this.player.immunityTimer > 0) return;

        this.player.health = Math.max(0, this.player.health - amount);
        this.triggerDamageVignette();
        if (this.vfx) this.vfx.addTrauma(0.18);
        this.triggerGamepadRumble(120, 0.6, 0.85);

        if (window.soundEngine) {
            window.soundEngine.playHurt(amount);
        }

        this.updateHealthHUD();

        if (this.player.health <= 0) {
            this.player.isDead = true;
            this.player.health = 0;
            this.updateHealthHUD();
            this.showToast(`☠️ Gugur diserang ${attacker}!`);

            if (this.mode === 'EDF_SOLO') {
                this.isGameOver = true;
                this.isPaused = true;
                if (document.pointerLockElement) document.exitPointerLock();

                const modal = document.getElementById('game-over-modal');
                const title = document.getElementById('game-over-title');
                const desc = document.getElementById('game-over-desc');
                const duoBox = document.getElementById('go-duo-score-box');
                const leaderboard = document.getElementById('go-leaderboard');

                if (title) {
                    title.innerText = 'MISSION FAILED';
                    title.style.color = '#ff2244';
                }
                if (desc) {
                    desc.innerText = `Kamu gugur di Wave ${this.alienManager.currentWave}! Coba lagi untuk menaklukkan 20 Wave!`;
                }
                if (duoBox) duoBox.style.display = 'none';
                if (leaderboard) leaderboard.style.display = 'none';
                if (modal) modal.style.display = 'flex';
            } else {
                setTimeout(() => {
                    if (this.isEDFMode && !this.isGameOver) {
                        this.respawnLocalPlayer();
                    }
                }, 8000);
            }
        }
    }

    endEDFVictory() {
        this.isGameOver = true;
        this.isPaused = true;
        if (document.pointerLockElement) document.exitPointerLock();

        const modal = document.getElementById('game-over-modal');
        const title = document.getElementById('game-over-title');
        const desc = document.getElementById('game-over-desc');
        const duoBox = document.getElementById('go-duo-score-box');
        const leaderboard = document.getElementById('go-leaderboard');

        if (title) {
            title.innerText = '🏆 EARTH DEFENSE FORCE: VICTORY!';
            title.style.color = '#00ff88';
        }
        if (desc) {
            desc.innerText = 'SELAMAT! KAMU DAN SQUAD BERHASIL MENYELESAIKAN SEMUA 20 WAVE DAN MENYELAMATKAN BUMI DARI INVASI ALIEN!';
        }
        if (duoBox) duoBox.style.display = 'none';
        if (leaderboard) leaderboard.style.display = 'none';
        if (modal) modal.style.display = 'flex';
    }

    startMatch(mode = 'BOT', difficulty = 'normal', weaponMode = null) {
        this.mode = mode;
        this.localSlot = 1;
        this.maxMatchPlayers = 2;

        this.playerScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.myScore = 0;
        this.enemyScore = 0;
        this.matchTimer = this.matchDuration;
        this.isGameOver = false;
        this.isPaused = false;
        this.blastRecoveryTimer = 0;

        const modal = document.getElementById('game-over-modal');
        if (modal) modal.style.display = 'none';

        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        const vig = document.getElementById('damage-vignette');
        if (vig) vig.classList.remove('vignette-pulse', 'critical-health');

        if (window.soundEngine && !window.soundEngine.initialized) {
            window.soundEngine.init();
        }

        if (mode === 'EDF_SOLO' || mode === 'EDF_COOP') {
            this.isEDFMode = true;
            this.player.maxHealth = 1000;
            this.player.health = 1000;

            // Load Dedicated EDF Outpost Battlefield & Enable EDF Zones
            if (this.arena && this.arena.loadMap) {
                this.arena.loadMap('EDF');
            }
            if (this.edfZones && this.edfZones.root) {
                this.edfZones.root.visible = true;
            }

            const sb = document.getElementById('top-scoreboard');
            if (sb) sb.style.display = 'none';
            const edfHud = document.getElementById('edf-wave-hud');
            if (edfHud) edfHud.style.display = 'flex';
            const loadoutBar = document.getElementById('edf-loadout-bar');
            if (loadoutBar) loadoutBar.style.display = 'flex';

            if (this.enemyStickman && this.enemyStickman.root) {
                this.enemyStickman.root.visible = false;
            }
            for (let [_, opp] of this.opponents) {
                if (mode === 'EDF_SOLO' && opp.stickman && opp.stickman.root) {
                    this.scene.remove(opp.stickman.root);
                }
            }
            if (mode === 'EDF_SOLO') this.opponents.clear();

            const pCount = (mode === 'EDF_COOP') ? this.maxMatchPlayers : 1;
            this.setupEDFLoadoutForPlayerCount(pCount, this.localSlot);

            if (this.alienManager) {
                this.alienManager.reset();
                this.alienManager.startWave(1);
            }

            this.updateHealthHUD();
            this.updateAmmoHUD();
            this.updateEDFWaveHUD();
            this.showToast('🐜 EDF MODE: ALIEN INVASION DIMULAI! BERTAHAN HINGGA WAVE 20!');
        } else {
            this.isEDFMode = false;
            this.player.maxHealth = 100;
            this.player.health = 100;

            // Load Unified EDF Outpost "Aegis" Map & Disable Alien Wave Zones in PvP
            if (this.arena && this.arena.loadMap) {
                this.arena.loadMap('EDF');
            }
            if (this.edfZones && this.edfZones.root) {
                this.edfZones.root.visible = false;
            }

            const sb = document.getElementById('top-scoreboard');
            if (sb) sb.style.display = 'flex';
            const edfHud = document.getElementById('edf-wave-hud');
            if (edfHud) edfHud.style.display = 'none';
            const loadoutBar = document.getElementById('edf-loadout-bar');
            if (loadoutBar) loadoutBar.style.display = 'none';

            if (this.alienManager) {
                this.alienManager.reset();
            }

            if (weaponMode) {
                this.setWeaponMode(weaponMode);
            } else {
                this.setWeaponMode(this.weaponMode || 'GRENADE');
            }

            this.updateScoreboard();
            this.updateTimerHUD();

            if (mode === 'BOT') {
                this.botDifficulty = difficulty;
                if (this.botController) {
                    this.botController.setDifficulty(difficulty);
                }
                if (this.enemyStickman) {
                    this.enemyStickman.name = "BOT-OMEGA";
                    this.enemyStickman.visorColor = 0xff2244;
                    if (this.enemyStickman.root) this.enemyStickman.root.visible = true;
                    this.enemyStickman.updateNameTag();
                    this.enemyStickman.respawn(this.arena.spawnPoints[1]);
                }
                const enemyNameEl = document.getElementById('score-enemy-name');
                if (enemyNameEl && this.enemyStickman) {
                    enemyNameEl.innerText = this.enemyStickman.name;
                }
                for (let [_, opp] of this.opponents) {
                    if (opp.stickman && opp.stickman.root) {
                        this.scene.remove(opp.stickman.root);
                    }
                }
                this.opponents.clear();
            }

            this.showToast(mode === 'BOT' ? '⚔️ Latihan Bot 3 Menit Dimulai! Skor Terbanyak Menang!' : '⚔️ Duel 3 Menit Dimulai!');
        }

        this.respawnLocalPlayer();
        this.isPaused = false;

        const lockPrompt = document.getElementById('pointer-lock-prompt');
        if (lockPrompt && !this.isTouchDevice) {
            lockPrompt.style.display = 'flex';
        }
    }

    restartMatch() {
        this.playerScores = { 1: 0, 2: 0, 3: 0, 4: 0 };
        this.myScore = 0;
        this.enemyScore = 0;
        this.matchTimer = this.matchDuration;
        this.isGameOver = false;
        this.isPaused = false;
        this.blastRecoveryTimer = 0;

        const modal = document.getElementById('game-over-modal');
        if (modal) modal.style.display = 'none';

        if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
        const vig = document.getElementById('damage-vignette');
        if (vig) vig.classList.remove('vignette-pulse', 'critical-health');

        if (this.arena && this.arena.loadMap) {
            this.arena.loadMap('EDF');
        }
        if (this.edfZones && this.edfZones.root) {
            this.edfZones.root.visible = this.isEDFMode;
        }

        if (this.isEDFMode) {
            this.player.maxHealth = 1000;
            this.player.health = 1000;
            this.respawnLocalPlayer();

            if (this.alienManager) {
                this.alienManager.reset();
                this.alienManager.startWave(1);
            }
            this.updateEDFWaveHUD();
            this.updateEDFLoadoutHUD();
            this.updateHealthHUD();
            this.updateAmmoHUD();
            this.showToast('🐜 EDF MODE: WAVE 1 DIMULAI KEMBALI!');
        } else {
            this.setWeaponMode(this.weaponMode);
            this.updateScoreboard();
            this.updateTimerHUD();
            this.respawnLocalPlayer();

            if (this.mode === 'BOT') {
                if (this.enemyStickman) {
                    this.enemyStickman.respawn(this.arena.spawnPoints[1]);
                }
            } else {
                for (let [slot, opp] of this.opponents) {
                    if (opp.stickman) {
                        const spawnIdx = (slot - 1) % this.arena.spawnPoints.length;
                        opp.stickman.respawn(this.arena.spawnPoints[spawnIdx]);
                    }
                }
            }

            if (window.networkEngine && window.networkEngine.isConnected && window.networkEngine.isHost) {
                window.networkEngine.send({ type: 'RESTART', weaponMode: this.weaponMode });
            }

            this.showToast('⚔️ Pertandingan 3 Menit Dimulai! Skor Terbanyak Menang!');
        }
    }

    showToast(msg) {
        const toast = document.getElementById('game-toast');
        if (!toast) return;
        toast.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /**
     * Local Player Physics & Locomotion Update (Keyboard + Touch + Gamepad)
     */
    updateLocalPlayerPhysics(dt) {
        if (this.player.isDead) return;

        // Poll Gamepad Controller Inputs
        const pad = this.pollGamepadState(dt);

        // 1. Determine Movement Direction from Inputs
        let moveX = 0;
        let moveZ = 0;

        // Keyboard
        if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ -= 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;

        // Virtual Touch Joystick input
        if (window.touchMoveVector) {
            moveX += window.touchMoveVector.x;
            moveZ += window.touchMoveVector.y;
        }

        // Gamepad Left Stick / D-Pad input
        if (pad) {
            moveX += pad.moveX;
            moveZ += pad.moveZ;
        }

        const isMoving = (Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05);

        // Sprinting
        const padSprint = pad ? pad.sprint : false;
        const touchSprint = Boolean(window.touchSprintActive);
        this.player.isSprinting = ((this.keys['ShiftLeft'] || this.keys['ShiftRight'] || padSprint || touchSprint) && isMoving && !this.weapon.isADS);

        // Crouching
        const padCrouch = pad ? pad.crouch : false;
        const touchCrouch = Boolean(window.touchCrouchActive);
        this.player.isCrouching = this.keys['KeyC'] || this.keys['ControlLeft'] || padCrouch || touchCrouch;

        // Gamepad Actions (Reload, ADS, Rematch)
        if (pad) {
            if (pad.reload) {
                this.weapon.startReload();
            }
            if (pad.ads !== undefined) {
                this.weapon.setADS(pad.ads);
            }
            if (pad.start) {
                if (this.isGameOver) {
                    this.restartMatch();
                } else {
                    const lobby = document.getElementById('lobby-modal');
                    if (lobby) lobby.style.display = (lobby.style.display === 'none') ? 'flex' : 'none';
                }
            }
        }

        let currentSpeed = this.walkSpeed;
        if (this.player.isSprinting) currentSpeed = this.sprintSpeed;
        if (this.player.isCrouching) currentSpeed = this.crouchSpeed;
        if (this.weapon.isADS) currentSpeed *= 0.65;

        // Compute true forward and right vectors from camera horizontal orientation (Fixed WASD directions)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const wishDir = new THREE.Vector3();
        if (isMoving) {
            wishDir.addScaledVector(forward, moveZ);
            wishDir.addScaledVector(right, moveX);
            if (wishDir.lengthSq() > 1.0) {
                wishDir.normalize();
            }
        }

        // Horizontal Acceleration & Drag (Preserve ballistic impulse momentum when rocket jumping or blasted)
        if (this.blastRecoveryTimer > 0) {
            this.blastRecoveryTimer -= dt;
            // Free ballistic momentum flight with subtle air steering and aerodynamic glide
            this.player.velocity.x += wishDir.x * currentSpeed * dt * 2.2;
            this.player.velocity.z += wishDir.z * currentSpeed * dt * 2.2;
            this.player.velocity.x *= Math.pow(0.88, dt * 2.0);
            this.player.velocity.z *= Math.pow(0.88, dt * 2.0);
        } else {
            const accel = this.player.isGrounded ? 18.0 : 4.0;
            const targetVelX = wishDir.x * currentSpeed;
            const targetVelZ = wishDir.z * currentSpeed;

            this.player.velocity.x = THREE.MathUtils.lerp(this.player.velocity.x, targetVelX, dt * accel);
            this.player.velocity.z = THREE.MathUtils.lerp(this.player.velocity.z, targetVelZ, dt * accel);
        }

        // 2. Jump (Keyboard Space OR Touch Jump OR Gamepad A Button)
        const padJump = pad ? pad.jump : false;
        if ((this.keys['Space'] || window.touchJumpTriggered || padJump) && this.player.isGrounded) {
            this.player.velocity.y = this.jumpForce;
            this.player.isGrounded = false;
            window.touchJumpTriggered = false;

            if (window.soundEngine) {
                window.soundEngine.playJump();
            }
            this.triggerGamepadRumble(50, 0.25, 0.1);
        }

        // 3. Gravity
        this.player.velocity.y += this.gravity * dt;

        // 4. Integrate Velocity into Position
        this.player.position.addScaledVector(this.player.velocity, dt);

        // 5. Jump Pad / Trampoline Trigger
        const padHit = this.arena.checkJumpPad(this.player.position);
        if (padHit && this.player.velocity.y <= 0) {
            const forceY = (typeof padHit === 'object') ? padHit.force : padHit;
            this.player.velocity.y = forceY;
            if (typeof padHit === 'object') {
                if (padHit.dirX) this.player.velocity.x = padHit.dirX;
                if (padHit.dirZ) this.player.velocity.z = padHit.dirZ;
            }
            this.player.isGrounded = false;
            if (this.vfx && this.vfx.createJumpPadPulse) {
                const pulseColor = (padHit && (padHit.theme === 'GOLD' || padHit.force > 22.0)) ? 0xffaa00 : 0x00f0ff;
                this.vfx.createJumpPadPulse(padHit.pos || this.player.position, pulseColor);
            }
            if (window.soundEngine) {
                window.soundEngine.playJumpPad();
            }
            this.triggerGamepadRumble(100, 0.5, 0.3);
        }

        // 6. Arena Collisions
        const wasGrounded = this.player.isGrounded;
        this.player.isGrounded = this.arena.resolvePlayerCollision(
            this.player.position,
            0.45,
            this.player.isCrouching ? 1.05 : 1.8
        );

        if (this.player.isGrounded) {
            if (this.player.velocity.y < 0) {
                this.player.velocity.y = 0;
            }
            // Landing sound
            if (!wasGrounded && window.soundEngine) {
                window.soundEngine.playLand();
                this.triggerGamepadRumble(40, 0.2, 0.3);
            }

            // Footsteps
            if (isMoving) {
                this.footstepTimer += dt * (this.player.isSprinting ? 1.6 : 1.0);
                if (this.footstepTimer > 0.42) {
                    this.footstepTimer = 0;
                    if (window.soundEngine) {
                        window.soundEngine.playFootstep(this.player.isSprinting);
                    }
                }
            } else {
                this.footstepTimer = 0.35;
            }
        }

        // 7. Update Camera Eye Position & Angles
        const eyeHeight = this.player.isCrouching ? 1.05 : 1.68;
        const camPos = this.player.position.clone().add(new THREE.Vector3(0, eyeHeight, 0));

        // Add camera trauma shake
        camPos.x += this.vfx.shakeOffsetX;
        camPos.y += this.vfx.shakeOffsetY;
        this.camera.position.copy(camPos);

        this.camera.rotation.set(
            this.player.pitch + this.vfx.shakePitch,
            this.player.yaw + this.vfx.shakeYaw,
            this.vfx.shakeRoll
        );

        // 8. Auto-fire on holding LMB, Touch Fire, or Gamepad Trigger
        const padFire = pad ? pad.fire : false;
        if (this.mouseLeft || window.touchFireActive || padFire) {
            this.tryFireActiveWeapon();
        }
    }

    /**
     * Main Animation & Game Loop
     */
    loop(currentTime) {
        requestAnimationFrame((t) => this.loop(t));

        const dt = Math.min((currentTime - this.lastTime) * 0.001, 0.1);
        this.lastTime = currentTime;

        if (this.isPaused) {
            this.arena.update(dt);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // 1. Local Player Locomotion (with Gamepad & Touch)
        this.updateLocalPlayerPhysics(dt);

        // 2. Weapon Rig update (Sway, bobbing, recoil, reload)
        if (this.fireTimer > 0) this.fireTimer -= dt;
        const isMoving = this.player.velocity.lengthSq() > 0.5 && this.player.isGrounded;
        this.weapon.update(dt, isMoving, this.player.isSprinting, this.mouseDeltaX, this.mouseDeltaY);
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        // 3. AI Bot Controller (Solo mode)
        if (this.botController) {
            this.botController.update(dt, this.player);
        }

        // 4. Enemy Stickman / Opponents Rig Update
        if (this.mode === 'BOT') {
            if (this.enemyStickman) {
                this.enemyStickman.update(dt);
            }
        } else {
            for (let [_, opp] of this.opponents) {
                if (opp.stickman) {
                    opp.stickman.update(dt);
                }
            }
        }

        // 5. Grenade & Rocket Ballistics Physics & Detonations
        const activeTargets = this.getActiveTargets();
        const activeAliens = (this.isEDFMode && this.alienManager) ? this.alienManager.aliens : null;
        this.physics.update(
            dt,
            this.player,
            activeTargets,
            (damageInfo) => this.onDamageDealt(damageInfo),
            activeAliens
        );

        // 5b. EDF Tactical Zones & Alien Horde Simulation
        if (this.isEDFMode) {
            if (this.edfZones) {
                this.edfZones.update(
                    dt,
                    this.player,
                    (hp) => this.updateHealthHUD(),
                    () => this.weapon.refillSpecialAmmo(),
                    (msg) => this.showToast(msg)
                );
            }
            if (this.alienManager) {
                this.alienManager.update(
                    dt,
                    this.player.position,
                    (amount, attacker) => this.onAlienDamagedPlayer(amount, attacker),
                    (msg) => this.showToast(msg),
                    this.arena ? this.arena.colliders : null
                );
            }
            this.updateEDFWaveHUD();
        }

        // 6. Arena Jump Pads Light Pulsing
        this.arena.update(dt);

        // 7. VFX & Particle Systems
        this.vfx.update(dt);

        // 8. Respawn Invincibility / Immunity Shield Countdown (3.5s)
        if (this.player.immunityTimer > 0) {
            this.player.immunityTimer = Math.max(0, this.player.immunityTimer - dt);
            this.updateShieldHUD();
        } else if (this.shieldActiveInHUD) {
            this.updateShieldHUD();
        }

        // 9. 3-Minute Match Countdown Timer (PvP Only)
        if (!this.isEDFMode && !this.isGameOver) {
            this.matchTimer = Math.max(0, this.matchTimer - dt);
            this.updateTimerHUD();

            // Periodic sync from host to client (1 Hz)
            if (this.mode === 'ONLINE_HOST' && window.networkEngine && window.networkEngine.isConnected) {
                this.timeSyncTimer = (this.timeSyncTimer || 0) + dt;
                if (this.timeSyncTimer >= 1.0) {
                    this.timeSyncTimer = 0;
                    window.networkEngine.send({
                        type: 'TIME_SYNC',
                        timer: Math.ceil(this.matchTimer)
                    });
                }
            }

            if (this.matchTimer <= 0) {
                this.endMatchByTime();
            }
        }

        // 9. HUD Updates
        this.updateAmmoHUD();

        // 10. WebRTC State Synchronization (30 Hz)
        if (window.networkEngine && window.networkEngine.isConnected) {
            this.networkSyncTimer += dt;
            if (this.networkSyncTimer > 0.033) {
                this.networkSyncTimer = 0;
                window.networkEngine.send({
                    type: 'STATE',
                    slot: this.localSlot,
                    name: this.localPlayerName || 'HERO',
                    x: this.player.position.x,
                    y: this.player.position.y,
                    z: this.player.position.z,
                    yaw: this.player.yaw,
                    pitch: this.player.pitch,
                    isMoving: isMoving,
                    isGrounded: this.player.isGrounded,
                    weaponMode: this.weaponMode,
                    hp: this.player.health,
                    immune: (this.player.immunityTimer > 0)
                });
            }
        }

        // 11. Render 3D Scene
        this.renderer.render(this.scene, this.camera);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        window.game = new StickenadeGame();
    });
} else {
    window.game = new StickenadeGame();
}
