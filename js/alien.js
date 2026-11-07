/**
 * stickenade - EDF Alien Swarm & 20-Wave Boss Engine (High-Performance Lightweight Edition)
 * Optimized per user specifications:
 *   - 100% Procedural Three.js 3D Aliens with zero external dependencies
 *   - Static Asset Caching (AlienAssetCache): 0 geometry/material allocations during swarms (fixes stuttering & freeze)
 *   - Realistic Obstacle & Container Collision Resolution (fixes insect clipping through containers/bunkers)
 *   - Minions (kroco): No overhead indicator, players figure out weapon effectiveness
 *   - Bosses: Overhead weakness badge with 3x damage multiplier
 */

// Boss Weakness Types
const WEAKNESS_TYPES = {
    FLAMETHROWER: { name: 'FLAMETHROWER', icon: '🔥', label: 'FLAMETHROWER', color: '#ff5500' },
    LASER: { name: 'LASER', icon: '⚡', label: 'LASER CANNON', color: '#00f0ff' },
    BAZOOKA: { name: 'BAZOOKA', icon: '🚀', label: 'BAZOOKA', color: '#ffaa00' },
    SNIPER: { name: 'SNIPER', icon: '🎯', label: 'SNIPER MAGNUM', color: '#00ff88' }
};

// 20 Wave Boss Definitions
const WAVE_BOSS_DEFINITIONS = [
    { wave: 1, name: "QUEEN ANT VANGUARD", weakness: 'FLAMETHROWER', hp: 1500, scale: 3.2, color: 0xaa2222 },
    { wave: 2, name: "ARACHNID GOLIATH", weakness: 'BAZOOKA', hp: 2200, scale: 3.4, color: 0x661133 },
    { wave: 3, name: "AERIAL PLASMA QUEEN", weakness: 'SNIPER', hp: 3000, scale: 3.0, isFlying: true, color: 0x2288aa },
    { wave: 4, name: "CRYSTAL CARAPACE BEETLE", weakness: 'LASER', hp: 3800, scale: 3.5, color: 0x0088cc },
    { wave: 5, name: "ACID MATRIARCH HIVE QUEEN", weakness: 'FLAMETHROWER', hp: 4600, scale: 3.8, color: 0x33aa22 },
    { wave: 6, name: "HEAVY SIEGE COLOSSUS", weakness: 'BAZOOKA', hp: 5500, scale: 4.0, color: 0x884422 },
    { wave: 7, name: "SOLAR SHIELD SENTINEL", weakness: 'LASER', hp: 6400, scale: 3.8, color: 0xaa8800 },
    { wave: 8, name: "SUPERSONIC SKY REAPER", weakness: 'SNIPER', hp: 7300, scale: 3.4, isFlying: true, color: 0x5533aa },
    { wave: 9, name: "CRIMSON FIRE ANT EMPRESS", weakness: 'LASER', hp: 8200, scale: 4.2, color: 0xdd1111 },
    { wave: 10, name: "MID-BOSS: KAIJU CENTIPEDE", weakness: 'BAZOOKA', hp: 10000, scale: 4.8, color: 0x442211 },
    { wave: 11, name: "BIOLUMINESCENT WEB QUEEN", weakness: 'FLAMETHROWER', hp: 11500, scale: 4.0, color: 0x00aa77 },
    { wave: 12, name: "PLASMA SKY DREADNOUGHT", weakness: 'SNIPER', hp: 13000, scale: 3.8, isFlying: true, color: 0x2255dd },
    { wave: 13, name: "HYPER-CHARGED PRISM CORE", weakness: 'LASER', hp: 14500, scale: 4.4, color: 0xaa00cc },
    { wave: 14, name: "ARMORED SIEGE TITAN", weakness: 'BAZOOKA', hp: 16000, scale: 4.6, color: 0x775533 },
    { wave: 15, name: "TOXIC CHRYSALIS MOTHER", weakness: 'FLAMETHROWER', hp: 17500, scale: 4.8, color: 0x22aa44 },
    { wave: 16, name: "TWIN SKY HARVESTER QUEEN", weakness: 'SNIPER', hp: 19500, scale: 4.2, isFlying: true, color: 0x772299 },
    { wave: 17, name: "PLASMA CITADEL WALKER", weakness: 'LASER', hp: 22000, scale: 5.0, color: 0x00aacc },
    { wave: 18, name: "MEGA-ARMORED BEHEMOTH", weakness: 'BAZOOKA', hp: 25000, scale: 5.2, color: 0x554422 },
    { wave: 19, name: "HIVE EMPRESS PRIMUS", weakness: 'FLAMETHROWER', hp: 28500, scale: 5.5, color: 0xcc2200 },
    { wave: 20, name: "FINAL BOSS: KAIJU MOTHERSHIP OVERLORD", weakness: 'DYNAMIC', hp: 35000, scale: 6.2, isFinalBoss: true, color: 0x9900ee }
];

