/**
 * stickenade - EDF Tactical Zones Engine
 * Features:
 *   1. Area Isi Darah (Med-Bay Nanite Station):
 *      - Heals +50 HP per second (up to 1000 HP).
 *      - Locks weapons (CANNOT SHOOT while standing inside).
 *   2. Area Amunisi Senjata Spesial (Special Ammo Supply Depot):
 *      - Opens every 2 minutes (120s cycle) for a 30-second resupply window.
 *      - Refills all special weapon ammunition to full on entry.
 */

class EDFZones {
    constructor(scene, vfx) {
        this.scene = scene;
        this.vfx = vfx;

        // 1. Med-Bay Configuration (South open area)
        this.medBayPos = new THREE.Vector3(0, 0, 24);
        this.medBayRadius = 4.8;
        this.healTimer = 0;

        // 2. Special Ammo Depot Configuration (North open area)
        this.ammoDepotPos = new THREE.Vector3(0, 0, -24);
        this.ammoDepotRadius = 4.8;
        this.ammoCycleTime = 120.0; // 2 minutes cycle
        this.ammoOpenDuration = 30.0; // 30 seconds open window
        this.ammoTimer = this.ammoCycleTime;
        this.isAmmoDepotOpen = false;
        this.hasRefilledThisCycle = false; // Player refilled flag during current open window
        this.lastDepotLabelSec = -1;

        // Procedural 3D Meshes & Lights (Hidden by default until EDF mode begins)
        this.root = new THREE.Group();
        this.root.visible = false;
        this.scene.add(this.root);

        this.buildMedBayMesh();
        this.buildAmmoDepotMesh();
    }

