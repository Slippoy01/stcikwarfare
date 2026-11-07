/**
 * stickenade - 3rd-Person Procedural Tactical Stickman Rig
 * 100% code-generated 3D character for Remote Opponents and AI Bots.
 * Features: Articulated Limbs, Aim Pitch Tracking, Dynamic Running/Jumping Poses,
 * 3rd-Person Launcher Prop, and Explosive Disassembly Ragdoll K.O. Effect.
 */

class TacticalStickman {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.isBot = options.isBot || false;
        this.name = options.name || (this.isBot ? "BOT-OMEGA" : "ENEMY");
        this.visorColor = options.visorColor || 0xff2244; // Host=0x00f0ff, Guest/Bot=0xff2244
        this.bodyColor = options.bodyColor || 0x141820;

        // Position & Rotation
        this.position = new THREE.Vector3(0, 0, 0);
        this.yaw = 0;
        this.pitch = 0;

        // Interpolation targets for smooth network playback
        this.targetPos = new THREE.Vector3(0, 0, 0);
        this.targetYaw = 0;
        this.targetPitch = 0;

        // State
        this.health = 100;
        this.maxHealth = 100;
        this.immunityTimer = 0; // Respawn 3.5s Invincibility / Immunity
        this.shieldMesh = null;
        this.isGrounded = true;
        this.isMoving = false;
        this.isDead = false;
        this.animTime = 0;
        this.flinchTimer = 0;

        // Ragdoll debris on death
        this.ragdollLimbs = [];