// ========================================================
// 0. STATIC SHARED ASSET POOL (Zero GC churn / 60 FPS lock)
// ========================================================
const AlienAssetCache = {
    initialized: false,
    init() {
        if (this.initialized) return;
        this.initialized = true;

        // Shared Materials (MeshLambertMaterial: lightweight per-vertex lighting, eliminates shader stalls)
        this.matAntRed = new THREE.MeshLambertMaterial({ color: 0xb52215 });
        this.matAntBlack = new THREE.MeshLambertMaterial({ color: 0x161e1b });
        this.matEyeRed = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        this.matEyeGreen = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

        this.matSpider = new THREE.MeshLambertMaterial({ color: 0x2b1525 });
        this.matSpiderEye = new THREE.MeshBasicMaterial({ color: 0xeeff00 });

        this.matWaspBody = new THREE.MeshLambertMaterial({ color: 0x1f3344 });
        this.matWaspWing = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        this.matWaspStinger = new THREE.MeshBasicMaterial({ color: 0xff3300 });

        this.matBeetle = new THREE.MeshLambertMaterial({ color: 0x142838 });
        this.matBeetleHorn = new THREE.MeshLambertMaterial({ color: 0xd4af37 });

        // Shared Unit Geometries for Ants
        const tGeo = new THREE.SphereGeometry(0.55, 8, 6);
        tGeo.scale(1.0, 0.75, 1.3);
        this.geoAntThorax = tGeo;

        const hGeo = new THREE.SphereGeometry(0.42, 8, 6);
        hGeo.scale(1.1, 0.85, 1.1);
        this.geoAntHead = hGeo;

        this.geoAntEye = new THREE.SphereGeometry(0.12, 5, 5);
        this.geoAntJaw = new THREE.BoxGeometry(0.12, 0.08, 0.32);

        const aGeo = new THREE.SphereGeometry(0.85, 8, 8);
        aGeo.scale(1.0, 0.9, 1.7);
        this.geoAntAbdomen = aGeo;

        this.geoAntFemur = new THREE.CylinderGeometry(0.06, 0.05, 0.9, 5);
        this.geoAntTibia = new THREE.CylinderGeometry(0.04, 0.03, 1.1, 5);

        // Shared Geometries for Spiders
        const spH = new THREE.SphereGeometry(0.7, 8, 6);
        spH.scale(1.2, 0.7, 1.2);
        this.geoSpiderHead = spH;

        const spA = new THREE.SphereGeometry(1.1, 8, 8);
        spA.scale(1.1, 0.95, 1.4);
        this.geoSpiderAbdomen = spA;

        this.geoSpiderUpper = new THREE.CylinderGeometry(0.07, 0.05, 1.2, 5);
        this.geoSpiderLower = new THREE.CylinderGeometry(0.05, 0.03, 1.4, 5);

        // Shared Geometries for Flying Wasps
        this.geoWaspBody = new THREE.SphereGeometry(0.5, 7, 7);
        this.geoWaspTail = new THREE.ConeGeometry(0.25, 1.2, 6);
        this.geoWaspWing = new THREE.PlaneGeometry(1.4, 0.6);

        // Shared Geometries for Armored Beetles
        const bGeo = new THREE.SphereGeometry(1.2, 8, 8);
        bGeo.scale(1.2, 0.8, 1.4);
        this.geoBeetleShell = bGeo;
        this.geoBeetleHorn = new THREE.ConeGeometry(0.22, 1.8, 6);
    }
};

/**
 * High-performance AABB Obstacle Collision Resolution against Arena Containers/Bunkers
 * Prevents insects and bosses from clipping or walking through obstacles
 */
function resolveAlienBoxCollision(pos, radius, colliders) {
    if (!colliders || colliders.length === 0) return;

    for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        // Skip infinite ground floor plane and high ceiling
        if (box.max.y <= 0.15 || box.min.y >= 14.0) continue;

        // Check if alien vertical range intersects box
        if (pos.y + 1.8 < box.min.y || pos.y > box.max.y) continue;

        // Calculate closest point on box in XZ plane
        const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
        const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));

        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
                const overlap = radius - dist;
                pos.x += (dx / dist) * overlap;
                pos.z += (dz / dist) * overlap;
            } else {
                // If alien center is inside the box, push out along the shallowest axis
                const penMinX = Math.abs(pos.x - box.min.x);
                const penMaxX = Math.abs(pos.x - box.max.x);
                const penMinZ = Math.abs(pos.z - box.min.z);
                const penMaxZ = Math.abs(pos.z - box.max.z);
                const minPen = Math.min(penMinX, penMaxX, penMinZ, penMaxZ);

                if (minPen === penMinX) pos.x = box.min.x - radius;
                else if (minPen === penMaxX) pos.x = box.max.x + radius;
                else if (minPen === penMinZ) pos.z = box.min.z - radius;
                else pos.z = box.max.z + radius;
            }
        }
    }
}

