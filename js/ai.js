/**
 * stickenade - Tactical AI Bot Engine
 * Features: Parabolic Ballistic Aim Prediction, Tactical Strafing,
 * Danger Sensing (dodging live grenades), High-Ground / Jump-Pad usage,
 * and Dynamic Difficulty.
 */

class TacticalBotController {
    constructor(botStickman, arena, physicsEngine, vfx) {
        this.bot = botStickman;
        this.arena = arena;
        this.physics = physicsEngine;
        this.vfx = vfx;

        // Bot State Machine: 'ROAM', 'ENGAGE', 'RETREAT', 'DODGE'
        this.state = 'ENGAGE';
        this.fireCooldown = 2.0;
        this.fireTimer = 1.0;
        this.dodgeTimer = 0;
        this.strafeDir = 1;
        this.strafeChangeTimer = 0;

        // Physical locomotion
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.moveSpeed = 6.2;
        this.gravity = -24.0;
        this.isGrounded = true;

        // Projectile ballistics configuration
        this.projectileSpeed = 38.0;
        this.gravityConstant = 19.5;
        this.aimError = 0.035;
    }

    applyImpulse(force) {
        this.velocity.add(force);
        this.isGrounded = false;
        this.bot.isGrounded = false;
    }

    setDifficulty(diff = 'normal') {
        const isSniper = (this.bot.weaponMode === 'SNIPER');
        if (diff === 'easy') {
            this.moveSpeed = 4.5;
            this.fireCooldown = isSniper ? 3.4 : 3.0;
            this.aimError = 0.08;
            this.bot.name = "BOT-ROOKIE";
        } else if (diff === 'brutal') {
            this.moveSpeed = 8.0;
            this.fireCooldown = isSniper ? 1.9 : 1.35;
            this.aimError = 0.012;
            this.bot.name = "BOT-COMMANDO";
        } else { // normal
            this.moveSpeed = 6.2;
            this.fireCooldown = isSniper ? 2.5 : 2.0;
            this.aimError = 0.035;
            this.bot.name = "BOT-OMEGA";
        }
        if (this.bot.updateNameTag) this.bot.updateNameTag();
    }

    /**
     * Solve parabolic ballistic angle to hit a 3D target
     */
    calculateBallisticElevation(distHorizontal, diffY, speed, g) {
        const v2 = speed * speed;
        const v4 = v2 * v2;
        const term = v4 - g * (g * distHorizontal * distHorizontal + 2 * diffY * v2);

        if (term < 0) {
            // Target is out of theoretical range, aim at 45 degrees for maximum range
            return Math.PI / 4;
        }

        // Low arc solution for faster impact
        const root = Math.sqrt(term);
        const angle = Math.atan((v2 - root) / (g * distHorizontal));
        return angle;
    }

    /**
     * Main AI Update Loop
     */
    update(dt, player) {
        if (!player || this.bot.isDead) return;

        const botPos = this.bot.position;
        const playerPos = player.position;

        // 1. Aim Tracking
        const isSniper = (this.bot.weaponMode === 'SNIPER');
        const toPlayer = playerPos.clone().sub(botPos);
        const distXZ = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);
        const diffY = toPlayer.y - botPos.y;

        // Calculate horizontal target Yaw
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        this.bot.targetYaw = targetYaw;

        // Calculate vertical pitch angle (Ballistic arc for Grenade, Direct line for Sniper)
        let elevationAngle;
        if (isSniper) {
            elevationAngle = Math.atan2(diffY, distXZ);
        } else {
            elevationAngle = this.calculateBallisticElevation(distXZ, diffY, this.projectileSpeed, this.gravityConstant);
        }

        // Add subtle aim variance for realism
        const aimJitter = (Math.sin(performance.now() * 0.003) * (this.aimError || 0.035));
        this.bot.targetPitch = elevationAngle + aimJitter;

        // 2. Danger Detection: Detect nearby live grenades and dodge
        let nearestDanger = null;
        let minDist = 7.0;