        this.buildProceduralMesh();
    }

    buildProceduralMesh() {
        this.root = new THREE.Group();

        // Materials
        const darkBodyMat = new THREE.MeshStandardMaterial({
            color: this.bodyColor,
            roughness: 0.5,
            metalness: 0.4
        });

        const vestMat = new THREE.MeshStandardMaterial({
            color: 0x1e2430,
            roughness: 0.7,
            metalness: 0.2
        });

        const visorMat = new THREE.MeshBasicMaterial({
            color: this.visorColor
        });

        const launcherMat = new THREE.MeshStandardMaterial({
            color: 0x22262e,
            roughness: 0.4,
            metalness: 0.8
        });

        const sniperSteelMat = new THREE.MeshStandardMaterial({
            color: 0x181c22,
            roughness: 0.3,
            metalness: 0.9
        });

        const scopeGlassMat = new THREE.MeshBasicMaterial({
            color: 0x00e1ff
        });

        // 1. Pelvis / Hips (Root bone)
        this.hips = new THREE.Group();
        this.hips.position.y = 0.95;
        this.root.add(this.hips);

        const hipsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.14, 12), darkBodyMat);
        this.hips.add(hipsMesh);

        // 2. Spine & Torso with Tactical Vest
        this.spine = new THREE.Group();
        this.spine.position.y = 0.08;
        this.hips.add(this.spine);

        const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.32, 12), darkBodyMat);
        torsoMesh.position.y = 0.16;
        this.spine.add(torsoMesh);

        // Vest Armor Plates (Front & Back)
        const vestFront = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.18), vestMat);
        vestFront.position.set(0, 0.17, 0.02);
        this.spine.add(vestFront);

        // 3. Neck & Head with Visor
        this.chest = new THREE.Group();
        this.chest.position.y = 0.32;
        this.spine.add(this.chest);

        this.head = new THREE.Group();
        this.head.position.y = 0.22;
        this.chest.add(this.head);

        const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), darkBodyMat);
        this.head.add(headMesh);

        // Glowing Visor
        const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.10), visorMat);
        visorMesh.position.set(0, 0.01, 0.10);
        this.head.add(visorMesh);

        // 4. Arms & 3rd-Person Grenade Launcher
        // Left Arm
        this.leftShoulder = new THREE.Group();
        this.leftShoulder.position.set(-0.20, 0.14, 0);
        this.chest.add(this.leftShoulder);

        const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.24, 8), darkBodyMat);
        lUpperArm.position.y = -0.12;
        this.leftShoulder.add(lUpperArm);

        this.leftElbow = new THREE.Group();
        this.leftElbow.position.y = -0.24;
        this.leftShoulder.add(this.leftElbow);

        const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), darkBodyMat);
        lForearm.position.y = -0.11;
        this.leftElbow.add(lForearm);

        // Right Arm (Firing hand)
        this.rightShoulder = new THREE.Group();
        this.rightShoulder.position.set(0.20, 0.14, 0);
        this.chest.add(this.rightShoulder);

        const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.24, 8), darkBodyMat);
        rUpperArm.position.y = -0.12;
        this.rightShoulder.add(rUpperArm);

        this.rightElbow = new THREE.Group();
        this.rightElbow.position.y = -0.24;
        this.rightShoulder.add(this.rightElbow);

        const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), darkBodyMat);
        rForearm.position.y = -0.11;
        this.rightElbow.add(rForearm);

        // 3rd-Person Weapon Props (Grenade Launcher & Sniper Rifle)
        // A. Grenade Launcher Prop
        this.launcherProp = new THREE.Group();
        this.launcherProp.position.set(0, -0.12, 0.15);
        this.rightElbow.add(this.launcherProp);

        const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 12), launcherMat);
        gunBarrel.rotateX(Math.PI / 2);
        gunBarrel.position.set(-0.10, 0.05, 0.16);
        this.launcherProp.add(gunBarrel);

        const gunDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.20, 12), launcherMat);
        gunDrum.rotateX(Math.PI / 2);
        gunDrum.position.set(-0.10, 0.01, -0.02);
        this.launcherProp.add(gunDrum);

        // B. .50 Cal Sniper Rifle Prop
        this.sniperProp = new THREE.Group();
        this.sniperProp.position.set(-0.10, -0.08, 0.12);
        this.rightElbow.add(this.sniperProp);

        // Sniper Receiver / Chassis
        const sniperBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.65), sniperSteelMat);
        sniperBody.position.set(0, 0.02, 0.05);
        this.sniperProp.add(sniperBody);

        // Long Fluted Heavy Barrel
        const sniperBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.75, 10), sniperSteelMat);
        sniperBarrel.rotateX(Math.PI / 2);
        sniperBarrel.position.set(0, 0.03, 0.70);
        this.sniperProp.add(sniperBarrel);

        // Arrowhead Muzzle Brake
        const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.10), sniperSteelMat);
        muzzleBrake.position.set(0, 0.03, 1.10);
        this.sniperProp.add(muzzleBrake);

        // High Magnification Optical Scope
        const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.35, 12), sniperSteelMat);
        scopeTube.rotateX(Math.PI / 2);
        scopeTube.position.set(0, 0.10, 0.05);
        this.sniperProp.add(scopeTube);

        // Scope Objective Bell & Lens
        const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.08, 12), sniperSteelMat);
        scopeBell.rotateX(Math.PI / 2);
        scopeBell.position.set(0, 0.10, 0.24);
        this.sniperProp.add(scopeBell);

        const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), scopeGlassMat);
        scopeLens.position.set(0, 0.10, 0.285);
        this.sniperProp.add(scopeLens);

        // Scope Turrets (Windage & Elevation)
        const turretElev = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), sniperSteelMat);
        turretElev.position.set(0, 0.13, 0.05);
        this.sniperProp.add(turretElev);

        // Detachable 5-Round Box Magazine
        const boxMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.09), vestMat);
        boxMag.position.set(0, -0.08, 0.02);
        boxMag.rotation.x = -0.15;
        this.sniperProp.add(boxMag);

        // Tactical Skeleton Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.30), darkBodyMat);
        stock.position.set(0, 0.01, -0.40);
        this.sniperProp.add(stock);

        // Folding Bipod Legs
        const bipodLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), sniperSteelMat);
        bipodLeft.position.set(-0.06, -0.06, 0.65);
        bipodLeft.rotation.z = 0.3;
        this.sniperProp.add(bipodLeft);

        const bipodRight = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), sniperSteelMat);
        bipodRight.position.set(0.06, -0.06, 0.65);
        bipodRight.rotation.z = -0.3;
        this.sniperProp.add(bipodRight);

        // Maintain weaponMode (Default GRENADE)
        this.weaponMode = 'GRENADE';
        this.setWeapon('GRENADE');

        // 5. Legs & Boots
        // Left Leg
        this.leftHip = new THREE.Group();
        this.leftHip.position.set(-0.10, -0.06, 0);
        this.hips.add(this.leftHip);

        const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.38, 8), darkBodyMat);
        lThigh.position.y = -0.19;
        this.leftHip.add(lThigh);

        this.leftKnee = new THREE.Group();
        this.leftKnee.position.y = -0.38;
        this.leftHip.add(this.leftKnee);

        const lShin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.38, 8), darkBodyMat);
        lShin.position.y = -0.19;
        this.leftKnee.add(lShin);

        const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.15), vestMat);
        lBoot.position.set(0, -0.38, 0.03);
        this.leftKnee.add(lBoot);

        // Right Leg
        this.rightHip = new THREE.Group();
        this.rightHip.position.set(0.10, -0.06, 0);
        this.hips.add(this.rightHip);

        const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.38, 8), darkBodyMat);
        rThigh.position.y = -0.19;
        this.rightHip.add(rThigh);

        this.rightKnee = new THREE.Group();
        this.rightKnee.position.y = -0.38;
        this.rightHip.add(this.rightKnee);

        const rShin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.38, 8), darkBodyMat);
        rShin.position.y = -0.19;
        this.rightKnee.add(rShin);

        const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.15), vestMat);
        rBoot.position.set(0, -0.38, 0.03);
        this.rightKnee.add(rBoot);

        // 6. 3D Procedural Energy Shield Mesh (Respawn Invincibility)
        const shieldMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            wireframe: true,
            transparent: true,
            opacity: 0.38
        });
        this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.22, 16, 12), shieldMat);
        this.shieldMesh.position.y = 1.0;
        this.shieldMesh.visible = false;
        this.shieldMesh.frustumCulled = false;

        const innerShieldMat = new THREE.MeshStandardMaterial({
            color: 0x00d2ff,
            transparent: true,
            opacity: 0.18,
            roughness: 0.1,
            metalness: 0.9,
            side: THREE.DoubleSide
        });
        const innerShield = new THREE.Mesh(new THREE.SphereGeometry(1.18, 14, 10), innerShieldMat);
        innerShield.frustumCulled = false;
        this.shieldMesh.add(innerShield);
        this.root.add(this.shieldMesh);

        // Floating Overhead Health & Name Tag
        this.createNameTag();

        // Ensure no frustum culling surprises on custom rigged hierarchy and enable realistic shadows
        this.root.traverse((child) => {
            if (child.isMesh && child !== this.nameTag && child !== this.shieldMesh && child !== innerShield) {
                child.frustumCulled = false;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.scene.add(this.root);
    }

    get isImmune() {
        return (this.immunityTimer || 0) > 0;
    }

    createNameTag() {
        // Canvas layout (512 x 176): name (top) + health bar (middle) + ▼ locator arrow (bottom)
        this.TAG_W = 512;
        this.TAG_H = 176;
        this.TAG_INFO_H = 128; // Height of the name + health bar region (reference for scaling)

        const canvas = document.createElement('canvas');
        canvas.width = this.TAG_W;
        canvas.height = this.TAG_H;
        this.tagCanvas = canvas;
        this.tagCtx = canvas.getContext('2d');
        this.tagTexture = new THREE.CanvasTexture(canvas);

        const tagMat = new THREE.SpriteMaterial({
            map: this.tagTexture,
            transparent: true,
            depthTest: false
        });
        this.nameTag = new THREE.Sprite(tagMat);
        this.nameTag.position.y = 2.45;
        this.nameTag.scale.set(2.6, 2.6 * (this.TAG_H / this.TAG_W), 1.0);
        this.nameTag.renderOrder = 999; // Always drawn on top of world geometry
        this.root.add(this.nameTag);

        this.updateNameTag();
    }

    updateNameTag() {
        if (!this.tagCtx) return;
        const ctx = this.tagCtx;
        ctx.clearRect(0, 0, this.TAG_W, this.TAG_H);

        const displayName = this.isImmune ? `🛡️ ${this.name || 'PLAYER'}` : (this.name || 'PLAYER');

        // 1. Player Name in Extra Bold White with Strong Dark Stroke Outline for Maximum Visibility
        ctx.font = '900 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Outer Dark Stroke / Border for crystal clarity on any background
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.lineWidth = 9;
        ctx.lineJoin = 'round';
        ctx.strokeText(displayName, 256, 36);

        // Pure Crisp White Text Fill
        ctx.fillStyle = '#ffffff';
        ctx.fillText(displayName, 256, 36);

        // 2. Overhead Health Bar
        const barWidth = 320;
        const barHeight = 18;
        const barX = (512 - barWidth) / 2;
        const barY = 78;

        // Health Bar Background
        ctx.fillStyle = 'rgba(10, 15, 24, 0.85)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health Bar Fill
        const hpPercent = Math.max(0, Math.min(1, this.health / this.maxHealth));
        if (this.isImmune) {
            ctx.fillStyle = '#00f0ff';
        } else {
            ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : (hpPercent > 0.25 ? '#eab308' : '#ef4444');
        }
        ctx.fillRect(barX + 2, barY + 2, Math.max(0, (barWidth - 4) * hpPercent), barHeight - 4);

        // Health Bar Border
        ctx.strokeStyle = this.isImmune ? '#00f0ff' : 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // 3. ▼ Locator Arrow (player slot color with dark outline) pointing down at the character
        const arrowCX = this.TAG_W / 2;
        const arrowTop = 112;
        const arrowBottom = 164;
        const arrowHalfW = 24;
        const slotHex = '#' + (this.visorColor >>> 0).toString(16).padStart(6, '0').slice(-6);

        ctx.beginPath();
        ctx.moveTo(arrowCX - arrowHalfW, arrowTop);
        ctx.lineTo(arrowCX + arrowHalfW, arrowTop);
        ctx.lineTo(arrowCX, arrowBottom);
        ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.fillStyle = slotHex;
        ctx.fill();

        this.tagTexture.needsUpdate = true;
    }

    /**
     * Distance-Adaptive Name Tag Scaling (Auto Zoom In / Out)
     * Keeps the overhead name tag readable from far away (larger on screen) and
     * proportionally smaller as the viewer gets closer, so it never blocks the view.
     * Pure transform math: no canvas redraw, no network traffic, no extra draw calls.
     */
    updateNameTagScale(camera) {
        if (!this.nameTag || !camera || !this.nameTag.visible || this.isDead) return;

        const NEAR_DIST = 4.0;      // At or closer than this: smallest on-screen size
        const FAR_DIST = 50.0;      // At or farther than this: largest on-screen size
        const NEAR_SCREEN = 0.045;  // Tag height as a fraction of screen height (near)
        const FAR_SCREEN = 0.10;    // Tag height as a fraction of screen height (far)
        const HEAD_TOP_Y = 1.75;    // Approx. top of helmet in local space

        const dist = Math.max(0.5, camera.position.distanceTo(this.root.position));

        // Smoothstep blend between near & far on-screen sizes
        let t = (dist - NEAR_DIST) / (FAR_DIST - NEAR_DIST);
        t = Math.max(0, Math.min(1, t));
        t = t * t * (3 - 2 * t);
        const screenFrac = NEAR_SCREEN + (FAR_SCREEN - NEAR_SCREEN) * t;

        // Convert desired on-screen fraction into world-space height (FOV aware, works with ADS zoom)
        // screenFrac refers to the name + health bar region; the full sprite also includes the ▼ arrow
        const fovRad = THREE.MathUtils.degToRad(camera.fov || 75);
        const infoH = screenFrac * 2 * dist * Math.tan(fovRad / 2);
        const worldH = infoH * (this.TAG_H / this.TAG_INFO_H);

        // Preserve canvas aspect ratio (512 x 176)
        this.nameTag.scale.set(worldH * (this.TAG_W / this.TAG_H), worldH, 1.0);

        // Lift the tag so the arrow tip always sits just above the head
        this.nameTag.position.y = HEAD_TOP_Y + 0.08 + worldH * 0.5;
    }

    setHealth(hp) {
        if (this.isImmune && hp < this.health) {
            return; // Immune / Invincible: block damage reduction
        }
        const prevHp = this.health;
        this.health = Math.max(0, Math.min(this.maxHealth, hp));
        this.updateNameTag();

        if (this.health <= 0 && !this.isDead) {
            this.triggerDeath();
        } else if (this.health > 0 && this.isDead) {
            // Revive stickman when remote player respawns or receives positive HP (do not give free shield)
            this.respawn(this.targetPos || this.position, false);
        }
    }

    /**
     * Switch 3rd-Person Weapon Prop ('GRENADE' or 'SNIPER')
     */
    setWeapon(mode) {
        this.weaponMode = mode || 'GRENADE';
        if (this.launcherProp) {
            this.launcherProp.visible = (this.weaponMode === 'GRENADE');
        }
        if (this.sniperProp) {
            this.sniperProp.visible = (this.weaponMode === 'SNIPER');
        }
    }

    flinch() {
        this.flinchTimer = 0.25;
    }

    applyImpulse(force) {
        if (this.botController && this.botController.applyImpulse) {
            this.botController.applyImpulse(force);
        }
        if (!this.impulseVelocity) {
            this.impulseVelocity = new THREE.Vector3();
        }
        this.impulseVelocity.add(force);
        this.isGrounded = false;
    }

    /**
     * Trigger Explosive Disassembly Ragdoll
     */
    triggerDeath() {
        this.isDead = true;
        this.immunityTimer = 0;
        if (this.shieldMesh) this.shieldMesh.visible = false;
        if (this.nameTag) this.nameTag.visible = false;

        // Disassemble parts into physics debris (only currently visible meshes)
        const collectMeshes = (obj) => {
            const list = [];
            obj.traverse((child) => {
                if (child.isMesh && child !== this.nameTag && child !== this.shieldMesh && child.parent !== this.shieldMesh && child.visible) {
                    let cur = child;
                    let visibleAncestor = true;
                    while (cur && cur !== obj) {
                        if (cur.visible === false) {
                            visibleAncestor = false;
                            break;
                        }
                        cur = cur.parent;
                    }
                    if (visibleAncestor) {
                        list.push(child);
                    }
                }
            });
            return list;
        };

        const meshes = collectMeshes(this.root);
        for (let m of meshes) {
            const worldPos = new THREE.Vector3();
            m.getWorldPosition(worldPos);

            const clone = m.clone();
            clone.position.copy(worldPos);
            clone.rotation.copy(m.rotation);
            clone.frustumCulled = false;
            clone.castShadow = true;
            clone.receiveShadow = true;
            this.scene.add(clone);

            // Outward blast velocity
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 14,
                8 + Math.random() * 10,
                (Math.random() - 0.5) * 14
            );

            this.ragdollLimbs.push({
                mesh: clone,
                vel: vel,
                rotVel: new THREE.Vector3(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15
                ),
                life: 0,
                maxLife: 4.0
            });
        }

        // Hide base character
        this.root.visible = false;
    }

    /**
     * Respawn character
     */
    respawn(pos = null, giveImmunity = true) {
        this.isDead = false;
        this.health = this.maxHealth;
        this.immunityTimer = giveImmunity ? 3.5 : 0; // 3.5 detik immunity / invincible saat respawn
        if (this.impulseVelocity) {
            this.impulseVelocity.set(0, 0, 0);
        }
        if (pos) {
            this.position.copy(pos);
            this.targetPos.copy(pos);
            this.root.position.copy(pos);
            this.root.rotation.y = this.isBot ? this.yaw : (this.yaw + Math.PI);
        }
        this.root.visible = true;
        this.root.traverse((child) => {
            if (child.isMesh && child !== this.shieldMesh && (!this.shieldMesh || child.parent !== this.shieldMesh)) {
                child.frustumCulled = false;
            }
        });
        // Ensure only active weapon prop is visible
        this.setWeapon(this.weaponMode);

        if (this.shieldMesh) {
            this.shieldMesh.visible = !!giveImmunity;
        }

        if (this.nameTag) {
            this.nameTag.visible = true;
        }
        this.updateNameTag();

        // Clean up any remaining ragdoll debris (DO NOT DISPOSE SHARED GEOMETRY/MATERIAL!)
        for (let l of this.ragdollLimbs) {
            if (l.mesh) {
                this.scene.remove(l.mesh);
            }
        }
        this.ragdollLimbs = [];
    }

    /**
     * Update animations, skeletal posing, aim pitch, and ragdoll
     */
    update(dt) {
        // Always simulate and clean up active ragdoll debris
        for (let i = this.ragdollLimbs.length - 1; i >= 0; i--) {
            const limb = this.ragdollLimbs[i];
            limb.life += dt;
            if (limb.life >= limb.maxLife) {
                this.scene.remove(limb.mesh);
                this.ragdollLimbs.splice(i, 1);
                continue;
            }

            limb.vel.y -= 26 * dt; // gravity
            limb.mesh.position.addScaledVector(limb.vel, dt);
            limb.mesh.rotation.x += limb.rotVel.x * dt;
            limb.mesh.rotation.y += limb.rotVel.y * dt;
            limb.mesh.rotation.z += limb.rotVel.z * dt;

            // Floor bounce
            if (limb.mesh.position.y <= 0.08) {
                limb.mesh.position.y = 0.08;
                limb.vel.y = -limb.vel.y * 0.4;
                limb.vel.x *= 0.65;
                limb.vel.z *= 0.65;
            }
        }

        // If dead, skip base character animations
        if (this.isDead) {
            return;
        }

        // 0. Apply explosive blast knockback to stickman position
        if (this.impulseVelocity && this.impulseVelocity.lengthSq() > 0.05) {
            this.position.addScaledVector(this.impulseVelocity, dt);
            this.targetPos.copy(this.position);
            this.impulseVelocity.y -= 24.0 * dt; // gravity
            this.impulseVelocity.x *= Math.pow(0.5, dt * 3.5);
            this.impulseVelocity.z *= Math.pow(0.5, dt * 3.5);

            if (this.position.y <= 0) {
                this.position.y = 0;
                this.impulseVelocity.set(0, 0, 0);
                this.isGrounded = true;
            }
        }

        // 1. Smooth Network Interpolation (Position & Rotation)
        this.position.lerp(this.targetPos, dt * 16);
        this.root.position.copy(this.position);

        // Yaw angle interpolation (shortest arc)
        let diffYaw = this.targetYaw - this.yaw;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        this.yaw += diffYaw * Math.min(1.0, dt * 18);
        this.root.rotation.y = this.isBot ? this.yaw : (this.yaw + Math.PI);

        // Pitch interpolation (aiming up/down)
        this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, dt * 16);

        // 2. Spine Aim Pitch (tilts torso to aim vertically)
        this.spine.rotation.x = -this.pitch * 0.7;
        this.head.rotation.x = -this.pitch * 0.3;

        // 3. Flinch Timer
        if (this.flinchTimer > 0) {
            this.flinchTimer -= dt;
            this.hips.position.z = -0.15 * (this.flinchTimer / 0.25);
        } else {
            this.hips.position.z = 0;
        }

        // 4. Locomotion & Idle Posing
        if (this.isMoving && this.isGrounded) {
            this.animTime += dt * 10;

            const legAngle = Math.sin(this.animTime) * 0.65;
            this.leftHip.rotation.x = legAngle;
            this.rightHip.rotation.x = -legAngle;

            // Knee flex on back-swing
            this.leftKnee.rotation.x = legAngle > 0 ? 0.2 : Math.abs(legAngle) * 0.9;
            this.rightKnee.rotation.x = legAngle < 0 ? 0.2 : Math.abs(legAngle) * 0.9;

            // Hips bounce
            this.hips.position.y = 0.95 + Math.abs(Math.sin(this.animTime * 2)) * 0.05;

            // Arms holding launcher with run sway
            this.rightShoulder.rotation.set(-0.75, 0.25, 0.1);
            this.rightElbow.rotation.set(-0.65, 0, 0);

            this.leftShoulder.rotation.set(-0.65 + Math.cos(this.animTime) * 0.15, -0.3, 0);
            this.leftElbow.rotation.set(-0.85, 0.2, 0);
        } else if (!this.isGrounded) {
            // Airborne / Jumping pose
            this.leftHip.rotation.x = -0.4;
            this.rightHip.rotation.x = -0.3;
            this.leftKnee.rotation.x = 0.8;
            this.rightKnee.rotation.x = 0.6;

            this.rightShoulder.rotation.set(-0.85, 0.2, 0);
            this.leftShoulder.rotation.set(-0.75, -0.3, 0);
            this.hips.position.y = 0.95;
        } else {
            // Idle breathing
            this.animTime += dt * 2.5;
            const breath = Math.sin(this.animTime) * 0.02;

            this.hips.position.y = 0.95 + breath;
            this.leftHip.rotation.set(0.08, 0, -0.05);
            this.rightHip.rotation.set(-0.04, 0, 0.05);
            this.leftKnee.rotation.set(0.12, 0, 0);
            this.rightKnee.rotation.set(0.10, 0, 0);

            // Two-handed launcher ready grip
            this.rightShoulder.rotation.set(-0.82 + breath, 0.28, 0.12);
            this.rightElbow.rotation.set(-0.55, 0, 0);

            this.leftShoulder.rotation.set(-0.70 + breath, -0.35, 0);
            this.leftElbow.rotation.set(-0.88, 0.25, 0);
        }

        // 5. Update Respawn Invincibility / Immunity Shield Timer & Mesh
        if (this.immunityTimer > 0) {
            this.immunityTimer -= dt;
            if (this.shieldMesh) {
                this.shieldMesh.visible = true;
                this.shieldMesh.rotation.y += dt * 3.2;
                this.shieldMesh.rotation.z += dt * 1.6;
                const s = 1.0 + Math.sin(this.immunityTimer * 12) * 0.05;
                this.shieldMesh.scale.set(s, s, s);
            }
            if (this.immunityTimer <= 0) {
                this.immunityTimer = 0;
                if (this.shieldMesh) this.shieldMesh.visible = false;
                this.updateNameTag();
            }
        } else {
            if (this.shieldMesh && this.shieldMesh.visible) {
                this.shieldMesh.visible = false;
                this.updateNameTag();
            }
        }
    }
}

window.TacticalStickman = TacticalStickman;