// ========================================================
// 1. BASE ALIEN ENTITY
// ========================================================
class AlienEntity {
    constructor(scene, options = {}) {
        AlienAssetCache.init();

        this.scene = scene;
        this.id = options.id || ('alien_' + Math.random().toString(36).substring(2, 9));
        this.type = options.type || 'ANT_RED';
        this.isBoss = options.isBoss || false;
        this.weakness = options.weakness || null; // 'FLAMETHROWER', 'LASER', 'BAZOOKA', 'SNIPER'
        this.maxHealth = options.hp || 120;
        this.health = this.maxHealth;
        this.moveSpeed = options.speed || 7.0;
        this.damage = options.damage || 35;
        this.scale = options.scale || 1.0;
        this.isFlying = options.isFlying || false;
        this.collisionRadius = 1.0 * this.scale;

        this.position = options.position ? options.position.clone() : new THREE.Vector3(0, 0, 0);
        this.yaw = 0;
        this.isDead = false;
        this.deathTimer = 0;
        this.attackCooldown = 1.2;
        this.attackTimer = 0;
        this.animTime = Math.random() * 10;
        this.flinchTimer = 0;

        // Container root
        this.root = new THREE.Group();
        this.root.position.copy(this.position);
        this.root.scale.set(this.scale, this.scale, this.scale);
        this.scene.add(this.root);

        // Weakness Billboard (Boss only!)
        this.weaknessSprite = null;
    }

    takeDamage(amount, weaponType = 'ASSAULT_RIFLE') {
        if (this.isDead) return { damage: 0, isWeakness: false, isDead: false };

        let mult = 1.0;
        let isWeakness = false;

        if (this.isBoss && this.weakness) {
            // Check boss weakness match (overhead badge visible)
            if (this.weakness === weaponType) {
                mult = 3.0; // 3x MASSIVE BONUS DAMAGE for weakness match!
                isWeakness = true;
            } else if (weaponType === 'ASSAULT_RIFLE') {
                mult = 0.85; // Standard ballistic against boss
            } else {
                mult = 0.70; // Non-weakness special weapon resistance
            }
        } else if (!this.isBoss) {
            // Minions (kroco): No overhead indicator, players figure it out!
            if (weaponType === 'FLAMETHROWER' && (this.type === 'ANT_RED' || this.type === 'ANT_BLACK')) {
                mult = 1.5; // Flame incinerates ant swarms
            } else if (weaponType === 'BAZOOKA' && this.type === 'SPIDER') {
                mult = 1.6; // Bazooka blasts spider clusters
            } else if (weaponType === 'SNIPER' && this.type === 'WASP') {
                mult = 2.0; // Sniper snipes flying wasps
            } else if (weaponType === 'LASER' && this.type === 'BEETLE') {
                mult = 1.8; // Laser penetrates armored carapace
            }
        }

        const finalDamage = Math.round(amount * mult);
        this.health = Math.max(0, this.health - finalDamage);
        this.flinchTimer = 0.15;

        if (this.health <= 0) {
            this.isDead = true;
            this.deathTimer = 0;
        }

        this.updateOverheadHUD();
        return { damage: finalDamage, isWeakness: isWeakness, isDead: this.isDead };
    }

    updateOverheadHUD() {
        if (this.isBoss && this.weaknessSprite && this.weaknessSprite._updateHUD) {
            this.weaknessSprite._updateHUD(this.health, this.maxHealth);
        }
    }

    destroy() {
        if (this.root && this.root.parent) {
            this.scene.remove(this.root);
        }
    }
}

// ========================================================
// 2. PROCEDURAL GIANT ANT (SEMUT RAKSASA)
// ========================================================
class GiantAnt extends AlienEntity {
    constructor(scene, options = {}) {
        options.type = options.isBlack ? 'ANT_BLACK' : 'ANT_RED';
        options.hp = options.isBlack ? 180 : 120;
        options.speed = options.isBlack ? 6.2 : 8.2;
        options.damage = options.isBlack ? 45 : 30;
        super(scene, options);

        this.isBlack = options.isBlack || false;
        this.collisionRadius = 1.1 * this.scale;
        this.legs = [];
        this.buildMesh();
    }