        for (let g of this.physics.grenades) {
            if (g.owner === 'local') {
                const d = g.pos.distanceTo(botPos);
                if (d < minDist) {
                    minDist = d;
                    nearestDanger = g;
                }
            }
        }

        if (nearestDanger && this.dodgeTimer <= 0) {
            this.state = 'DODGE';
            this.dodgeTimer = 0.8;
            // Jump away from grenade
            if (this.isGrounded) {
                this.velocity.y = 10.5;
                const escapeDir = botPos.clone().sub(nearestDanger.pos).normalize();
                this.velocity.x += escapeDir.x * 8;
                this.velocity.z += escapeDir.z * 8;
            }
        }

        // 3. Movement Behavior
        let wishDir = new THREE.Vector3(0, 0, 0);

        if (this.state === 'DODGE') {
            this.dodgeTimer -= dt;
            if (this.dodgeTimer <= 0) {
                this.state = 'ENGAGE';
            }
        } else {
            // Strafing combat rhythm
            this.strafeChangeTimer -= dt;
            if (this.strafeChangeTimer <= 0) {
                this.strafeDir = Math.random() > 0.5 ? 1 : -1;
                this.strafeChangeTimer = 1.2 + Math.random() * 2.0;

                // Occasional jump for vertical mobility
                if (this.isGrounded && Math.random() > 0.6) {
                    this.velocity.y = 9.5;
                }
            }

            // Move laterally relative to player line of sight
            const forward = new THREE.Vector3(Math.sin(targetYaw), 0, Math.cos(targetYaw));
            const right = new THREE.Vector3(forward.z, 0, -forward.x);

            // Maintain tactical distance (Longer range for sniper)
            const maxDist = isSniper ? 42.0 : 25.0;
            const minDistCombat = isSniper ? 16.0 : 9.0;

            if (distXZ > maxDist) {
                wishDir.add(forward.clone().multiplyScalar(0.7));
            } else if (distXZ < minDistCombat) {
                wishDir.add(forward.clone().multiplyScalar(-0.8));
            }

            wishDir.add(right.multiplyScalar(this.strafeDir * 0.9));
        }

        if (wishDir.lengthSq() > 0.001) {
            wishDir.normalize();
            this.velocity.x = wishDir.x * this.moveSpeed;
            this.velocity.z = wishDir.z * this.moveSpeed;
            this.bot.isMoving = true;
        } else {
            this.velocity.x *= 0.8;
            this.velocity.z *= 0.8;
            this.bot.isMoving = false;
        }

        // Gravity
        this.velocity.y += this.gravity * dt;

        // Apply proposed movement
        botPos.addScaledVector(this.velocity, dt);

        // Check Jump Pads / Trampoline
        const padHit = this.arena.checkJumpPad(botPos);
        if (padHit && this.velocity.y <= 0) {
            const forceY = (typeof padHit === 'object') ? padHit.force : padHit;
            this.velocity.y = forceY;
            if (typeof padHit === 'object') {
                if (padHit.dirX) this.velocity.x = padHit.dirX;
                if (padHit.dirZ) this.velocity.z = padHit.dirZ;
            }
            this.isGrounded = false;
            if (this.vfx && this.vfx.createJumpPadPulse) {
                const pulseColor = (padHit && (padHit.theme === 'GOLD' || padHit.force > 22.0)) ? 0xffaa00 : 0x00f0ff;
                this.vfx.createJumpPadPulse(padHit.pos || botPos, pulseColor);
            }
            if (window.soundEngine) {
                window.soundEngine.playJumpPad();
            }
        }

        // Resolve collision against arena
        this.isGrounded = this.arena.resolvePlayerCollision(botPos, 0.45, 1.8);
        if (this.isGrounded && this.velocity.y < 0) {
            this.velocity.y = 0;
        }
        this.bot.isGrounded = this.isGrounded;
        this.bot.targetPos.copy(botPos);

        // 4. Weapons & Firing System
        this.fireTimer -= dt;
        const maxEngagementDist = isSniper ? 82.0 : 42.0;

