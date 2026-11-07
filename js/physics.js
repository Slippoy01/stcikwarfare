/**
 * stickenade - Grenade Ballistics & Explosive Physics Engine
 * Realism & Feel: Parabolic gravity trajectory, continuous raycast bounce physics,
 * direct-hit detection, radial splash damage falloff, and explosive blast impulse
 * (Rocket Jumping / Blast Knockback).
 */

class GrenadePhysicsEngine {
    constructor(scene, arena, vfx) {
        this.scene = scene;
        this.arena = arena;
        this.vfx = vfx;

        this.grenades = []; // Active live grenades
        this.rockets = [];  // Active live bazooka rockets

        // Shared grenade geometry & materials
        this.initGrenadeMeshTemplate();
        this.initRocketMeshTemplate();
    }

    initRocketMeshTemplate() {
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x2e3528,
            roughness: 0.4,
            metalness: 0.7
        });
        const warheadMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.2,
            metalness: 0.9
        });
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        this.rocketTemplate = new THREE.Group();

        // Main body tube
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), bodyMat);
        body.rotateX(Math.PI / 2);
        this.rocketTemplate.add(body);

        // Pointed nose warhead
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.22, 12), warheadMat);
        nose.rotateX(-Math.PI / 2);
        nose.position.set(0, 0, -0.38);
        this.rocketTemplate.add(nose);

        // 4 Stabilizer Fins
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.12), bodyMat);
            fin.position.set(0, 0, 0.22);
            fin.rotation.z = (i * Math.PI) / 2;
            this.rocketTemplate.add(fin);
        }

        // Exhaust flame tip
        const ex = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), flameMat);
        ex.position.set(0, 0, 0.32);
        this.rocketTemplate.add(ex);
    }

    initGrenadeMeshTemplate() {
        // 40mm cylindrical grenade round with glowing LED fuse
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x333b47,
            roughness: 0.35,
            metalness: 0.8
        });

        const warheadMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.25,
            metalness: 0.9
        });

        const ledMat = new THREE.MeshBasicMaterial({
            color: 0xff2222
        });

        this.grenadeTemplate = new THREE.Group();

        // Casing
        const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 16), bodyMat);
        caseMesh.rotateX(Math.PI / 2);
        caseMesh.castShadow = true;
        this.grenadeTemplate.add(caseMesh);

        // Rounded Nose Warhead
        const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 12), warheadMat);
        noseMesh.position.set(0, 0, -0.12);
        noseMesh.castShadow = true;
        this.grenadeTemplate.add(noseMesh);

        // Blinking LED Fuse Tip
        const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), ledMat);
        ledMesh.position.set(0, 0, -0.18);
        this.grenadeTemplate.add(ledMesh);
    }

    /**
     * Launch a new grenade into the world
     */
    spawnGrenade(options) {
        const {
            id = 'g_' + Math.random().toString(36).substr(2, 9),
            origin,
            direction,
            owner = 'local', // 'local' | 'remote' | 'bot'
            speed = 38.0
        } = options;

        const mesh = this.grenadeTemplate.clone();
        mesh.position.copy(origin);
        mesh.lookAt(origin.clone().add(direction));
        this.scene.add(mesh);

        // Slightly elevated trajectory for realistic military grenade launcher feel
        const launchVel = direction.clone().multiplyScalar(speed);
        launchVel.y += 2.2; // small mortar arc boost

        const grenade = {
            id: id,
            owner: owner,
            mesh: mesh,
            pos: origin.clone(),
            prevPos: origin.clone(),
            vel: launchVel,
            rotVel: new THREE.Vector3(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16
            ),
            gravity: -19.5,      // Realistic parabolic drop
            drag: 0.998,
            restitution: 0.5,
            friction: 0.85,
            fuseTime: 3.5,       // Max life in air if shot straight into sky
            age: 0,
            bounces: 0,
            blastRadius: 6.5,    // Generous explosive radius
            maxDamage: 95.0,
            directHitBonus: 25.0, // Total 120 dmg on direct hit!
            blastImpulse: 38.0    // High explosive kinetic knockback!
        };

        this.grenades.push(grenade);

        // Play launch sound
        if (window.soundEngine) {
            window.soundEngine.playLaunch(owner === 'local');
        }

        return grenade;
    }

    /**
     * Launch a Bazooka Rocket into the world
     */
    spawnRocket(options) {
        const {
            id = 'r_' + Math.random().toString(36).substr(2, 9),
            origin,
            direction,
            owner = 'local',
            speed = 46.0
        } = options;

        if (!this.rocketTemplate) this.initRocketMeshTemplate();
        const mesh = this.rocketTemplate.clone();
        mesh.position.copy(origin);
        mesh.lookAt(origin.clone().add(direction));
        this.scene.add(mesh);

        const rocket = {
            id: id,
            owner: owner,
            mesh: mesh,
            pos: origin.clone(),
            prevPos: origin.clone(),
            vel: direction.clone().multiplyScalar(speed),
            age: 0,
            maxLife: 4.0,
            blastRadius: 8.5,
            directDamage: 220,
            splashDamage: 140
        };

        this.rockets.push(rocket);

        if (window.soundEngine) {
            window.soundEngine.playBazookaLaunch();
        }

        return rocket;
    }

    detonateRocket(rocket, hitAlien, localPlayer, enemyTarget, onDamageDealt, aliensList) {
        const pos = rocket.pos.clone();
        this.scene.remove(rocket.mesh);

        // Visual VFX
        if (this.vfx) {
            this.vfx.createExplosion(pos, rocket.blastRadius, true);
            this.vfx.addTrauma(0.32);
        }

        if (window.soundEngine) {
            const dist = localPlayer ? pos.distanceTo(localPlayer.position) : 0;
            window.soundEngine.playBazookaExplode(dist);
        }

        // Damage against aliens
        if (aliensList && aliensList.length > 0) {
            for (let alien of aliensList) {
                if (alien.isDead) continue;
                const dist = pos.distanceTo(alien.root.position);
                if (dist <= rocket.blastRadius) {
                    const isDirect = (alien === hitAlien);
                    const falloff = 1.0 - (dist / rocket.blastRadius);
                    const baseDmg = isDirect ? rocket.directDamage : (rocket.splashDamage * falloff);
                    const res = alien.takeDamage(baseDmg, 'BAZOOKA');

                    if (this.vfx) {
                        if (res.isWeakness) {
                            this.vfx.spawnWeaknessCombatText(res.damage, alien.root.position, '🚀');
                        } else {
                            this.vfx.spawnCombatText(Math.round(res.damage), alien.root.position, '#ffaa00');
                        }
                        this.vfx.createAlienBloodSplatter(alien.root.position, 14);
                    }
                    if (onDamageDealt) {
                        onDamageDealt({ damage: res.damage, isDirect: isDirect, isWeakness: res.isWeakness, victim: alien });
                    }
                }
            }
        }
    }

    /**
     * Detonate a grenade at position
     */
    detonate(grenade, isDirect = false, directTarget = null, localPlayer, enemyTarget, onDamageDealt) {
        const pos = grenade.pos.clone();

        // 1. Remove 3D projectile mesh
        this.scene.remove(grenade.mesh);

        // 2. Spawn visual VFX (Fireball, shockwave, shrapnel, smoke, scorch)
        this.vfx.createExplosion(pos, grenade.blastRadius, isDirect);

        // 3. Play distance-attenuated audio
        if (window.soundEngine && localPlayer) {
            const distToLocal = localPlayer.position.distanceTo(pos);
            window.soundEngine.playExplosion(distToLocal, isDirect);
        }

        // 4. Area-Of-Effect (AOE) Splash Damage & Impulse to Local Player
        if (localPlayer) {
            const localHeadPos = localPlayer.position.clone().add(new THREE.Vector3(0, 0.9, 0));
            const dist = localHeadPos.distanceTo(pos);

            if (dist < grenade.blastRadius) {
                const falloff = 1.0 - (dist / grenade.blastRadius);
                const selfDamageMult = (grenade.owner === 'local') ? 0.35 : 1.0; // reduced self-damage so rocket jumping is viable!
                const dmg = Math.round(grenade.maxDamage * falloff * selfDamageMult);

                // Explosive Knockback Impulse to Local Player
                const impulseDir = localHeadPos.clone().sub(pos).normalize();
                if (impulseDir.y < 0.45) impulseDir.y = 0.45; // Generous vertical lift to launch into the air
                impulseDir.normalize();

                const impulseForce = grenade.blastImpulse * falloff * (grenade.owner === 'local' ? 1.35 : 1.15);
                localPlayer.applyImpulse(impulseDir.multiplyScalar(impulseForce));

                // Rocket Jump whoosh sound
                if (grenade.owner === 'local' && dist < 3.5 && window.soundEngine) {
                    window.soundEngine.playRocketJump();
                }

                // Apply damage to local player (self-blast rocket jumping or local AI bot)
                // In online multiplayer PvP, damage from remote grenades is delivered via authoritative DAMAGE packets
                if (dmg > 0 && (grenade.owner === 'local' || grenade.owner === 'bot')) {
                    localPlayer.takeDamage(dmg, grenade.owner);
                }
            }
        }

        // 5. AOE Damage & Impulse to Enemy / Opponent Targets
        const targets = Array.isArray(enemyTarget) ? enemyTarget : (enemyTarget ? [enemyTarget] : []);
        for (let target of targets) {
            if (!target || target.isDead) continue;

            const enemyCenter = target.position.clone().add(new THREE.Vector3(0, 0.9, 0));
            const dist = enemyCenter.distanceTo(pos);

            // Explosive Knockback Impulse to Enemy / Opponent!
            if (dist < grenade.blastRadius) {
                const falloff = 1.0 - (dist / grenade.blastRadius);
                const enemyImpulseDir = enemyCenter.clone().sub(pos).normalize();
                if (enemyImpulseDir.y < 0.45) enemyImpulseDir.y = 0.45;
                enemyImpulseDir.normalize();

                const enemyForce = enemyImpulseDir.multiplyScalar(grenade.blastImpulse * falloff * 1.15);
                if (target.applyImpulse) {
                    target.applyImpulse(enemyForce);
                }
            }

            // If target has respawn immunity active, block damage & deflect
            if (target.isImmune) {
                if (isDirect && directTarget === target) {
                    if (this.vfx) this.vfx.spawnCombatText("🛡️ KEBAL!", pos, "#00f0ff", true);
                    if (window.soundEngine) window.soundEngine.playShieldDeflect();
                } else if (dist < grenade.blastRadius) {
                    if (this.vfx) this.vfx.spawnCombatText("🛡️ KEBAL!", enemyCenter, "#00f0ff", true);
                    if (window.soundEngine) window.soundEngine.playShieldDeflect();
                }
                continue;
            }

            if (isDirect && directTarget === target) {
                // Direct Hit! Maximum damage
                const totalDmg = Math.round(grenade.maxDamage + grenade.directHitBonus);
                target.flinch();
                if (onDamageDealt) {
                    onDamageDealt({
                        target: target,
                        damage: totalDmg,
                        isDirect: true,
                        hitPos: pos,
                        owner: grenade.owner
                    });
                }
            } else if (dist < grenade.blastRadius) {
                // Splash damage
                const falloff = 1.0 - (dist / grenade.blastRadius);
                const splashDmg = Math.round(grenade.maxDamage * falloff);
                if (splashDmg > 0) {
                    target.flinch();
                    if (onDamageDealt) {
                        onDamageDealt({
                            target: target,
                            damage: splashDmg,
                            isDirect: false,
                            hitPos: pos,
                            owner: grenade.owner
                        });
                    }
                }
            }
        }
    }

    /**
     * Check if a line segment [p1, p2] intersects an entity's bounding cylinder/sphere
     */
    checkEntityDirectHit(p1, p2, entityPos, radius = 0.55, height = 1.8) {
        // Entity cylinder approximation
        const seg = p2.clone().sub(p1);
        const segLen = seg.length();
        if (segLen < 0.001) return false;

        const dir = seg.clone().normalize();
        const bottom = entityPos.clone();
        const top = entityPos.clone().add(new THREE.Vector3(0, height, 0));

        // Point-to-segment distance check
        for (let t = 0; t <= 1.0; t += 0.2) {
            const sample = p1.clone().lerp(p2, t);
            if (sample.y >= bottom.y && sample.y <= top.y) {
                const dx = sample.x - entityPos.x;
                const dz = sample.z - entityPos.z;
                if (dx * dx + dz * dz <= radius * radius) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Update active grenades and bazooka rockets
     */
    update(dt, localPlayer, enemyTarget, onDamageDealt, aliensList = null) {
        // --- 1. UPDATE LIVE GRENADES ---
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const g = this.grenades[i];
            g.age += dt;
            g.prevPos.copy(g.pos);

            // Gravity & drag
            g.vel.y += g.gravity * dt;
            g.vel.multiplyScalar(g.drag);

            // Proposed next position
            const nextPos = g.pos.clone().addScaledVector(g.vel, dt);

            // Check Direct Hit against Aliens (if in EDF mode)
            let hitAlien = null;
            if (aliensList && aliensList.length > 0) {
                for (let alien of aliensList) {
                    if (alien && !alien.isDead) {
                        const hitRadius = (alien.scale || 1.0) * 0.9;
                        const hitHeight = (alien.scale || 1.0) * 1.8;
                        if (this.checkEntityDirectHit(g.pos, nextPos, alien.root.position, hitRadius, hitHeight)) {
                            hitAlien = alien;
                            break;
                        }
                    }
                }
            }

            if (hitAlien) {
                this.detonate(g, true, hitAlien, localPlayer, enemyTarget, onDamageDealt);
                this.grenades.splice(i, 1);
                continue;
            }

            // Direct Hit Check against Enemy / Opponents
            const targets = Array.isArray(enemyTarget) ? enemyTarget : (enemyTarget ? [enemyTarget] : []);
            let hitTarget = null;
            for (let t of targets) {
                if (t && !t.isDead && (g.owner !== 'bot' || g.age > 0.08)) {
                    if (this.checkEntityDirectHit(g.pos, nextPos, t.position)) {
                        hitTarget = t;
                        break;
                    }
                }
            }

            if (hitTarget) {
                // Detonate immediately on direct impact
                this.detonate(g, true, hitTarget, localPlayer, enemyTarget, onDamageDealt);
                this.grenades.splice(i, 1);
                continue;
            }

            // Direct Hit Check against Local Player
            if (localPlayer && (g.owner !== 'local' || g.age > 0.08)) {
                if (this.checkEntityDirectHit(g.pos, nextPos, localPlayer.position)) {
                    this.detonate(g, true, localPlayer, localPlayer, enemyTarget, onDamageDealt);
                    this.grenades.splice(i, 1);
                    continue;
                }
            }

            // Arena Geometry Collision
            const hit = this.arena.raycastBounce(g.pos, nextPos);
            if (hit) {
                g.pos.copy(hit.point);
                this.detonate(g, false, null, localPlayer, enemyTarget, onDamageDealt);
                this.grenades.splice(i, 1);
                continue;
            }

            // Floor Collision
            if (nextPos.y <= 0.12) {
                g.pos.copy(nextPos);
                g.pos.y = 0.05;
                this.detonate(g, false, null, localPlayer, enemyTarget, onDamageDealt);
                this.grenades.splice(i, 1);
                continue;
            }

            // Update Position & 3D Mesh in Flight
            g.pos.copy(nextPos);
            g.mesh.position.copy(g.pos);
            g.mesh.rotation.x += g.rotVel.x * dt;
            g.mesh.rotation.y += g.rotVel.y * dt;
            g.mesh.rotation.z += g.rotVel.z * dt;

            this.vfx.createGrenadeTrail(g.pos);

            if (g.age >= g.fuseTime) {
                this.detonate(g, false, null, localPlayer, enemyTarget, onDamageDealt);
                this.grenades.splice(i, 1);
            }
        }

        // --- 2. UPDATE LIVE BAZOOKA ROCKETS ---
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const r = this.rockets[i];
            r.age += dt;
            r.prevPos.copy(r.pos);

            const nextPos = r.pos.clone().addScaledVector(r.vel, dt);

            // Direct hit against Aliens
            let hitAlien = null;
            if (aliensList && aliensList.length > 0) {
                for (let alien of aliensList) {
                    if (alien && !alien.isDead) {
                        const hitRadius = (alien.scale || 1.0) * 1.1;
                        const hitHeight = (alien.scale || 1.0) * 2.2;
                        if (this.checkEntityDirectHit(r.pos, nextPos, alien.root.position, hitRadius, hitHeight)) {
                            hitAlien = alien;
                            break;
                        }
                    }
                }
            }

            if (hitAlien) {
                this.detonateRocket(r, hitAlien, localPlayer, enemyTarget, onDamageDealt, aliensList);
                this.rockets.splice(i, 1);
                continue;
            }

            // Direct hit against players (PvP or self)
            if (localPlayer && r.age > 0.06 && this.checkEntityDirectHit(r.pos, nextPos, localPlayer.position)) {
                this.detonateRocket(r, null, localPlayer, enemyTarget, onDamageDealt, aliensList);
                this.rockets.splice(i, 1);
                continue;
            }

            // Arena Geometry Hit
            const hit = this.arena.raycastBounce(r.pos, nextPos);
            if (hit) {
                r.pos.copy(hit.point);
                this.detonateRocket(r, null, localPlayer, enemyTarget, onDamageDealt, aliensList);
                this.rockets.splice(i, 1);
                continue;
            }

            // Floor hit
            if (nextPos.y <= 0.15) {
                r.pos.copy(nextPos);
                this.detonateRocket(r, null, localPlayer, enemyTarget, onDamageDealt, aliensList);
                this.rockets.splice(i, 1);
                continue;
            }

            // Update flight
            r.pos.copy(nextPos);
            r.mesh.position.copy(r.pos);
            this.vfx.createGrenadeTrail(r.pos);

            if (r.age >= r.maxLife) {
                this.detonateRocket(r, null, localPlayer, enemyTarget, onDamageDealt, aliensList);
                this.rockets.splice(i, 1);
            }
        }
    }
}

window.GrenadePhysicsEngine = GrenadePhysicsEngine;