    buildMesh() {
        const mat = this.isBlack ? AlienAssetCache.matAntBlack : AlienAssetCache.matAntRed;
        const eyeMat = this.isBlack ? AlienAssetCache.matEyeGreen : AlienAssetCache.matEyeRed;

        // Thorax (Center Body)
        this.thorax = new THREE.Mesh(AlienAssetCache.geoAntThorax, mat);
        this.thorax.position.y = 0.65;
        this.root.add(this.thorax);

        // Head
        this.head = new THREE.Mesh(AlienAssetCache.geoAntHead, mat);
        this.head.position.set(0, 0.68, -0.85);
        this.root.add(this.head);

        // Eyes
        const leftEye = new THREE.Mesh(AlienAssetCache.geoAntEye, eyeMat);
        leftEye.position.set(-0.25, 0.18, -0.22);
        this.head.add(leftEye);

        const rightEye = new THREE.Mesh(AlienAssetCache.geoAntEye, eyeMat);
        rightEye.position.set(0.25, 0.18, -0.22);
        this.head.add(rightEye);

        // Mandibles (Jaws)
        this.leftJaw = new THREE.Mesh(AlienAssetCache.geoAntJaw, mat);
        this.leftJaw.position.set(-0.2, -0.15, -0.45);
        this.leftJaw.rotation.y = 0.3;
        this.head.add(this.leftJaw);

        this.rightJaw = new THREE.Mesh(AlienAssetCache.geoAntJaw, mat);
        this.rightJaw.position.set(0.2, -0.15, -0.45);
        this.rightJaw.rotation.y = -0.3;
        this.head.add(this.rightJaw);

        // Abdomen (Large Gaster at back)
        this.abdomen = new THREE.Mesh(AlienAssetCache.geoAntAbdomen, mat);
        this.abdomen.position.set(0, 0.85, 1.45);
        this.root.add(this.abdomen);

        // 6 Articulated Legs
        for (let i = 0; i < 6; i++) {
            const isLeft = i % 2 === 0;
            const side = isLeft ? -1 : 1;
            const zOff = (Math.floor(i / 2) - 1) * 0.5;

            const legGroup = new THREE.Group();
            legGroup.position.set(side * 0.45, 0.55, zOff);

            const femur = new THREE.Mesh(AlienAssetCache.geoAntFemur, mat);
            femur.position.set(side * 0.45, 0.25, 0);
            femur.rotation.z = side * 1.1;
            legGroup.add(femur);

            const tibia = new THREE.Mesh(AlienAssetCache.geoAntTibia, mat);
            tibia.position.set(side * 0.85, -0.35, 0);
            tibia.rotation.z = -side * 0.45;
            legGroup.add(tibia);

            this.root.add(legGroup);
            this.legs.push({ group: legGroup, side: side, index: i });
        }
    }

    update(dt, playerPos, onPlayerDamaged, colliders) {
        if (this.isDead) {
            this.deathTimer += dt;
            this.root.position.y = Math.max(-0.5, this.root.position.y - dt * 2.0);
            this.root.rotation.z += dt * 3.0;
            return;
        }

        this.animTime += dt * 14.0;

        // Move towards player
        const dx = playerPos.x - this.root.position.x;
        const dz = playerPos.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);

        this.yaw = Math.atan2(dx, dz) + Math.PI;
        this.root.rotation.y = this.yaw;

        if (dist > 1.8) {
            const vx = (dx / dist) * this.moveSpeed * dt;
            const vz = (dz / dist) * this.moveSpeed * dt;
            this.root.position.x += vx;
            this.root.position.z += vz;

            // Obstacle & Container Collision Resolution
            resolveAlienBoxCollision(this.root.position, this.collisionRadius, colliders);
        } else {
            // Melee bite attack
            this.attackTimer += dt;
            if (this.attackTimer >= this.attackCooldown) {
                this.attackTimer = 0;
                if (onPlayerDamaged) onPlayerDamaged(this.damage, 'Giant Ant');
                if (window.soundEngine) window.soundEngine.playAlienChitter();
            }
        }

        // Animate 6 Legs walking gait
        for (let leg of this.legs) {
            const phase = (leg.index % 2 === 0 ? 0 : Math.PI) + (leg.index > 3 ? Math.PI * 0.5 : 0);
            leg.group.rotation.x = Math.sin(this.animTime + phase) * 0.45;
        }

        // Abdomen bobbing
        if (this.abdomen) {
            this.abdomen.position.y = 0.85 + Math.sin(this.animTime * 0.5) * 0.08;
        }

        // Mandibles pinch
        if (this.leftJaw && this.rightJaw) {
            const jawPinch = Math.sin(this.animTime * 0.8) * 0.2;
            this.leftJaw.rotation.y = 0.3 + jawPinch;
            this.rightJaw.rotation.y = -0.3 - jawPinch;
        }
    }
}

// ========================================================
// 3. PROCEDURAL ACID SPIDER (LABA-LABA ASAM)
// ========================================================
class AcidSpider extends AlienEntity {
    constructor(scene, options = {}) {
        options.type = 'SPIDER';
        options.hp = 220;
        options.speed = 6.8;
        options.damage = 40;
        super(scene, options);

        this.collisionRadius = 1.3 * this.scale;
        this.jumpTimer = Math.random() * 2;
        this.isJumping = false;
        this.vertVel = 0;
        this.legs = [];
        this.buildMesh();
    }

    buildMesh() {
        const mat = AlienAssetCache.matSpider;
        const eyeMat = AlienAssetCache.matSpiderEye;

        // Cephalothorax
        this.head = new THREE.Mesh(AlienAssetCache.geoSpiderHead, mat);
        this.head.position.y = 0.7;
        this.root.add(this.head);

        // Abdomen
        this.abdomen = new THREE.Mesh(AlienAssetCache.geoSpiderAbdomen, mat);
        this.abdomen.position.set(0, 0.95, 1.3);
        this.root.add(this.abdomen);

        // 8 Spider Legs
        for (let i = 0; i < 8; i++) {
            const isLeft = i % 2 === 0;
            const side = isLeft ? -1 : 1;
            const legIdx = Math.floor(i / 2);
            const zOff = (legIdx - 1.5) * 0.45;

            const legGroup = new THREE.Group();
            legGroup.position.set(side * 0.6, 0.65, zOff);

            const upper = new THREE.Mesh(AlienAssetCache.geoSpiderUpper, mat);
            upper.position.set(side * 0.6, 0.45, 0);
            upper.rotation.z = side * 1.2;
            legGroup.add(upper);

            const lower = new THREE.Mesh(AlienAssetCache.geoSpiderLower, mat);
            lower.position.set(side * 1.15, -0.35, 0);
            lower.rotation.z = -side * 0.55;
            legGroup.add(lower);

            this.root.add(legGroup);
            this.legs.push({ group: legGroup, index: i });
        }
    }

