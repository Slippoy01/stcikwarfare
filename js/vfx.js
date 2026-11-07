/**
 * stickenade - Procedural VFX & Particle System
 * 100% procedural WebGL effects: Explosions, Shockwaves, Shrapnel Sparks,
 * Smoke Trails, Scorch Marks, Floating Damage Numbers, Camera Trauma Shake.
 * Zero external textures/images!
 */

class VFXSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Active particle & effect collections
        this.explosions = [];
        this.particles = [];
        this.scorchMarks = [];
        this.floatingTexts = [];
        this.tracers = [];
        this.bulletProjectiles = [];
        this.shellCasings = [];

        // Camera Trauma / Screen Shake
        this.trauma = 0; // [0, 1]
        this.maxTraumaAngle = 0.08; // radians
        this.maxTraumaOffset = 0.35; // units
        this.shakeYaw = 0;
        this.shakePitch = 0;
        this.shakeRoll = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;

        // Reusable shared materials & geometries (performance optimized)
        this.initSharedAssets();
    }

    initSharedAssets() {
        // Procedural particle canvas texture (soft glowing circle)
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.3, 'rgba(255, 180, 50, 0.8)');
        grad.addColorStop(0.7, 'rgba(255, 60, 0, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);

        this.glowTexture = new THREE.CanvasTexture(canvas);

        // Smoke canvas texture (soft fluffy cloud)
        const smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = 64;
        smokeCanvas.height = 64;
        const sCtx = smokeCanvas.getContext('2d');
        const sGrad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        sGrad.addColorStop(0, 'rgba(70, 70, 75, 0.7)');
        sGrad.addColorStop(0.5, 'rgba(40, 40, 45, 0.4)');
        sGrad.addColorStop(1, 'rgba(20, 20, 20, 0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 64, 64);

        this.smokeTexture = new THREE.CanvasTexture(smokeCanvas);

        // Scorch mark canvas texture
        const scorchCanvas = document.createElement('canvas');
        scorchCanvas.width = 128;
        scorchCanvas.height = 128;
        const scCtx = scorchCanvas.getContext('2d');
        const scGrad = scCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
        scGrad.addColorStop(0, 'rgba(15, 15, 15, 0.85)');
        scGrad.addColorStop(0.4, 'rgba(25, 20, 15, 0.6)');
        scGrad.addColorStop(0.8, 'rgba(40, 30, 20, 0.25)');
        scGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        scCtx.fillStyle = scGrad;
        scCtx.fillRect(0, 0, 128, 128);

        this.scorchTexture = new THREE.CanvasTexture(scorchCanvas);

        // Shared geometries
        this.shockwaveGeo = new THREE.RingGeometry(0.2, 1.0, 32);
        this.shockwaveGeo.rotateX(-Math.PI / 2);

        this.fireballGeo = new THREE.SphereGeometry(1, 16, 16);
        this.sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.25);
        this.scorchGeo = new THREE.PlaneGeometry(1, 1);
        this.scorchGeo.rotateX(-Math.PI / 2);

        // Reusable shared bullet tracer geometries & materials
        this.bulletGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6);
        this.bulletGeo.rotateX(Math.PI / 2);

        this.matBulletAR = new THREE.MeshBasicMaterial({ color: 0xffea55, transparent: true, opacity: 0.95 });
        this.matBulletSniper = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 });
        this.matBulletLaser = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 });

        // Shell casing geometry & material
        this.casingGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.075, 6);
        this.casingMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.85 });

        // Shared spark materials (zero allocations per bullet hit!)
        this.matSparkGold = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 1.0 });
        this.matSparkRed = new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 1.0 });
        this.matSparkGreen = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 1.0 });
        this.matSparkCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 1.0 });
    }

    /**
     * Spawn full multi-stage explosion
     */
    createExplosion(pos, radius = 5.5, isDirect = false) {
        // 1. Expanding Core Fireball
        const fireMat = new THREE.MeshBasicMaterial({
            color: 0xffaa22,
            transparent: true,
            opacity: 0.95,
            wireframe: false
        });
        const fireball = new THREE.Mesh(this.fireballGeo, fireMat);
        fireball.position.copy(pos);
        fireball.scale.set(0.4, 0.4, 0.4);
        this.scene.add(fireball);

        // Flash Light
        const light = new THREE.PointLight(0xff7700, 8.0, radius * 2.5);
        light.position.copy(pos);
        this.scene.add(light);

        // 2. Shockwave Ring
        const shockMat = new THREE.MeshBasicMaterial({
            color: 0xffdd88,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const shockwave = new THREE.Mesh(this.shockwaveGeo, shockMat);
        shockwave.position.set(pos.x, Math.max(0.06, pos.y), pos.z);
        this.scene.add(shockwave);

        this.explosions.push({
            fireball,
            light,
            shockwave,
            maxRadius: radius,
            life: 0,
            duration: 0.55
        });

        // 3. Shrapnel Sparks (24 flying hot ember shards)
        const sparkCount = isDirect ? 36 : 24;
        for (let i = 0; i < sparkCount; i++) {
            const sparkMat = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.3 ? 0xffcc33 : 0xff4411
            });
            const spark = new THREE.Mesh(this.sparkGeo, sparkMat);
            spark.position.copy(pos);

            // Random spherical explosion velocity
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const speed = 12 + Math.random() * 18;

            const vel = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.abs(Math.cos(phi)) * speed * 1.1 + 3, // upward bias
                Math.sin(phi) * Math.sin(theta) * speed
            );

            spark.lookAt(spark.position.clone().add(vel));
            this.scene.add(spark);

            this.particles.push({
                mesh: spark,
                vel: vel,
                life: 0,
                maxLife: 0.4 + Math.random() * 0.4,
                gravity: -28,
                bounce: 0.45,
                isSpark: true
            });
        }

        // 4. Heavy Smoke Puffs (billowing cloud)
        const smokeCount = 10;
        for (let i = 0; i < smokeCount; i++) {
            const sMat = new THREE.SpriteMaterial({
                map: this.smokeTexture,
                transparent: true,
                opacity: 0.65,
                color: Math.random() > 0.4 ? 0x222222 : 0x554433,
                depthWrite: false
            });
            const smoke = new THREE.Sprite(sMat);
            smoke.position.set(
                pos.x + (Math.random() - 0.5) * 1.2,
                pos.y + Math.random() * 0.8,
                pos.z + (Math.random() - 0.5) * 1.2
            );
            const scale = 1.2 + Math.random() * 1.5;
            smoke.scale.set(scale, scale, scale);
            this.scene.add(smoke);

            this.particles.push({
                mesh: smoke,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 3.5,
                    2.0 + Math.random() * 4.0,
                    (Math.random() - 0.5) * 3.5
                ),
                scaleSpeed: 3.5 + Math.random() * 2.5,
                life: 0,
                maxLife: 0.9 + Math.random() * 0.5,
                isSmoke: true
            });
        }

        // 5. Scorch Mark on Floor (if close to ground)
        if (pos.y < 3.0) {
            this.createScorchMark(pos.x, pos.z, radius * 0.7);
        }

        // Camera Trauma Impulse based on distance
        const distToCam = this.camera.position.distanceTo(pos);
        const traumaAdd = Math.max(0, 1.0 - distToCam / 22);
        this.addTrauma(traumaAdd * (isDirect ? 1.0 : 0.85));
    }

    /**
     * Burn scorch decal on arena floor
     */
    createScorchMark(x, z, size = 3.5) {
        // Limit max active scorches for performance
        if (this.scorchMarks.length > 25) {
            const old = this.scorchMarks.shift();
            this.scene.remove(old.mesh);
        }

        const mat = new THREE.MeshBasicMaterial({
            map: this.scorchTexture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const scorch = new THREE.Mesh(this.scorchGeo, mat);
        scorch.position.set(x, 0.02 + Math.random() * 0.02, z);
        scorch.rotation.y = Math.random() * Math.PI * 2;
        scorch.scale.set(size, size, size);
        this.scene.add(scorch);

        this.scorchMarks.push({
            mesh: scorch,
            life: 0,
            maxLife: 20.0 // stays for 20 seconds then fades
        });
    }

    /**
     * Muzzle flash at grenade launcher barrel tip
     */
    createMuzzleFlash(barrelWorldPos, barrelForward) {
        const mat = new THREE.SpriteMaterial({
            map: this.glowTexture,
            color: 0xff9900,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(barrelWorldPos);
        sprite.scale.set(1.4, 1.4, 1.4);
        this.scene.add(sprite);

        const light = new THREE.PointLight(0xffaa22, 5.0, 8.0);
        light.position.copy(barrelWorldPos);
        this.scene.add(light);

        // Fast decay
        setTimeout(() => {
            this.scene.remove(sprite);
            this.scene.remove(light);
            mat.dispose();
        }, 55);

        // Small muzzle smoke puff
        const sMat = new THREE.SpriteMaterial({
            map: this.smokeTexture,
            color: 0x444444,
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        const smoke = new THREE.Sprite(sMat);
        smoke.position.copy(barrelWorldPos);
        smoke.scale.set(0.6, 0.6, 0.6);
        this.scene.add(smoke);

        this.particles.push({
            mesh: smoke,
            vel: barrelForward.clone().multiplyScalar(4).add(new THREE.Vector3(0, 1.2, 0)),
            scaleSpeed: 1.8,
            life: 0,
            maxLife: 0.4,
            isSmoke: true
        });
    }

    /**
     * Grenade flying trail: soft sparks & smoke trail
     */
    createGrenadeTrail(pos) {
        if (Math.random() > 0.4) {
            // Smoke puff
            const sMat = new THREE.SpriteMaterial({
                map: this.smokeTexture,
                color: 0x888888,
                transparent: true,
                opacity: 0.35,
                depthWrite: false
            });
            const smoke = new THREE.Sprite(sMat);
            smoke.position.set(
                pos.x + (Math.random() - 0.5) * 0.15,
                pos.y + (Math.random() - 0.5) * 0.15,
                pos.z + (Math.random() - 0.5) * 0.15
            );
            smoke.scale.set(0.35, 0.35, 0.35);
            this.scene.add(smoke);

            this.particles.push({
                mesh: smoke,
                vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5),
                scaleSpeed: 1.2,
                life: 0,
                maxLife: 0.35,
                isSmoke: true
            });
        }
    }

    /**
     * Add camera trauma [0 -> 1]
     */
    addTrauma(amount) {
        this.trauma = Math.min(1.0, this.trauma + amount);
    }

    addScreenShake(amount) {
        this.addTrauma(amount);
    }

    /**
     * Floating Combat 3D Text (e.g. -75, DIRECT HIT!, AIR FRAG!)
     */
    spawnCombatText(text, pos, color = '#ffcc00', isCrit = false) {
        const container = document.getElementById('combat-text-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'floating-dmg-text' + (isCrit ? ' crit-text' : '');
        el.innerText = text;
        el.style.color = color;
        container.appendChild(el);

        this.floatingTexts.push({
            el: el,
            pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4)),
            life: 0,
            maxLife: 1.2,
            upSpeed: 1.8
        });
    }

    /**
     * Trigger Screen Hitmarker
     */
    showHitmarker(isDirect = false) {
        const hm = document.getElementById('hitmarker');
        if (!hm) return;

        hm.classList.remove('hit-active', 'hit-direct');
        void hm.offsetWidth; // trigger reflow
        hm.classList.add('hit-active');
        if (isDirect) hm.classList.add('hit-direct');

        clearTimeout(this.hitmarkerTimeout);
        this.hitmarkerTimeout = setTimeout(() => {
            hm.classList.remove('hit-active', 'hit-direct');
        }, 160);
    }

    /**
     * Realistic High-Velocity Tracer Bullet Projectile
     * Originates exactly at the 3D gun muzzle and streaks forward in real-time
     */
    spawnRealisticBulletTracer(from, to, weaponType = 'ASSAULT_RIFLE', isEntity = false) {
        const dir = to.clone().sub(from);
        const dist = dir.length();
        if (dist < 0.1) return;
        dir.normalize();

        let mat = this.matBulletAR;
        let speed = 220.0;
        if (weaponType === 'SNIPER') {
            mat = this.matBulletSniper;
            speed = 320.0;
        } else if (weaponType === 'LASER') {
            mat = this.matBulletLaser;
            speed = 160.0;
        }

        const mesh = new THREE.Mesh(this.bulletGeo, mat);
        mesh.position.copy(from);
        mesh.lookAt(to);
        this.scene.add(mesh);

        this.bulletProjectiles.push({
            mesh: mesh,
            startPos: from.clone(),
            targetPos: to.clone(),
            dir: dir,
            totalDist: dist,
            travelled: 0,
            speed: speed,
            weaponType: weaponType,
            isEntity: isEntity
        });
    }

    /**
     * Brass Shell Casing Ejection with Realistic Physics & Tumbling
     */
    spawnShellCasing(pos, baseDir) {
        if (this.shellCasings.length >= 24) {
            const old = this.shellCasings.shift();
            this.scene.remove(old.mesh);
        }

        const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
        mesh.position.copy(pos);
        this.scene.add(mesh);

        const right = new THREE.Vector3(1, 0, 0);
        if (this.camera) right.applyQuaternion(this.camera.quaternion);

        const vel = right.multiplyScalar(2.2 + Math.random() * 0.8)
            .add(new THREE.Vector3(0, 2.4 + Math.random() * 0.9, 0))
            .addScaledVector(baseDir || new THREE.Vector3(0, 0, -1), -0.5);

        this.shellCasings.push({
            mesh: mesh,
            vel: vel,
            rotVel: new THREE.Vector3(
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 25,
                (Math.random() - 0.5) * 25
            ),
            bounces: 0,
            life: 0,
            maxLife: 2.2
        });
    }

    /**
     * Create Glowing Ballistic Sniper Tracer Beam
     */
    createSniperTracer(from, to, isHeadshot = false) {
        this.spawnRealisticBulletTracer(from, to, 'SNIPER', isHeadshot);
    }

    /**
     * Bullet impact sparks & dust puff (Zero allocation - uses shared materials!)
     */
    createBulletImpact(pos, normal = new THREE.Vector3(0, 1, 0), isEntity = false) {
        const count = isEntity ? 8 : 6;
        const sparkMat = isEntity ? this.matSparkRed : this.matSparkGold;

        for (let i = 0; i < count; i++) {
            const vel = normal.clone().add(new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 1.5
            )).normalize().multiplyScalar(4 + Math.random() * 8);

            const spark = new THREE.Mesh(this.sparkGeo, sparkMat);
            spark.scale.set(0.4, 0.4, 0.4);
            spark.position.copy(pos);
            this.scene.add(spark);

            this.particles.push({
                type: 'spark',
                mesh: spark,
                vel: vel,
                life: 0,
                maxLife: 0.22 + Math.random() * 0.15
            });
        }
    }

    // ========================================================
    // EDF SPECIAL WEAPON & ALIEN EFFECTS
    // ========================================================

    /**
     * Continuous flamethrower fire stream particle
     */
    createFlameParticle(origin, direction, spread = 0.08) {
        const vel = direction.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * spread * 2,
            (Math.random() - 0.5) * spread * 2,
            (Math.random() - 0.5) * spread * 2
        )).normalize().multiplyScalar(22 + Math.random() * 8);

        const isYellow = Math.random() > 0.4;
        const color = isYellow ? 0xffbb22 : 0xff4400;

        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.85
        });

        const size = 0.18 + Math.random() * 0.15;
        const p = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6), mat);
        p.position.copy(origin);
        this.scene.add(p);

        this.particles.push({
            type: 'flame',
            mesh: p,
            vel: vel,
            life: 0,
            maxLife: 0.45 + Math.random() * 0.15,
            startScale: size,
            endScale: size * 3.5
        });
    }

    /**
     * Piercing high-tech cyan/blue laser beam
     */
    createLaserBeam(from, to) {
        const dist = from.distanceTo(to);
        const dir = to.clone().sub(from).normalize();
        const mid = from.clone().addScaledVector(dir, dist * 0.5);

        const geo = new THREE.CylinderGeometry(0.045, 0.045, dist, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.95
        });

        const beam = new THREE.Mesh(geo, mat);
        beam.position.copy(mid);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.scene.add(beam);

        // Core bright white inner laser
        const innerGeo = new THREE.CylinderGeometry(0.018, 0.018, dist, 6);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0
        });
        const innerBeam = new THREE.Mesh(innerGeo, innerMat);
        beam.add(innerBeam);

        this.tracers.push({
            mesh: beam,
            life: 0,
            maxLife: 0.12
        });
    }

    /**
     * Alien bug blood / hemolymph splat (green or purple)
     */
    createAlienBloodSplatter(pos, count = 12, isAcid = false) {
        const color = isAcid ? 0x00ff44 : 0x77ff00;
        for (let i = 0; i < count; i++) {
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                Math.random() * 5 + 1,
                (Math.random() - 0.5) * 6
            );

            const mat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.9
            });

            const drop = new THREE.Mesh(this.sparkGeo, mat);
            drop.scale.set(0.7, 0.7, 0.7);
            drop.position.copy(pos);
            this.scene.add(drop);

            this.particles.push({
                type: 'blood',
                mesh: drop,
                vel: vel,
                life: 0,
                maxLife: 0.35 + Math.random() * 0.25
            });
        }
    }

    /**
     * Green nanite healing motes rising around player in Med-Bay
     */
    createHealingMotes(playerPos) {
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 0.4 + Math.random() * 0.8;
            const pos = new THREE.Vector3(
                playerPos.x + Math.cos(angle) * radius,
                playerPos.y + 0.1 + Math.random() * 0.5,
                playerPos.z + Math.sin(angle) * radius
            );

            const mat = new THREE.MeshBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0.85
            });

            const mote = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), mat);
            mote.position.copy(pos);
            this.scene.add(mote);

            this.particles.push({
                type: 'spark',
                mesh: mote,
                vel: new THREE.Vector3(0, 2.5 + Math.random() * 1.5, 0),
                life: 0,
                maxLife: 0.5 + Math.random() * 0.3
            });
        }
    }

    /**
     * Jump Pad Launch Shockwave & Spark Motes
     */
    createJumpPadPulse(pos, color = 0x00f0ff) {
        const ringGeo = new THREE.RingGeometry(0.3, 1.2, 12);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(pos.x, pos.y + 0.08, pos.z);
        this.scene.add(ringMesh);

        this.particles.push({
            mesh: ringMesh,
            vel: new THREE.Vector3(0, 0.4, 0),
            life: 0,
            maxLife: 0.30,
            isShockwave: true,
            growth: 5.5
        });

        // Upward energetic spark motes (4 lightweight motes)
        for (let i = 0; i < 4; i++) {
            const sparkMat = new THREE.MeshBasicMaterial({ color: color });
            const spark = new THREE.Mesh(this.sparkGeo, sparkMat);
            spark.position.set(
                pos.x + (Math.random() - 0.5) * 0.8,
                pos.y + 0.12,
                pos.z + (Math.random() - 0.5) * 0.8
            );
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 2.0,
                5.0 + Math.random() * 4.0,
                (Math.random() - 0.5) * 2.0
            );
            spark.lookAt(spark.position.clone().add(vel));
            this.scene.add(spark);

            this.particles.push({
                mesh: spark,
                vel: vel,
                life: 0,
                maxLife: 0.25 + Math.random() * 0.1,
                gravity: -10,
                isSpark: true
            });
        }
    }

    /**
     * Floating combat text for boss weakness hits (Golden Orange Critical)
     */
    spawnWeaknessCombatText(damage, pos, icon = '💥') {
        const container = document.getElementById('combat-text-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'combat-text weakness-crit';
        el.innerHTML = `<span style="font-size: 16px;">${icon}</span> <strong>CRIT ${Math.round(damage)}!</strong> <span style="font-size: 11px; opacity: 0.9;">WEAKNESS</span>`;
        el.style.color = '#ffcc00';
        el.style.textShadow = '0 0 10px #ff7700, 0 0 20px #ff3300';
        container.appendChild(el);

        this.floatingTexts.push({
            el: el,
            pos: pos.clone().add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                0.8,
                (Math.random() - 0.5) * 0.6
            )),
            life: 0,
            maxLife: 1.1,
            upSpeed: 1.8
        });
    }

    /**
     * Main update loop for all VFX
     */
    update(dt) {
        // 0a. Update Realistic Fast Flying Bullet Projectiles
        for (let i = this.bulletProjectiles.length - 1; i >= 0; i--) {
            const bp = this.bulletProjectiles[i];
            const step = bp.speed * dt;
            bp.travelled += step;
            bp.mesh.position.addScaledVector(bp.dir, step);

            if (bp.travelled >= bp.totalDist) {
                // Arrived at target: create impact sparks & decals
                this.createBulletImpact(bp.targetPos, new THREE.Vector3(0, 1, 0), bp.isEntity);
                this.scene.remove(bp.mesh);
                this.bulletProjectiles.splice(i, 1);
            }
        }

        // 0b. Update Tumbling Brass Shell Casings
        for (let i = this.shellCasings.length - 1; i >= 0; i--) {
            const sc = this.shellCasings[i];
            sc.life += dt;
            if (sc.life >= sc.maxLife) {
                this.scene.remove(sc.mesh);
                this.shellCasings.splice(i, 1);
                continue;
            }

            // Gravity & Position
            sc.vel.y -= 19.6 * dt;
            sc.mesh.position.addScaledVector(sc.vel, dt);
            sc.mesh.rotation.x += sc.rotVel.x * dt;
            sc.mesh.rotation.y += sc.rotVel.y * dt;
            sc.mesh.rotation.z += sc.rotVel.z * dt;

            // Floor bounce
            if (sc.mesh.position.y <= 0.04) {
                sc.mesh.position.y = 0.04;
                if (sc.bounces < 2 && Math.abs(sc.vel.y) > 0.6) {
                    sc.vel.y = -sc.vel.y * 0.42;
                    sc.vel.x *= 0.6;
                    sc.vel.z *= 0.6;
                    sc.bounces++;
                    if (window.soundEngine && sc.bounces === 1) {
                        window.soundEngine.playMechanicalClick(0, 3200 + Math.random() * 800, 0.02, 0.12);
                    }
                } else {
                    sc.vel.set(0, 0, 0);
                    sc.rotVel.set(0, 0, 0);
                }
            }
        }

        // 0c. Update Sniper Bullet Tracers
        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const tr = this.tracers[i];
            tr.life += dt;
            const progress = tr.life / tr.maxLife;
            if (progress >= 1.0) {
                this.scene.remove(tr.mesh);
                tr.mesh.geometry.dispose();
                tr.mesh.material.dispose();
                this.tracers.splice(i, 1);
            } else {
                tr.mesh.material.opacity = (1.0 - progress) * 0.95;
            }
        }

        // 1. Update Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.life += dt;
            const progress = exp.life / exp.duration;

            if (progress >= 1.0) {
                this.scene.remove(exp.fireball);
                this.scene.remove(exp.light);
                this.scene.remove(exp.shockwave);
                exp.fireball.material.dispose();
                exp.shockwave.material.dispose();
                this.explosions.splice(i, 1);
                continue;
            }

            // Expanding fireball
            const scale = Math.sin(progress * Math.PI * 0.5) * exp.maxRadius * 0.9;
            exp.fireball.scale.set(scale, scale, scale);
            exp.fireball.material.opacity = (1.0 - progress) * 0.9;

            // Expanding shockwave ring
            const ringScale = progress * exp.maxRadius * 1.6;
            exp.shockwave.scale.set(ringScale, ringScale, ringScale);
            exp.shockwave.material.opacity = (1.0 - progress * progress) * 0.85;

            // Light fade
            exp.light.intensity = (1.0 - progress) * 7.0;
        }

        // 2. Update Particles (Sparks & Smoke)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life += dt;
            const prog = p.life / p.maxLife;

            if (prog >= 1.0) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }

            if (p.isSpark) {
                p.vel.y += p.gravity * dt;
                p.mesh.position.addScaledVector(p.vel, dt);
                p.mesh.lookAt(p.mesh.position.clone().add(p.vel));

                // Ground bounce
                if (p.mesh.position.y <= 0.05) {
                    p.mesh.position.y = 0.05;
                    p.vel.y = -p.vel.y * p.bounce;
                    p.vel.x *= 0.7;
                    p.vel.z *= 0.7;
                }
            } else if (p.type === 'flame') {
                p.mesh.position.addScaledVector(p.vel, dt);
                p.vel.multiplyScalar(0.92); // rapid air drag
                const curScale = THREE.MathUtils.lerp(p.startScale, p.endScale, prog);
                p.mesh.scale.set(curScale, curScale, curScale);
                p.mesh.material.opacity = (1.0 - prog) * 0.85;
            } else if (p.type === 'blood') {
                p.vel.y -= 18.0 * dt; // gravity
                p.mesh.position.addScaledVector(p.vel, dt);
                if (p.mesh.position.y <= 0.04) {
                    p.mesh.position.y = 0.04;
                    p.vel.set(0, 0, 0);
                }
                p.mesh.material.opacity = (1.0 - prog * 0.8);
            } else if (p.isShockwave) {
                p.mesh.position.addScaledVector(p.vel, dt);
                const s = 1.0 + prog * (p.growth || 6.0);
                p.mesh.scale.set(s, 1, s);
                p.mesh.material.opacity = (1.0 - prog * prog) * 0.9;
            } else if (p.isSmoke) {
                p.mesh.position.addScaledVector(p.vel, dt);
                p.vel.multiplyScalar(0.96); // drag
                const curScale = p.mesh.scale.x + p.scaleSpeed * dt;
                p.mesh.scale.set(curScale, curScale, curScale);
                p.mesh.material.opacity = (1.0 - prog) * 0.55;
            } else {
                p.mesh.position.addScaledVector(p.vel, dt);
                if (p.mesh.material) {
                    p.mesh.material.opacity = (1.0 - prog);
                }
            }
        }

        // 3. Update Scorch Marks
        for (let i = this.scorchMarks.length - 1; i >= 0; i--) {
            const sc = this.scorchMarks[i];
            sc.life += dt;
            if (sc.life > sc.maxLife - 3.0) {
                // Fade out over last 3s
                const fade = (sc.maxLife - sc.life) / 3.0;
                sc.mesh.material.opacity = Math.max(0, fade * 0.8);
            }
            if (sc.life >= sc.maxLife) {
                this.scene.remove(sc.mesh);
                sc.mesh.material.dispose();
                this.scorchMarks.splice(i, 1);
            }
        }

        // 4. Update 3D Floating Combat Text
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life += dt;
            const prog = ft.life / ft.maxLife;

            if (prog >= 1.0) {
                if (ft.el.parentNode) ft.el.parentNode.removeChild(ft.el);
                this.floatingTexts.splice(i, 1);
                continue;
            }

            ft.pos.y += ft.upSpeed * dt;

            // Project 3D pos to 2D screen coordinates
            const screenPos = ft.pos.clone().project(this.camera);

            // If behind camera, hide
            if (screenPos.z > 1) {
                ft.el.style.display = 'none';
            } else {
                ft.el.style.display = 'block';
                const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
                ft.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${1.0 + (1 - prog) * 0.3})`;
                ft.el.style.opacity = `${1.0 - prog * prog}`;
            }
        }

        // 5. Update Camera Trauma Shake
        if (this.trauma > 0) {
            // Decay trauma linearly over time
            this.trauma = Math.max(0, this.trauma - dt * 1.25);
            // Non-linear shake power = trauma^2
            const shake = this.trauma * this.trauma;
            const time = performance.now() * 0.025;

            // Procedural Perlin-like pseudo noise using harmonic sines
            this.shakeYaw = (Math.sin(time * 1.3) + Math.sin(time * 2.7) * 0.5) * this.maxTraumaAngle * shake;
            this.shakePitch = (Math.cos(time * 1.5) + Math.cos(time * 3.1) * 0.5) * this.maxTraumaAngle * shake;
            this.shakeRoll = Math.sin(time * 1.8) * this.maxTraumaAngle * 0.6 * shake;

            this.shakeOffsetX = Math.sin(time * 1.1) * this.maxTraumaOffset * shake;
            this.shakeOffsetY = Math.cos(time * 1.4) * this.maxTraumaOffset * shake;
        } else {
            this.shakeYaw = 0;
            this.shakePitch = 0;
            this.shakeRoll = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }
    }
}

window.VFXSystem = VFXSystem;