    // ========================================================
    // 1. PROCEDURAL MED-BAY (AREA ISI DARAH)
    // ========================================================
    buildMedBayMesh() {
        this.medBayGroup = new THREE.Group();
        this.medBayGroup.position.copy(this.medBayPos);

        // A. Glowing Green Circular Base
        const baseGeo = new THREE.RingGeometry(0.2, this.medBayRadius, 48);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide
        });
        const baseRing = new THREE.Mesh(baseGeo, baseMat);
        baseRing.rotation.x = -Math.PI / 2;
        baseRing.position.y = 0.03;
        this.medBayGroup.add(baseRing);

        // Outer Bright Perimeter Border
        const borderGeo = new THREE.RingGeometry(this.medBayRadius - 0.2, this.medBayRadius, 48);
        const borderMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.rotation.x = -Math.PI / 2;
        borderMesh.position.y = 0.04;
        this.medBayGroup.add(borderMesh);

        // B. Large Medical Cross [➕] on the floor
        const crossMat = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });
        const bar1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.2), crossMat);
        bar1.rotation.x = -Math.PI / 2;
        bar1.position.y = 0.05;
        this.medBayGroup.add(bar1);

        const bar2 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.2), crossMat);
        bar2.rotation.x = -Math.PI / 2;
        bar2.position.y = 0.05;
        this.medBayGroup.add(bar2);

        // C. Rotating Holographic 3D Cross Above
        this.holoCross = new THREE.Group();
        this.holoCross.position.set(0, 3.2, 0);

        const hMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.8
        });
        const hBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.35), hMat);
        const hBar2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.35), hMat);
        this.holoCross.add(hBar1);
        this.holoCross.add(hBar2);
        this.medBayGroup.add(this.holoCross);

        // D. 4 Corner Nanite Beacon Pillars
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI / 2) + Math.PI / 4;
            const px = Math.cos(angle) * (this.medBayRadius - 0.4);
            const pz = Math.sin(angle) * (this.medBayRadius - 0.4);

            const pGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.8, 12);
            const pMat = new THREE.MeshStandardMaterial({
                color: 0x22332a,
                roughness: 0.4,
                metalness: 0.8
            });
            const pillar = new THREE.Mesh(pGeo, pMat);
            pillar.position.set(px, 0.9, pz);
            this.medBayGroup.add(pillar);

            const emitterGeo = new THREE.SphereGeometry(0.16, 12, 12);
            const emitterMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
            const emitter = new THREE.Mesh(emitterGeo, emitterMat);
            emitter.position.set(px, 1.85, pz);
            this.medBayGroup.add(emitter);
        }

        // Green Area Ambient Point Light
        this.medBayLight = new THREE.PointLight(0x00ff88, 1.8, 14);
        this.medBayLight.position.set(0, 2.5, 0);
        this.medBayGroup.add(this.medBayLight);

        // 3D Billboard Canvas Tag for Med-Bay
        this.medBaySprite = this.createLabelSprite("➕ MED-BAY (ISI DARAH: +50 HP/s)\n⚠️ SENJATA DIKUNCI DI DALAM!", "#00ff88", 2.2);
        this.medBaySprite.position.set(0, 4.4, 0);
        this.medBayGroup.add(this.medBaySprite);

        this.root.add(this.medBayGroup);
    }

    // ========================================================
    // 2. PROCEDURAL SPECIAL AMMO DEPOT (BUKA TIAP 2 MENIT)
    // ========================================================
    buildAmmoDepotMesh() {
        this.ammoDepotGroup = new THREE.Group();
        this.ammoDepotGroup.position.copy(this.ammoDepotPos);

        // A. Hexagonal Supply Platform Base
        const padGeo = new THREE.CylinderGeometry(this.ammoDepotRadius, this.ammoDepotRadius + 0.3, 0.2, 6);
        const padMat = new THREE.MeshStandardMaterial({
            color: 0x2a2518,
            roughness: 0.5,
            metalness: 0.7
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.1;
        this.ammoDepotGroup.add(padMesh);

        // Perimeter glowing ring
        const ringGeo = new THREE.RingGeometry(this.ammoDepotRadius - 0.25, this.ammoDepotRadius, 36);
        this.ammoRingMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(ringGeo, this.ammoRingMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.y = 0.22;
        this.ammoDepotGroup.add(ringMesh);

        // B. Central Military Heavy Ammo Crate / Pod
        const crateGeo = new THREE.BoxGeometry(2.2, 1.4, 2.2);
        const crateMat = new THREE.MeshStandardMaterial({
            color: 0x4a3b1a,
            roughness: 0.4,
            metalness: 0.85
        });
        this.ammoCrate = new THREE.Mesh(crateGeo, crateMat);
        this.ammoCrate.position.set(0, 0.9, 0);
        this.ammoDepotGroup.add(this.ammoCrate);

        // Crate Ammo Stripe
        const stripeGeo = new THREE.BoxGeometry(2.24, 0.25, 2.24);
        this.ammoStripeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const stripeMesh = new THREE.Mesh(stripeGeo, this.ammoStripeMat);
        stripeMesh.position.set(0, 0.9, 0);
        this.ammoDepotGroup.add(stripeMesh);

        // C. Holographic Forcefield Dome (Visible when locked)
        const domeGeo = new THREE.SphereGeometry(this.ammoDepotRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        this.ammoForcefieldMat = new THREE.MeshBasicMaterial({
            color: 0xff7700,
            transparent: true,
            opacity: 0.22,
            wireframe: true,
            side: THREE.DoubleSide
        });
        this.ammoForcefield = new THREE.Mesh(domeGeo, this.ammoForcefieldMat);
        this.ammoForcefield.position.y = 0.2;
        this.ammoDepotGroup.add(this.ammoForcefield);

        // D. Ammo Depot Point Light
        this.ammoLight = new THREE.PointLight(0xffaa00, 2.0, 16);
        this.ammoLight.position.set(0, 2.8, 0);
        this.ammoDepotGroup.add(this.ammoLight);

        // 3D Billboard Canvas Tag for Ammo Depot
        this.ammoSprite = this.createLabelSprite("🔒 AMMO DEPOT: TERKUNCI\n(02:00)", "#ffaa00", 2.2);
        this.ammoSprite.position.set(0, 4.2, 0);
        this.ammoDepotGroup.add(this.ammoSprite);

        this.root.add(this.ammoDepotGroup);
    }

    createLabelSprite(initialText, colorHex = '#00ff88', scale = 2.0) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        this.drawLabelCanvas(ctx, canvas.width, canvas.height, initialText, colorHex);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(scale * 3.2, scale, 1);
        sprite._canvas = canvas;
        sprite._ctx = ctx;
        sprite._texture = texture;
        return sprite;
    }

    drawLabelCanvas(ctx, w, h, text, colorHex) {
        ctx.clearRect(0, 0, w, h);

        // Dark tech background pill
        ctx.fillStyle = 'rgba(8, 12, 20, 0.88)';
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(8, 8, w - 16, h - 16, 20);
        ctx.fill();
        ctx.stroke();

        // Text lines
        const lines = text.split('\n');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (lines.length === 1) {
            ctx.font = 'bold 36px monospace';
            ctx.fillStyle = colorHex;
            ctx.fillText(lines[0], w / 2, h / 2);
        } else {
            ctx.font = 'bold 30px monospace';
            ctx.fillStyle = colorHex;
            ctx.fillText(lines[0], w / 2, h / 2 - 20);

            ctx.font = 'bold 26px monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(lines[1], w / 2, h / 2 + 24);
        }
    }

    updateLabel(sprite, text, colorHex) {
        if (!sprite || !sprite._ctx) return;
        this.drawLabelCanvas(sprite._ctx, sprite._canvas.width, sprite._canvas.height, text, colorHex);
        sprite._texture.needsUpdate = true;
    }

    // ========================================================
    // 3. COLLISION & LOGIC CHECKS
    // ========================================================

    isInsideMedBay(pos) {
        const dx = pos.x - this.medBayPos.x;
        const dz = pos.z - this.medBayPos.z;
        return (dx * dx + dz * dz) <= (this.medBayRadius * this.medBayRadius);
    }

    isInsideAmmoDepot(pos) {
        const dx = pos.x - this.ammoDepotPos.x;
        const dz = pos.z - this.ammoDepotPos.z;
        return (dx * dx + dz * dz) <= (this.ammoDepotRadius * this.ammoDepotRadius);
    }

    formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // ========================================================
    // 4. MAIN UPDATE LOOP
    // ========================================================
    update(dt, player, onHealCallback, onAmmoRefillCallback, showToastCallback) {
        const now = performance.now() * 0.003;

        // A. Animate Med-Bay Hologram
        if (this.holoCross) {
            this.holoCross.rotation.y += dt * 1.5;
            this.holoCross.position.y = 3.2 + Math.sin(now * 2.0) * 0.25;
        }

        // B. Med-Bay Healing Logic
        const inMedBay = this.isInsideMedBay(player.position);
        if (inMedBay && !player.isDead) {
            this.healTimer += dt;
            if (this.healTimer >= 1.0) {
                this.healTimer -= 1.0;
                if (player.health < player.maxHealth) {
                    const healAmt = Math.min(50, player.maxHealth - player.health);
                    player.health += healAmt;
                    if (window.soundEngine) window.soundEngine.playMedBayHeal();
                    if (this.vfx) {
                        this.vfx.createHealingMotes(player.position);
                        this.vfx.spawnCombatText(`+${Math.round(healAmt)} HP`, player.position, '#00ff88');
                    }
                    if (onHealCallback) onHealCallback(player.health);
                }
            }
        } else {
            this.healTimer = Math.min(this.healTimer, 0.9);
        }

        // C. Ammo Depot 2-Minute Cycle Timer
        this.ammoTimer -= dt;

        if (this.isAmmoDepotOpen) {
            // Depot is currently OPEN
            if (this.ammoTimer <= 0) {
                // Time to LOCK
                this.isAmmoDepotOpen = false;
                this.ammoTimer = this.ammoCycleTime;
                this.hasRefilledThisCycle = false;

                // Visual updates: Lock
                this.ammoRingMat.color.setHex(0xffaa00);
                this.ammoStripeMat.color.setHex(0xffaa00);
                this.ammoLight.color.setHex(0xffaa00);
                this.ammoForcefield.visible = true;
                this.ammoForcefieldMat.color.setHex(0xff7700);

                if (showToastCallback) {
                    showToastCallback("🔒 SPECIAL AMMO DEPOT KEMBALI TERKUNCI! Buka 2 menit lagi.");
                }
            } else {
                // Still open: pulse bright cyan / green
                const pulse = 0.5 + Math.sin(now * 8.0) * 0.5;
                this.ammoLight.intensity = 2.0 + pulse * 2.0;

                const remaining = Math.ceil(this.ammoTimer);
                if (remaining !== this.lastDepotLabelSec) {
                    this.lastDepotLabelSec = remaining;
                    this.updateLabel(this.ammoSprite, `🔓 AMMO DEPOT: TERBUKA!\n(${remaining}s Tersisa - AMBIL AMUNISI)`, "#00f0ff");
                }

                // Check player entry to refill
                if (this.isInsideAmmoDepot(player.position) && !player.isDead) {
                    if (onAmmoRefillCallback && !this.hasRefilledThisCycle) {
                        const refilled = onAmmoRefillCallback();
                        if (refilled) {
                            this.hasRefilledThisCycle = true;
                            if (window.soundEngine) window.soundEngine.playAmmoDepotRefill();
                            if (showToastCallback) {
                                showToastCallback("✅ AMUNISI SENJATA SPESIAL TELAH DIISI PENUH!");
                            }
                            if (this.vfx) {
                                this.vfx.spawnCombatText("AMMO FULL! ⚡", player.position, '#00f0ff');
                            }
                        }
                    }
                }
            }
        } else {
            // Depot is LOCKED: counting down 2 minutes
            if (this.ammoTimer <= 0) {
                // Time to OPEN
                this.isAmmoDepotOpen = true;
                this.ammoTimer = this.ammoOpenDuration;
                this.hasRefilledThisCycle = false;
                this.lastDepotLabelSec = -1;

                // Visual updates: Open
                this.ammoRingMat.color.setHex(0x00f0ff);
                this.ammoStripeMat.color.setHex(0x00f0ff);
                this.ammoLight.color.setHex(0x00f0ff);
                this.ammoForcefield.visible = false;

                if (window.soundEngine) window.soundEngine.playAmmoDepotOpen();
                if (showToastCallback) {
                    showToastCallback("🚨 SPECIAL AMMO DEPOT SEKARANG DIBUKA! (30 DETIK) 🚨");
                }
            } else {
                const remaining = Math.ceil(this.ammoTimer);
                if (remaining !== this.lastDepotLabelSec) {
                    this.lastDepotLabelSec = remaining;
                    const formatted = this.formatTime(this.ammoTimer);
                    this.updateLabel(this.ammoSprite, `🔒 AMMO DEPOT: TERKUNCI\n(Buka dalam ${formatted})`, "#ffaa00");
                }
            }
        }

        return {
            inMedBay: inMedBay,
            isAmmoDepotOpen: this.isAmmoDepotOpen,
            ammoTimer: this.ammoTimer
        };
    }
}

window.EDFZones = EDFZones;