    update(dt, playerPos, onPlayerDamaged, colliders) {
        if (this.isDead) {
            this.deathTimer += dt;
            this.root.position.y = Math.max(-0.5, this.root.position.y - dt * 2.0);
            return;
        }

        this.animTime += dt * 12.0;

        const dx = playerPos.x - this.root.position.x;
        const dz = playerPos.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);

        this.yaw = Math.atan2(dx, dz) + Math.PI;
        this.root.rotation.y = this.yaw;

        // Leaping Spider jump behavior
        this.jumpTimer += dt;
        if (!this.isJumping && this.jumpTimer > 3.2 && dist < 22 && dist > 4) {
            this.isJumping = true;
            this.vertVel = 12.0;
            this.jumpTimer = 0;
            if (window.soundEngine) window.soundEngine.playAlienScreech();
        }

        if (this.isJumping) {
            this.vertVel -= 24.0 * dt;
            this.root.position.y += this.vertVel * dt;
            const leapSpeed = this.moveSpeed * 1.6;
            this.root.position.x += (dx / dist) * leapSpeed * dt;
            this.root.position.z += (dz / dist) * leapSpeed * dt;

            if (this.root.position.y <= 0) {
                this.root.position.y = 0;
                this.isJumping = false;
            }
            resolveAlienBoxCollision(this.root.position, this.collisionRadius, colliders);
        } else {
            if (dist > 2.0) {
                this.root.position.x += (dx / dist) * this.moveSpeed * dt;
                this.root.position.z += (dz / dist) * this.moveSpeed * dt;
                resolveAlienBoxCollision(this.root.position, this.collisionRadius, colliders);
            } else {
                this.attackTimer += dt;
                if (this.attackTimer >= this.attackCooldown) {
                    this.attackTimer = 0;
                    if (onPlayerDamaged) onPlayerDamaged(this.damage, 'Acid Spider');
                }
            }
        }

        // Animate Legs
        for (let leg of this.legs) {
            leg.group.rotation.x = Math.sin(this.animTime + leg.index * 0.7) * 0.35;
        }
    }
}

// ========================================================
// 4. PROCEDURAL FLYING WASP (TAWON TERBANG / DRONE ALIEN)
// ========================================================
class FlyingWasp extends AlienEntity {
    constructor(scene, options = {}) {
        options.type = 'WASP';
        options.hp = 140;
        options.speed = 8.5;
        options.damage = 25;
        options.isFlying = true;
        super(scene, options);

        this.flyAltitude = 5.5 + Math.random() * 3.5;
        this.root.position.y = this.flyAltitude;
        this.wingTime = 0;
        this.strafeAngle = Math.random() * Math.PI * 2;
        this.buildMesh();
    }

    buildMesh() {
        // Thorax
        this.body = new THREE.Mesh(AlienAssetCache.geoWaspBody, AlienAssetCache.matWaspBody);
        this.root.add(this.body);

        // Stinger tail
        const tail = new THREE.Mesh(AlienAssetCache.geoWaspTail, AlienAssetCache.matWaspStinger);
        tail.rotation.x = -Math.PI / 2;
        tail.position.set(0, -0.2, 0.8);
        this.root.add(tail);

        // Dual Wings
        this.leftWing = new THREE.Mesh(AlienAssetCache.geoWaspWing, AlienAssetCache.matWaspWing);
        this.leftWing.position.set(-0.8, 0.4, 0);
        this.root.add(this.leftWing);

        this.rightWing = new THREE.Mesh(AlienAssetCache.geoWaspWing, AlienAssetCache.matWaspWing);
        this.rightWing.position.set(0.8, 0.4, 0);
        this.root.add(this.rightWing);
    }

    update(dt, playerPos, onPlayerDamaged) {
        if (this.isDead) {
            this.root.position.y -= 14.0 * dt;
            this.root.rotation.x += 6.0 * dt;
            return;
        }

        this.wingTime += dt * 45.0; // Rapid wing flutter
        if (this.leftWing && this.rightWing) {
            this.leftWing.rotation.z = Math.sin(this.wingTime) * 0.65;
            this.rightWing.rotation.z = -Math.sin(this.wingTime) * 0.65;
        }

        const dx = playerPos.x - this.root.position.x;
        const dz = playerPos.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);

        this.yaw = Math.atan2(dx, dz) + Math.PI;
        this.root.rotation.y = this.yaw;