        if (this.fireTimer <= 0 && distXZ < maxEngagementDist) {
            if (isSniper) {
                this.fireSniper(player, distXZ);
            } else {
                this.fireGrenade();
            }
            this.fireTimer = this.fireCooldown + (Math.random() - 0.5) * 0.6;
        }
    }

    /**
     * Bot fires a grenade using calculated ballistic pitch
     */
    fireGrenade() {
        const botPos = this.bot.position.clone().add(new THREE.Vector3(0, 1.3, 0));

        // Compute 3D direction vector from yaw and pitch
        const yaw = this.bot.targetYaw;
        const pitch = this.bot.targetPitch;

        const dir = new THREE.Vector3(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch)
        ).normalize();

        // Launch grenade
        this.physics.spawnGrenade({
            origin: botPos.clone().add(dir.clone().multiplyScalar(0.7)),
            direction: dir,
            owner: 'bot',
            speed: this.projectileSpeed
        });

        // Trigger bot muzzle flash
        this.vfx.createMuzzleFlash(botPos.clone().add(dir.clone().multiplyScalar(0.7)), dir);
    }

    /**
     * Bot fires a high-velocity .50 cal sniper shot
     */
    fireSniper(player, distXZ) {
        const botPos = this.bot.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        const playerPos = player.position.clone();

        // Check line of sight with arena walls
        const toPlayer = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(botPos);
        const distToPlayer = toPlayer.length();
        const shootDir = toPlayer.clone().normalize();
        const shootRay = new THREE.Ray(botPos, shootDir);

        // Check line of sight with arena colliders
        let blockedByWall = false;
        let wallHitPoint = null;

        if (this.arena && this.arena.colliders) {
            for (const box of this.arena.colliders) {
                const hit = new THREE.Vector3();
                if (shootRay.intersectBox(box, hit)) {
                    const d = botPos.distanceTo(hit);
                    if (d < distToPlayer - 0.5) {
                        blockedByWall = true;
                        wallHitPoint = hit;
                        break;
                    }
                }
            }
        }

        // Bot muzzle flash
        this.vfx.createMuzzleFlash(botPos.clone().add(shootDir.clone().multiplyScalar(0.9)), shootDir);

        if (blockedByWall && wallHitPoint) {
            // Hit arena wall before player
            this.vfx.createSniperTracer(botPos, wallHitPoint, false);
            this.vfx.createBulletImpact(wallHitPoint, new THREE.Vector3(0, 1, 0), false);
            if (window.soundEngine) {
                window.soundEngine.playSniperShot(distXZ);
            }
            return;
        }

        // Clear line of sight: calculate hit probability
        const missProbability = Math.min(0.65, (distXZ / 70.0) * this.aimError * 14);
        const isHit = Math.random() > missProbability;

        if (isHit && !player.isDead) {
            // 20% headshot probability, 80% body hit
            const isHeadshot = Math.random() < 0.22;
            const targetPos = playerPos.clone().add(new THREE.Vector3(0, isHeadshot ? 1.72 : 1.1, 0));
            const damage = isHeadshot ? 150 : 75;

            // Bullet tracer & impact
            this.vfx.createSniperTracer(botPos, targetPos, isHeadshot);
            this.vfx.createBulletImpact(targetPos, shootDir.clone().negate(), true);

            // Audio
            if (window.soundEngine) {
                window.soundEngine.playSniperShot(distXZ);
                if (isHeadshot) window.soundEngine.playHeadshot();
            }

            // Damage player
            if (window.game) {
                window.game.onLocalPlayerDamaged(damage, 'bot');
            }
        } else {
            // Near-miss shot
            const missOffset = new THREE.Vector3(
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 1.5,
                (Math.random() - 0.5) * 2.5
            );
            const missPos = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)).add(missOffset);

            this.vfx.createSniperTracer(botPos, missPos, false);
            this.vfx.createBulletImpact(missPos, new THREE.Vector3(0, 1, 0), false);

            if (window.soundEngine) {
                window.soundEngine.playSniperShot(distXZ);
            }
        }
    }
}

window.TacticalBotController = TacticalBotController;