        // Hover & strafe at altitude
        this.strafeAngle += dt * 0.8;
        const targetX = playerPos.x + Math.cos(this.strafeAngle) * 9.0;
        const targetZ = playerPos.z + Math.sin(this.strafeAngle) * 9.0;

        this.root.position.x += (targetX - this.root.position.x) * dt * 2.2;
        this.root.position.z += (targetZ - this.root.position.z) * dt * 2.2;
        this.root.position.y = this.flyAltitude + Math.sin(this.wingTime * 0.1) * 0.5;

        // Fire stinger plasma
        this.attackTimer += dt;
        if (this.attackTimer > 1.8 && dist < 30) {
            this.attackTimer = 0;
            if (onPlayerDamaged) onPlayerDamaged(this.damage, 'Flying Wasp');
            if (window.soundEngine) window.soundEngine.playAlienSpit();
        }
    }
}

// ========================================================
// 5. PROCEDURAL ARMORED BEETLE (KUMBANG ZIRAH)
// ========================================================
class ArmoredBeetle extends AlienEntity {
    constructor(scene, options = {}) {
        options.type = 'BEETLE';
        options.hp = 450;
        options.speed = 4.8;
        options.damage = 50;
        super(scene, options);

        this.collisionRadius = 1.5 * this.scale;
        this.buildMesh();
    }

    buildMesh() {
        // Heavy Carapace
        const shell = new THREE.Mesh(AlienAssetCache.geoBeetleShell, AlienAssetCache.matBeetle);
        shell.position.y = 0.9;
        this.root.add(shell);

        // Huge Front Horn
        const horn = new THREE.Mesh(AlienAssetCache.geoBeetleHorn, AlienAssetCache.matBeetleHorn);
        horn.rotation.x = -Math.PI * 0.45;
        horn.position.set(0, 1.2, -1.8);
        this.root.add(horn);
    }

    update(dt, playerPos, onPlayerDamaged, colliders) {
        if (this.isDead) return;
        const dx = playerPos.x - this.root.position.x;
        const dz = playerPos.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);

        this.yaw = Math.atan2(dx, dz) + Math.PI;
        this.root.rotation.y = this.yaw;

        if (dist > 2.2) {
            this.root.position.x += (dx / dist) * this.moveSpeed * dt;
            this.root.position.z += (dz / dist) * this.moveSpeed * dt;
            resolveAlienBoxCollision(this.root.position, this.collisionRadius, colliders);
        } else {
            this.attackTimer += dt;
            if (this.attackTimer > this.attackCooldown) {
                this.attackTimer = 0;
                if (onPlayerDamaged) onPlayerDamaged(this.damage, 'Armored Beetle');
            }
        }
    }
}

// ========================================================
// 6. PROCEDURAL ALIEN BOSS (WAVE 1 - 20 WITH WEAKNESS BADGE)
// ========================================================
class AlienBoss extends AlienEntity {
    constructor(scene, bossDef) {
        super(scene, {
            id: 'boss_' + bossDef.wave,
            type: 'BOSS',
            isBoss: true,
            weakness: bossDef.weakness,
            hp: bossDef.hp,
            speed: 5.5,
            damage: 85,
            scale: bossDef.scale,
            isFlying: bossDef.isFlying || false
        });

        this.bossDef = bossDef;
        this.name = bossDef.name;
        this.wave = bossDef.wave;
        this.color = bossDef.color;
        this.collisionRadius = 2.2 * this.scale;

        // Dynamic final boss weakness switcher
        if (bossDef.isFinalBoss) {
            this.dynamicWeaknesses = ['FLAMETHROWER', 'LASER', 'BAZOOKA', 'SNIPER'];
            this.weakness = 'FLAMETHROWER';
        }

        this.buildBossModel();
        this.buildWeaknessBadge();
    }

    buildBossModel() {
        const mat = new THREE.MeshLambertMaterial({
            color: this.color
        });

        const glowColor = WEAKNESS_TYPES[this.weakness] ? WEAKNESS_TYPES[this.weakness].color : '#ffaa00';
        const glowMat = new THREE.MeshBasicMaterial({ color: glowColor });

        // Giant Main Torso
        const torsoGeo = new THREE.SphereGeometry(1.6, 10, 10);
        torsoGeo.scale(1.2, 0.9, 1.5);
        this.torso = new THREE.Mesh(torsoGeo, mat);
        this.torso.position.y = (this.isFlying ? 7.0 : 1.8);
        this.root.add(this.torso);

        // Spiked Armor Plates on back
        const spikeGeo = new THREE.ConeGeometry(0.3, 1.8, 6);
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(spikeGeo, glowMat);
            spike.position.set(0, 1.6, (i - 2) * 0.7);
            spike.rotation.x = (i - 2) * 0.15;
            this.torso.add(spike);
        }

        // Colossal Mandibles / Horns
        const jawGeo = new THREE.BoxGeometry(0.4, 0.3, 1.6);
        const lJaw = new THREE.Mesh(jawGeo, glowMat);
        lJaw.position.set(-0.8, -0.4, -1.8);
        lJaw.rotation.y = 0.35;
        this.torso.add(lJaw);

        const rJaw = new THREE.Mesh(jawGeo, glowMat);
        rJaw.position.set(0.8, -0.4, -1.8);
        rJaw.rotation.y = -0.35;
        this.torso.add(rJaw);
    }

    buildWeaknessBadge() {
        const wInfo = WEAKNESS_TYPES[this.weakness] || WEAKNESS_TYPES.FLAMETHROWER;

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');

        const drawHUD = (hp, maxHp) => {
            ctx.clearRect(0, 0, 512, 180);

            // Background tech pill
            ctx.fillStyle = 'rgba(10, 14, 24, 0.92)';
            ctx.strokeStyle = wInfo.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(8, 8, 496, 164, 24);
            ctx.fill();
            ctx.stroke();

            // Line 1: Boss Name & Wave
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 24px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`👑 BOSS WAVE ${this.wave}: ${this.name}`, 256, 42);

            // Line 2: WEAKNESS INDICATOR ICON & NAME
            ctx.fillStyle = wInfo.color;
            ctx.font = '900 32px -apple-system, monospace';
            ctx.fillText(`${wInfo.icon} LEMAH: ${wInfo.label} (3x DMG!)`, 256, 84);

            // Line 3: Health Bar
            const barW = 440;
            const barH = 18;
            const barX = 36;
            const barY = 110;

            ctx.fillStyle = '#222';
            ctx.fillRect(barX, barY, barW, barH);

            const hpRatio = Math.max(0, hp / maxHp);
            ctx.fillStyle = wInfo.color;
            ctx.fillRect(barX, barY, barW * hpRatio, barH);

            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barW, barH);

            // Health Number Text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`${Math.ceil(hp)} / ${maxHp} HP`, 256, 150);
        };

        drawHUD(this.health, this.maxHealth);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        this.weaknessSprite = new THREE.Sprite(mat);
        this.weaknessSprite.scale.set(7.5, 2.6, 1);
        this.weaknessSprite.position.set(0, (this.isFlying ? 10.5 : 4.5), 0);
        this.weaknessSprite._updateHUD = (hp, maxHp) => {
            drawHUD(hp, maxHp);
            texture.needsUpdate = true;
        };

        this.root.add(this.weaknessSprite);
    }

    update(dt, playerPos, onPlayerDamaged, colliders) {
        if (this.isDead) {
            this.deathTimer += dt;
            this.root.position.y -= 1.5 * dt;
            this.root.rotation.z += 0.5 * dt;
            return;
        }

        const dx = playerPos.x - this.root.position.x;
        const dz = playerPos.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);

        this.yaw = Math.atan2(dx, dz) + Math.PI;
        this.root.rotation.y = this.yaw;

        // Boss Movement
        const stopDist = this.isFlying ? 6.0 : 3.5;
        if (dist > stopDist) {
            this.root.position.x += (dx / dist) * this.moveSpeed * dt;
            this.root.position.z += (dz / dist) * this.moveSpeed * dt;
            if (!this.isFlying) {
                resolveAlienBoxCollision(this.root.position, this.collisionRadius, colliders);
            }
        } else {
            // Boss Stomp / Slam Attack
            this.attackTimer += dt;
            if (this.attackTimer > 2.0) {
                this.attackTimer = 0;
                if (onPlayerDamaged) onPlayerDamaged(this.damage, this.name);
                if (window.soundEngine) {
                    window.soundEngine.playBossStomp();
                    window.soundEngine.playBossRoar();
                }
            }
        }
    }
}

// ========================================================
// 7. 20-WAVE MANAGER (EDF ALIEN COORDINATOR)
// ========================================================
class AlienWaveManager {
    constructor(scene, vfx) {
        this.scene = scene;
        this.vfx = vfx;

        this.currentWave = 1;
        this.maxWaves = 20;

        // Wave Phases: 'INTERMISSION', 'SWARM', 'BOSS', 'WAVE_CLEARED', 'VICTORY'
        this.phase = 'INTERMISSION';
        this.intermissionTimer = 5.0; // 5s countdown between waves

        this.aliens = []; // Array of AlienEntity instances
        this.currentBoss = null;
        this.swarmTotalToSpawn = 0;
        this.swarmSpawned = 0;
        this.swarmSpawnInterval = 1.2;
        this.swarmSpawnTimer = 0;

        // Callbacks
        this.onWaveChange = null;
        this.onBossSpawned = null;
        this.onBossDefeated = null;
        this.onVictory = null;
    }

    startWave(waveNum) {
        this.currentWave = waveNum;
        this.phase = 'SWARM';
        this.currentBoss = null;

        // Scale swarm enemy count: Wave 1 = 12 minions, scaling up to ~45 minions in Wave 20
        this.swarmTotalToSpawn = 10 + waveNum * 2;
        this.swarmSpawned = 0;
        this.swarmSpawnTimer = 0;
        this.swarmSpawnInterval = Math.max(0.4, 1.4 - (waveNum * 0.04));

        if (this.onWaveChange) {
            this.onWaveChange(this.currentWave, this.maxWaves, 'SWARM');
        }

        if (window.soundEngine) {
            window.soundEngine.playAlienScreech();
        }
    }

    spawnMinion() {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.cos(angle) * (20 + Math.random() * 20);
        const z = Math.sin(angle) * (15 + Math.random() * 16);
        const pos = new THREE.Vector3(x, 0, z);

        // Pick minion variety according to wave level
        const rand = Math.random();
        let minion = null;

        if (this.currentWave >= 6 && rand < 0.25) {
            minion = new ArmoredBeetle(this.scene, { position: pos });
        } else if (this.currentWave >= 3 && rand < 0.45) {
            minion = new FlyingWasp(this.scene, { position: pos });
        } else if (this.currentWave >= 2 && rand < 0.70) {
            minion = new AcidSpider(this.scene, { position: pos });
        } else {
            const isBlack = Math.random() > 0.6;
            minion = new GiantAnt(this.scene, { position: pos, isBlack: isBlack });
        }

        this.aliens.push(minion);
        this.swarmSpawned++;
    }

    spawnBoss() {
        this.phase = 'BOSS';
        const bossDef = WAVE_BOSS_DEFINITIONS[this.currentWave - 1] || WAVE_BOSS_DEFINITIONS[0];

        // Boss spawns at far perimeter North inside arena
        const pos = new THREE.Vector3(0, 0, -28);
        this.currentBoss = new AlienBoss(this.scene, bossDef);
        this.currentBoss.root.position.copy(pos);
        this.aliens.push(this.currentBoss);

        if (window.soundEngine) {
            window.soundEngine.playBossRoar();
        }

        if (this.onBossSpawned) {
            this.onBossSpawned(this.currentBoss);
        }
    }

    update(dt, playerPos, onPlayerDamaged, showToastCallback, colliders = null) {
        // A. Handle Intermission Countdown
        if (this.phase === 'INTERMISSION') {
            this.intermissionTimer -= dt;
            if (this.intermissionTimer <= 0) {
                this.startWave(this.currentWave);
            }
            return;
        }

        // B. Handle Swarm Spawning Phase
        if (this.phase === 'SWARM') {
            if (this.swarmSpawned < this.swarmTotalToSpawn) {
                this.swarmSpawnTimer += dt;
                if (this.swarmSpawnTimer >= this.swarmSpawnInterval) {
                    this.swarmSpawnTimer = 0;
                    this.spawnMinion();
                }
            } else {
                // When swarm is mostly defeated (e.g. <= 3 remaining minions), SPAWN THE BOSS!
                const aliveMinions = this.aliens.filter(a => !a.isDead && !a.isBoss).length;
                if (aliveMinions <= 3 && !this.currentBoss) {
                    if (showToastCallback) {
                        showToastCallback(`⚠️ PERINGATAN: BOS WAVE ${this.currentWave} TELAH MUNCUL!`);
                    }
                    this.spawnBoss();
                }
            }
        }

        // C. Update all active aliens with collision resolution
        for (let i = this.aliens.length - 1; i >= 0; i--) {
            const alien = this.aliens[i];
            alien.update(dt, playerPos, onPlayerDamaged, colliders);

            // Clean up dead aliens after death animation
            if (alien.isDead && alien.deathTimer > 1.8) {
                alien.destroy();
                this.aliens.splice(i, 1);
            }
        }

        // D. Check Boss Defeat & Wave Cleared Condition
        if (this.phase === 'BOSS' && this.currentBoss && this.currentBoss.isDead) {
            this.phase = 'WAVE_CLEARED';
            if (window.soundEngine) window.soundEngine.playVictory();

            if (this.onBossDefeated) {
                this.onBossDefeated(this.currentBoss);
            }

            if (this.currentWave >= this.maxWaves) {
                // VICTORY! COMPLETED ALL 20 WAVES!
                this.phase = 'VICTORY';
                if (this.onVictory) this.onVictory();
            } else {
                // Advance to next wave after 5 seconds
                this.phase = 'INTERMISSION';
                this.intermissionTimer = 6.0;
                this.currentWave++;
                if (showToastCallback) {
                    showToastCallback(`🎉 WAVE ${this.currentWave - 1} SELESAI! Bersiap untuk Wave ${this.currentWave}...`);
                }
                if (this.onWaveChange) {
                    this.onWaveChange(this.currentWave, this.maxWaves, 'INTERMISSION');
                }
            }
        }
    }

    reset() {
        for (let alien of this.aliens) {
            alien.destroy();
        }
        this.aliens = [];
        this.currentBoss = null;
        this.currentWave = 1;
        this.phase = 'INTERMISSION';
        this.intermissionTimer = 4.0;
    }
}

window.AlienEntity = AlienEntity;
window.GiantAnt = GiantAnt;
window.AcidSpider = AcidSpider;
window.FlyingWasp = FlyingWasp;
window.ArmoredBeetle = ArmoredBeetle;
window.AlienBoss = AlienBoss;
window.AlienWaveManager = AlienWaveManager;
window.WEAKNESS_TYPES = WEAKNESS_TYPES;
window.WAVE_BOSS_DEFINITIONS = WAVE_BOSS_DEFINITIONS;
