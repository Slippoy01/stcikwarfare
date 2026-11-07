/**
 * stickenade - 1st-Person Procedural Weapon Rig
 * 100% procedural 3D models built with Three.js primitives.
 * Supported Weapons:
 *   1. 40mm Revolving Grenade Launcher (Drum, Holographic Sight, Contact Detonation)
 *   2. .50 Cal Tactical Bolt-Action Sniper Rifle (Optical Scope, Bipod, Fluted Barrel, Box Mag)
 */

class WeaponRig {
    constructor(camera) {
        this.camera = camera;

        // Weapon Mode: 'GRENADE' | 'SNIPER' | 'ASSAULT_RIFLE' | 'FLAMETHROWER' | 'LASER' | 'BAZOOKA'
        this.weaponMode = 'GRENADE';

        // Weapon Ammo Pools & Maximums
        this.ammoPools = {
            'GRENADE': { current: 6, max: 6, reserve: Infinity, label: '40MM GRENADE' },
            'SNIPER': { current: 25, max: 25, reserve: 0, label: '.50 CAL MAGNUM' },
            'ASSAULT_RIFLE': { current: 35, max: 35, reserve: Infinity, label: 'ASSAULT RIFLE' },
            'FLAMETHROWER': { current: 200, max: 200, reserve: 0, label: 'FLAMETHROWER' },
            'LASER': { current: 100, max: 100, reserve: 0, label: 'LASER CANNON' },
            'BAZOOKA': { current: 15, max: 15, reserve: 0, label: 'BAZOOKA' }
        };

        // Active Loadout for quick switching (keys 1-5 / mouse wheel / touch UI)
        this.loadout = ['ASSAULT_RIFLE'];
        this.currentSlotIndex = 0;

        // Ammo & Reload State
        this.maxAmmo = 6;
        this.currentAmmo = 6;
        this.isReloading = false;
        this.reloadTime = 1.6;
        this.reloadTimer = 0;

        // Grenade Launcher specific
        this.cylinderAngle = 0;
        this.targetCylinderAngle = 0;

        // Sniper Rifle specific
        this.boltTimer = 0;
        this.boltCycleTime = 1.05;

        // Weapon Stances: HIP vs ADS
        this.isADS = false;
        this.adsProgress = 0; // [0 -> 1]

        // Base Offsets relative to camera
        this.hipOffset = new THREE.Vector3(0.24, -0.25, -0.45);
        this.adsOffset = new THREE.Vector3(0.0, -0.19, -0.36);

        // Recoil Spring Dynamics
        this.recoilZ = 0;
        this.recoilRotX = 0;
        this.recoilVelZ = 0;
        this.recoilVelRotX = 0;

        // Weapon Sway & Movement Bob
        this.bobTime = 0;
        this.swayX = 0;
        this.swayY = 0;

        // Container object attached to camera
        this.root = new THREE.Group();
        this.camera.add(this.root);

        // Build procedural weapon meshes
        this.buildProceduralLauncher();
        this.buildProceduralSniper();
        this.buildProceduralAssaultRifle();
        this.buildProceduralFlamethrower();
        this.buildProceduralLaser();
        this.buildProceduralBazooka();

        // Default to Grenade Launcher
        this.setMode('GRENADE');
    }

    /**
     * Switch Weapon Mode
     */
    setMode(mode) {
        // Save current ammo of previous weapon
        if (this.ammoPools[this.weaponMode]) {
            this.ammoPools[this.weaponMode].current = this.currentAmmo;
        }

        this.weaponMode = mode;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.boltTimer = 0;
        this.setADS(false);

        // Hide all weapon models
        if (this.launcherMesh) this.launcherMesh.visible = false;
        if (this.sniperMesh) this.sniperMesh.visible = false;
        if (this.arMesh) this.arMesh.visible = false;
        if (this.flameMesh) this.flameMesh.visible = false;
        if (this.laserMesh) this.laserMesh.visible = false;
        if (this.bazookaMesh) this.bazookaMesh.visible = false;

        const pool = this.ammoPools[mode] || { current: 35, max: 35 };
        this.maxAmmo = pool.max;
        this.currentAmmo = pool.current;

        if (mode === 'SNIPER') {
            this.reloadTime = 2.4;
            this.hipOffset.set(0.22, -0.23, -0.44);
            this.adsOffset.set(0.0, -0.15, -0.32);
            this.muzzlePoint = this.sniperMuzzlePoint;
            if (this.sniperMesh) this.sniperMesh.visible = true;
        } else if (mode === 'ASSAULT_RIFLE') {
            this.reloadTime = 1.8;
            this.hipOffset.set(0.22, -0.24, -0.42);
            this.adsOffset.set(0.0, -0.17, -0.32);
            this.muzzlePoint = this.arMuzzlePoint;
            if (this.arMesh) this.arMesh.visible = true;
        } else if (mode === 'FLAMETHROWER') {
            this.reloadTime = 2.0;
            this.hipOffset.set(0.24, -0.26, -0.46);
            this.adsOffset.set(0.0, -0.20, -0.38);
            this.muzzlePoint = this.flameMuzzlePoint;
            if (this.flameMesh) this.flameMesh.visible = true;
        } else if (mode === 'LASER') {
            this.reloadTime = 2.0;
            this.hipOffset.set(0.22, -0.24, -0.44);
            this.adsOffset.set(0.0, -0.18, -0.34);
            this.muzzlePoint = this.laserMuzzlePoint;
            if (this.laserMesh) this.laserMesh.visible = true;
        } else if (mode === 'BAZOOKA') {
            this.reloadTime = 2.6;
            this.hipOffset.set(0.26, -0.24, -0.46);
            this.adsOffset.set(0.0, -0.18, -0.36);
            this.muzzlePoint = this.bazookaMuzzlePoint;
            if (this.bazookaMesh) this.bazookaMesh.visible = true;
        } else {
            this.weaponMode = 'GRENADE';
            this.reloadTime = 1.6;
            this.hipOffset.set(0.24, -0.25, -0.45);
            this.adsOffset.set(0.0, -0.19, -0.36);
            this.muzzlePoint = this.launcherMuzzlePoint;
            if (this.launcherMesh) this.launcherMesh.visible = true;
        }

        this.root.position.copy(this.hipOffset);

        const slotIdx = this.loadout.indexOf(mode);
        if (slotIdx !== -1) {
            this.currentSlotIndex = slotIdx;
        }
    }

    setLoadout(weaponsList, defaultMode = null) {
        if (!weaponsList || weaponsList.length === 0) weaponsList = ['ASSAULT_RIFLE'];
        this.loadout = weaponsList.slice();
        this.currentSlotIndex = 0;
        this.setMode(defaultMode || this.loadout[0]);
    }

    switchToSlot(index) {
        if (index >= 0 && index < this.loadout.length) {
            this.currentSlotIndex = index;
            this.setMode(this.loadout[index]);
            return true;
        }
        return false;
    }

    nextWeapon() {
        if (this.loadout.length <= 1) return;
        this.currentSlotIndex = (this.currentSlotIndex + 1) % this.loadout.length;
        this.setMode(this.loadout[this.currentSlotIndex]);
    }

    prevWeapon() {
        if (this.loadout.length <= 1) return;
        this.currentSlotIndex = (this.currentSlotIndex - 1 + this.loadout.length) % this.loadout.length;
        this.setMode(this.loadout[this.currentSlotIndex]);
    }

    refillSpecialAmmo() {
        this.ammoPools['FLAMETHROWER'].current = this.ammoPools['FLAMETHROWER'].max;
        this.ammoPools['LASER'].current = this.ammoPools['LASER'].max;
        this.ammoPools['BAZOOKA'].current = this.ammoPools['BAZOOKA'].max;
        this.ammoPools['SNIPER'].current = this.ammoPools['SNIPER'].max;
        if (this.ammoPools[this.weaponMode]) {
            this.currentAmmo = this.ammoPools[this.weaponMode].current;
        }
        return true;
    }

    // ========================================================
    // 1. PROCEDURAL 40MM GRENADE LAUNCHER
    // ========================================================
    buildProceduralLauncher() {
        const gunmetalMat = new THREE.MeshStandardMaterial({
            color: 0x1f232b,
            roughness: 0.35,
            metalness: 0.85
        });

        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x0f1115,
            roughness: 0.7,
            metalness: 0.2
        });

        const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.25,
            metalness: 0.9
        });

        const warheadMat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff,
            roughness: 0.3,
            metalness: 0.4,
            emissive: 0x0088aa,
            emissiveIntensity: 0.4
        });

        this.launcherMesh = new THREE.Group();

        // Barrel
        const barrelOuterGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.52, 24);
        barrelOuterGeo.rotateX(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelOuterGeo, gunmetalMat);
        barrel.position.set(0, 0.04, -0.28);
        this.launcherMesh.add(barrel);

        const shroudGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.38, 16, 1, true);
        shroudGeo.rotateX(Math.PI / 2);
        const shroud = new THREE.Mesh(shroudGeo, darkMat);
        shroud.position.set(0, 0.04, -0.24);
        this.launcherMesh.add(shroud);

        const muzzleGeo = new THREE.CylinderGeometry(0.058, 0.052, 0.06, 16);
        muzzleGeo.rotateX(Math.PI / 2);
        const muzzle = new THREE.Mesh(muzzleGeo, gunmetalMat);
        muzzle.position.set(0, 0.04, -0.54);
        this.launcherMesh.add(muzzle);

        this.launcherMuzzlePoint = new THREE.Object3D();
        this.launcherMuzzlePoint.position.set(0, 0.04, -0.60);
        this.launcherMesh.add(this.launcherMuzzlePoint);

        // Cylinder Assembly
        this.cylinderPivot = new THREE.Group();
        this.cylinderPivot.position.set(0, 0, 0.02);
        this.launcherMesh.add(this.cylinderPivot);

        const cylinderBodyGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.28, 24);
        cylinderBodyGeo.rotateX(Math.PI / 2);
        this.cylinderDrum = new THREE.Mesh(cylinderBodyGeo, gunmetalMat);
        this.cylinderPivot.add(this.cylinderDrum);

        this.grenadeMeshes = [];
        const chamberRadius = 0.046;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const cx = Math.cos(angle) * chamberRadius;
            const cy = Math.sin(angle) * chamberRadius;

            const roundGroup = new THREE.Group();
            roundGroup.position.set(cx, cy, 0);

            const caseGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.20, 12);
            caseGeo.rotateX(Math.PI / 2);
            const casing = new THREE.Mesh(caseGeo, brassMat);
            roundGroup.add(casing);

            const tipGeo = new THREE.SphereGeometry(0.023, 12, 12);
            const tip = new THREE.Mesh(tipGeo, warheadMat);
            tip.position.set(0, 0, -0.10);
            roundGroup.add(tip);

            this.cylinderDrum.add(roundGroup);
            this.grenadeMeshes.push(roundGroup);
        }

        // Receiver Frame
        const receiverGeo = new THREE.BoxGeometry(0.12, 0.16, 0.42);
        const receiver = new THREE.Mesh(receiverGeo, gunmetalMat);
        receiver.position.set(0, -0.01, 0.08);
        this.launcherMesh.add(receiver);

        // Rail & Sight
        const railGeo = new THREE.BoxGeometry(0.04, 0.025, 0.45);
        const rail = new THREE.Mesh(railGeo, darkMat);
        rail.position.set(0, 0.105, -0.12);
        this.launcherMesh.add(rail);

        const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.08), darkMat);
        sightBase.position.set(0, 0.135, -0.14);
        this.launcherMesh.add(sightBase);

        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.015), darkMat);
        hood.position.set(0, 0.17, -0.14);
        this.launcherMesh.add(hood);

        const reticleMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
        });
        const reticle = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.012, 16), reticleMat);
        reticle.position.set(0, 0.17, -0.138);
        this.launcherMesh.add(reticle);

        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), reticleMat);
        dot.position.set(0, 0.17, -0.137);
        this.launcherMesh.add(dot);

        // Grip & Stock
        const gripGeo = new THREE.BoxGeometry(0.045, 0.18, 0.065);
        gripGeo.rotateX(0.28);
        const grip = new THREE.Mesh(gripGeo, darkMat);
        grip.position.set(0, -0.14, 0.14);
        this.launcherMesh.add(grip);

        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.14, 12), darkMat);
        foregrip.position.set(0, -0.07, -0.22);
        this.launcherMesh.add(foregrip);

        const stockTubeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.28, 12);
        stockTubeGeo.rotateX(Math.PI / 2);
        const stockTube = new THREE.Mesh(stockTubeGeo, gunmetalMat);
        stockTube.position.set(0, 0.02, 0.36);
        this.launcherMesh.add(stockTube);

        const buttpad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.03), darkMat);
        buttpad.position.set(0, 0.01, 0.50);
        this.launcherMesh.add(buttpad);

        this.root.add(this.launcherMesh);
    }

    // ========================================================
    // 2. PROCEDURAL .50 CAL TACTICAL SNIPER RIFLE
    // ========================================================
    buildProceduralSniper() {
        const sniperSteelMat = new THREE.MeshStandardMaterial({
            color: 0x181c22,
            roughness: 0.25,
            metalness: 0.92
        });

        const darkChassisMat = new THREE.MeshStandardMaterial({
            color: 0x0c0e12,
            roughness: 0.72,
            metalness: 0.25
        });

        const lensMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.85,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x004455,
            emissiveIntensity: 0.4
        });

        const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.25,
            metalness: 0.9
        });

        this.sniperMesh = new THREE.Group();

        // 1. Long Fluted Precision Barrel (1.1m long)
        const barrelGeo = new THREE.CylinderGeometry(0.025, 0.020, 1.08, 16);
        barrelGeo.rotateX(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, sniperSteelMat);
        barrel.position.set(0, 0.045, -0.62);
        this.sniperMesh.add(barrel);

        // Heavy Arrowhead Muzzle Brake
        const brakeGeo = new THREE.BoxGeometry(0.068, 0.046, 0.14);
        const brake = new THREE.Mesh(brakeGeo, sniperSteelMat);
        brake.position.set(0, 0.045, -1.18);
        this.sniperMesh.add(brake);

        // Muzzle side port vents
        const ventL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.08), darkChassisMat);
        ventL.position.set(-0.035, 0.045, -1.18);
        this.sniperMesh.add(ventL);
        const ventR = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.08), darkChassisMat);
        ventR.position.set(0.035, 0.045, -1.18);
        this.sniperMesh.add(ventR);

        // Muzzle world anchor
        this.sniperMuzzlePoint = new THREE.Object3D();
        this.sniperMuzzlePoint.position.set(0, 0.045, -1.26);
        this.sniperMesh.add(this.sniperMuzzlePoint);

        // Ejection Port Anchor for spent .50 cal brass shell casings
        this.sniperEjectPoint = new THREE.Object3D();
        this.sniperEjectPoint.position.set(0.065, 0.06, 0.05);
        this.sniperMesh.add(this.sniperEjectPoint);

        // 2. Octagonal Handguard / Heat Shroud
        const handguardGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.52, 8);
        handguardGeo.rotateX(Math.PI / 2);
        const handguard = new THREE.Mesh(handguardGeo, darkChassisMat);
        handguard.position.set(0, 0.045, -0.34);
        this.sniperMesh.add(handguard);

        // Folding Bipod Legs (Under Handguard)
        const bipodMount = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.06), sniperSteelMat);
        bipodMount.position.set(0, -0.01, -0.52);
        this.sniperMesh.add(bipodMount);

        const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.22, 8), darkChassisMat);
        lLeg.rotateZ(0.25);
        lLeg.rotateX(-0.1);
        lLeg.position.set(-0.05, -0.11, -0.52);
        this.sniperMesh.add(lLeg);

        const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.22, 8), darkChassisMat);
        rLeg.rotateZ(-0.25);
        rLeg.rotateX(-0.1);
        rLeg.position.set(0.05, -0.11, -0.52);
        this.sniperMesh.add(rLeg);

        // 3. Steel Receiver Body
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.11, 0.44), sniperSteelMat);
        receiver.position.set(0, 0.01, 0.08);
        this.sniperMesh.add(receiver);

        // 4. Bolt-Action Assembly with Handle & Knob
        this.sniperBolt = new THREE.Group();
        this.sniperBolt.position.set(0.045, 0.055, 0.10);
        this.sniperMesh.add(this.sniperBolt);

        const boltRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), sniperSteelMat);
        boltRod.rotateZ(-Math.PI / 3);
        boltRod.position.set(0.035, 0.02, 0);
        this.sniperBolt.add(boltRod);

        const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), darkChassisMat);
        boltKnob.position.set(0.07, 0.04, 0);
        this.sniperBolt.add(boltKnob);

        // 5. High-Power Optical Sniper Scope
        // Scope Rail Mount
        const scopeRail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 0.42), darkChassisMat);
        scopeRail.position.set(0, 0.075, 0.04);
        this.sniperMesh.add(scopeRail);

        const scopeRingFront = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12), darkChassisMat);
        scopeRingFront.rotateX(Math.PI / 2);
        scopeRingFront.position.set(0, 0.125, -0.06);
        this.sniperMesh.add(scopeRingFront);

        const scopeRingRear = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12), darkChassisMat);
        scopeRingRear.rotateX(Math.PI / 2);
        scopeRingRear.position.set(0, 0.125, 0.16);
        this.sniperMesh.add(scopeRingRear);

        // Scope Central Tube
        const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.46, 16), sniperSteelMat);
        scopeTube.rotateX(Math.PI / 2);
        scopeTube.position.set(0, 0.125, 0.05);
        this.sniperMesh.add(scopeTube);

        // Scope Front Objective Bell (Large intake)
        const frontBell = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.025, 0.12, 16), darkChassisMat);
        frontBell.rotateX(Math.PI / 2);
        frontBell.position.set(0, 0.125, -0.22);
        this.sniperMesh.add(frontBell);

        // Front Coated Optical Lens
        const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), lensMat);
        frontLens.rotateY(Math.PI);
        frontLens.position.set(0, 0.125, -0.28);
        this.sniperMesh.add(frontLens);

        // Rear Ocular Eyepiece Bell
        const rearBell = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, 0.08, 16), darkChassisMat);
        rearBell.rotateX(Math.PI / 2);
        rearBell.position.set(0, 0.125, 0.28);
        this.sniperMesh.add(rearBell);

        // Scope Elevation Turret (Top Knob)
        const elevTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 12), darkChassisMat);
        elevTurret.position.set(0, 0.155, 0.05);
        this.sniperMesh.add(elevTurret);

        // Scope Windage Turret (Right Knob)
        const windTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 12), darkChassisMat);
        windTurret.rotateZ(Math.PI / 2);
        windTurret.position.set(0.032, 0.125, 0.05);
        this.sniperMesh.add(windTurret);

        // 6. Detachable 5-Round Box Magazine
        this.sniperMag = new THREE.Group();
        this.sniperMag.position.set(0, -0.10, 0.05);
        this.sniperMesh.add(this.sniperMag);

        const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.09), darkChassisMat);
        magBody.rotation.x = -0.12;
        this.sniperMag.add(magBody);

        // 7. Tactical Ergonomic Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.17, 0.065), darkChassisMat);
        grip.rotation.x = 0.32;
        grip.position.set(0, -0.12, 0.22);
        this.sniperMesh.add(grip);

        // 8. Skeleton Sniper Stock
        const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 12), sniperSteelMat);
        stockTube.rotateX(Math.PI / 2);
        stockTube.position.set(0, 0.035, 0.44);
        this.sniperMesh.add(stockTube);

        // Cheek Rest Riser
        const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.16), darkChassisMat);
        cheekRest.position.set(0, 0.065, 0.42);
        this.sniperMesh.add(cheekRest);

        // Rubber Buttpad
        const buttpad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.18, 0.035), darkChassisMat);
        buttpad.position.set(0, 0.02, 0.58);
        this.sniperMesh.add(buttpad);

        this.root.add(this.sniperMesh);
    }

    // ========================================================
    // 3. PROCEDURAL ASSAULT RIFLE (35-ROUND RAPID CARBINE)
    // ========================================================
    buildProceduralAssaultRifle() {
        this.arMesh = new THREE.Group();
        this.arMesh.visible = false;

        const gunmetalMat = new THREE.MeshStandardMaterial({
            color: 0x222730,
            roughness: 0.35,
            metalness: 0.85
        });
        const darkPolyMat = new THREE.MeshStandardMaterial({
            color: 0x11141a,
            roughness: 0.75,
            metalness: 0.2
        });
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x181a20,
            roughness: 0.2,
            metalness: 0.95
        });
        const cyanSightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

        // Receiver Body
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.14, 0.52), gunmetalMat);
        receiver.position.set(0, 0, 0.05);
        this.arMesh.add(receiver);

        // Top Tactical Picatinny Rail
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.48), darkPolyMat);
        rail.position.set(0, 0.082, 0.05);
        this.arMesh.add(rail);

        // Holographic Reflex Optic on Top
        const opticFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.12), darkPolyMat);
        opticFrame.position.set(0, 0.12, 0.0);
        this.arMesh.add(opticFrame);

        const opticLens = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.045), cyanSightMat);
        opticLens.position.set(0, 0.12, -0.055);
        this.arMesh.add(opticLens);

        // Handguard
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.34), darkPolyMat);
        handguard.position.set(0, 0.01, -0.32);
        this.arMesh.add(handguard);

        // Fluted Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.48);
        this.arMesh.add(barrel);

        // Flash Hider / Muzzle Brake
        const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 8), barrelMat);
        muzzleBrake.rotation.x = Math.PI / 2;
        muzzleBrake.position.set(0, 0.02, -0.68);
        this.arMesh.add(muzzleBrake);

        // Curved 35-Round Magazine
        this.arMag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.28, 0.12), darkPolyMat);
        this.arMag.position.set(0, -0.16, -0.04);
        this.arMag.rotation.x = -0.15;
        this.arMesh.add(this.arMag);

        // Pistol Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.08), darkPolyMat);
        grip.position.set(0, -0.14, 0.18);
        grip.rotation.x = 0.35;
        this.arMesh.add(grip);

        // Adjustable Tactical Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.12, 0.28), darkPolyMat);
        stock.position.set(0, 0.01, 0.42);
        this.arMesh.add(stock);

        // Muzzle Point for raycasts & particles
        this.arMuzzlePoint = new THREE.Object3D();
        this.arMuzzlePoint.position.set(0, 0.02, -0.72);
        this.arMesh.add(this.arMuzzlePoint);

        // Ejection Port Anchor for spent 5.56mm brass shell casings
        this.arEjectPoint = new THREE.Object3D();
        this.arEjectPoint.position.set(0.065, 0.05, -0.05);
        this.arMesh.add(this.arEjectPoint);

        this.root.add(this.arMesh);
    }

    // ========================================================
    // 4. PROCEDURAL FLAMETHROWER (HEAVY INFERNO PROJECTOR)
    // ========================================================
    buildProceduralFlamethrower() {
        this.flameMesh = new THREE.Group();
        this.flameMesh.visible = false;

        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x4a3218,
            roughness: 0.45,
            metalness: 0.75
        });
        const tankMat = new THREE.MeshStandardMaterial({
            color: 0xcc5500,
            roughness: 0.3,
            metalness: 0.8
        });
        const pipeMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.3,
            metalness: 0.9
        });
        const pilotFlameMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });

        // Projector Body Frame
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.65), bronzeMat);
        frame.position.set(0, 0, 0.05);
        this.flameMesh.add(frame);

        // Dual Under-barrel Pressurized Fuel Canisters
        const tank1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.38, 12), tankMat);
        tank1.rotation.x = Math.PI / 2;
        tank1.position.set(-0.09, -0.14, 0.02);
        this.flameMesh.add(tank1);

        const tank2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.38, 12), tankMat);
        tank2.rotation.x = Math.PI / 2;
        tank2.position.set(0.09, -0.14, 0.02);
        this.flameMesh.add(tank2);

        // Perforated Heat Shroud Nozzle
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.36, 12), pipeMat);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 0.02, -0.45);
        this.flameMesh.add(shroud);

        // Constant Pilot Flame Tip
        const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pilotFlameMat);
        pilot.position.set(0, 0.08, -0.62);
        this.flameMesh.add(pilot);

        // Dual Heavy Grips
        const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.07), pipeMat);
        rearGrip.position.set(0, -0.15, 0.22);
        rearGrip.rotation.x = 0.3;
        this.flameMesh.add(rearGrip);

        const fwdGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.06), pipeMat);
        fwdGrip.position.set(0, -0.12, -0.18);
        this.flameMesh.add(fwdGrip);

        this.flameMuzzlePoint = new THREE.Object3D();
        this.flameMuzzlePoint.position.set(0, 0.02, -0.66);
        this.flameMesh.add(this.flameMuzzlePoint);

        this.root.add(this.flameMesh);
    }

    // ========================================================
    // 5. PROCEDURAL LASER CANNON (DIRECTED ENERGY RAILGUN)
    // ========================================================
    buildProceduralLaser() {
        this.laserMesh = new THREE.Group();
        this.laserMesh.visible = false;

        const chassisMat = new THREE.MeshStandardMaterial({
            color: 0x16202c,
            roughness: 0.25,
            metalness: 0.9
        });
        const energyGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x00aacc,
            roughness: 0.2,
            metalness: 0.8
        });

        // Sci-Fi Main Barrel Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.62), chassisMat);
        body.position.set(0, 0, 0.02);
        this.laserMesh.add(body);

        // 3 Glowing Magnetic Acceleration Rings (Energy Coils)
        for (let i = 0; i < 3; i++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 16), energyGlowMat);
            coil.position.set(0, 0.02, -0.18 - i * 0.14);
            this.laserMesh.add(coil);
        }

        // Inner Focusing Prism Chamber
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 12), coreMat);
        core.rotation.x = Math.PI / 2;
        core.position.set(0, 0.02, -0.32);
        this.laserMesh.add(core);

        // Muzzle Optical Focus Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.08, 12), energyGlowMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.02, -0.62);
        this.laserMesh.add(lens);

        // Plasma Battery Pack at Rear
        const battery = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 12), energyGlowMat);
        battery.position.set(0, -0.12, 0.12);
        this.laserMesh.add(battery);

        this.laserMuzzlePoint = new THREE.Object3D();
        this.laserMuzzlePoint.position.set(0, 0.02, -0.66);
        this.laserMesh.add(this.laserMuzzlePoint);

        this.root.add(this.laserMesh);
    }

    // ========================================================
    // 6. PROCEDURAL BAZOOKA (HEAVY ROCKET LAUNCHER)
    // ========================================================
    buildProceduralBazooka() {
        this.bazookaMesh = new THREE.Group();
        this.bazookaMesh.visible = false;

        const oliveDrabMat = new THREE.MeshStandardMaterial({
            color: 0x2e3528,
            roughness: 0.5,
            metalness: 0.6
        });
        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x111316,
            roughness: 0.35,
            metalness: 0.85
        });
        const warheadMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.25,
            metalness: 0.9
        });

        // Colossal Main Shoulder Launch Tube
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 1.05, 16), oliveDrabMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.04, -0.05);
        this.bazookaMesh.add(tube);

        // Flared Rear Exhaust Blast Bell
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.095, 0.22, 16), darkMetalMat);
        exhaust.rotation.x = -Math.PI / 2;
        exhaust.position.set(0, 0.04, 0.54);
        this.bazookaMesh.add(exhaust);

        // Front Reinforcement Ring
        const frontRing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), darkMetalMat);
        frontRing.rotation.x = Math.PI / 2;
        frontRing.position.set(0, 0.04, -0.56);
        this.bazookaMesh.add(frontRing);

        // Visible Rocket Warhead Nose inside chamber
        this.rocketNose = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 12), warheadMat);
        this.rocketNose.position.set(0, 0.04, -0.58);
        this.bazookaMesh.add(this.rocketNose);

        // Side Mounted Electronic Optic Sight Box
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.16), darkMetalMat);
        sight.position.set(-0.12, 0.11, -0.15);
        this.bazookaMesh.add(sight);

        // Shoulder Rest & Forward Handle
        const shoulderRest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.26), darkMetalMat);
        shoulderRest.position.set(0, -0.07, 0.22);
        this.bazookaMesh.add(shoulderRest);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.06), darkMetalMat);
        handle.position.set(0, -0.14, -0.12);
        handle.rotation.x = 0.25;
        this.bazookaMesh.add(handle);

        this.bazookaMuzzlePoint = new THREE.Object3D();
        this.bazookaMuzzlePoint.position.set(0, 0.04, -0.65);
        this.bazookaMesh.add(this.bazookaMuzzlePoint);

        this.root.add(this.bazookaMesh);
    }

    /**
     * Trigger Weapon Fire
     */
    triggerFire() {
        if (this.currentAmmo <= 0 || this.isReloading) return false;

        const adsMult = this.isADS ? 0.6 : 1.0;

        if (this.weaponMode === 'ASSAULT_RIFLE') {
            this.currentAmmo--;
            this.recoilVelZ += 0.09 * adsMult;
            this.recoilVelRotX += 0.12 * adsMult;
            if (this.ammoPools['ASSAULT_RIFLE']) this.ammoPools['ASSAULT_RIFLE'].current = this.currentAmmo;
            return true;
        }

        if (this.weaponMode === 'FLAMETHROWER') {
            this.currentAmmo--;
            this.recoilVelZ += 0.03 * adsMult;
            this.recoilVelRotX += 0.04 * adsMult;
            if (this.ammoPools['FLAMETHROWER']) this.ammoPools['FLAMETHROWER'].current = this.currentAmmo;
            return true;
        }

        if (this.weaponMode === 'LASER') {
            this.currentAmmo--;
            this.recoilVelZ += 0.12 * adsMult;
            this.recoilVelRotX += 0.14 * adsMult;
            if (this.ammoPools['LASER']) this.ammoPools['LASER'].current = this.currentAmmo;
            return true;
        }

        if (this.weaponMode === 'BAZOOKA') {
            this.currentAmmo--;
            this.recoilVelZ += 0.44 * adsMult;
            this.recoilVelRotX += 0.52 * adsMult;
            if (this.ammoPools['BAZOOKA']) this.ammoPools['BAZOOKA'].current = this.currentAmmo;
            if (this.rocketNose) this.rocketNose.visible = false;
            return true;
        }

        if (this.weaponMode === 'SNIPER') {
            if (this.boltTimer > 0) return false;
            this.currentAmmo--;
            this.recoilVelZ += 0.36 * adsMult;
            this.recoilVelRotX += 0.46 * adsMult;
            this.boltTimer = this.boltCycleTime;
            if (this.ammoPools['SNIPER']) this.ammoPools['SNIPER'].current = this.currentAmmo;
            if (window.soundEngine) window.soundEngine.playBoltCycle();
            return true;
        }

        // Grenade Launcher Fire
        this.currentAmmo--;
        this.recoilVelZ += 0.22 * adsMult;
        this.recoilVelRotX += 0.32 * adsMult;
        this.targetCylinderAngle += Math.PI / 3;

        const spentIdx = (6 - (this.currentAmmo % 6) - 1) % 6;
        if (this.grenadeMeshes[spentIdx]) {
            this.grenadeMeshes[spentIdx].visible = false;
        }
        if (this.ammoPools['GRENADE']) this.ammoPools['GRENADE'].current = this.currentAmmo;
        return true;
    }

    /**
     * Trigger tactical reload
     */
    startReload() {
        if (this.isReloading || this.currentAmmo >= this.maxAmmo) return;

        // Special weapons only reload at Special Ammo Depot
        if (this.weaponMode === 'FLAMETHROWER' || this.weaponMode === 'LASER' || this.weaponMode === 'BAZOOKA') {
            return;
        }

        this.isReloading = true;
        this.reloadTimer = 0;

        if (this.weaponMode === 'ASSAULT_RIFLE') {
            if (window.soundEngine) window.soundEngine.playAssaultRifleReload();
        } else if (this.weaponMode === 'SNIPER') {
            if (window.soundEngine) window.soundEngine.playSniperReload();
        } else {
            if (window.soundEngine) window.soundEngine.playReload();
        }
    }

    /**
     * Get world position and forward direction of active muzzle
     * Updates world matrices to guarantee zero-latency frame accuracy
     */
    getMuzzleWorldTransform() {
        if (this.root) this.root.updateMatrixWorld(true);

        let muzzle = this.launcherMuzzlePoint;
        if (this.weaponMode === 'SNIPER') muzzle = this.sniperMuzzlePoint;
        else if (this.weaponMode === 'ASSAULT_RIFLE') muzzle = this.arMuzzlePoint;
        else if (this.weaponMode === 'FLAMETHROWER') muzzle = this.flameMuzzlePoint;
        else if (this.weaponMode === 'LASER') muzzle = this.laserMuzzlePoint;
        else if (this.weaponMode === 'BAZOOKA') muzzle = this.bazookaMuzzlePoint;

        const worldPos = new THREE.Vector3();
        if (muzzle) {
            muzzle.updateMatrixWorld(true);
            muzzle.getWorldPosition(worldPos);
        } else {
            worldPos.copy(this.camera.position);
        }

        const worldDir = new THREE.Vector3();
        this.camera.getWorldDirection(worldDir);

        return { pos: worldPos, dir: worldDir };
    }

    /**
     * Get world position and rightward ejection vector for brass shell casings
     */
    getEjectionWorldTransform() {
        if (this.root) this.root.updateMatrixWorld(true);

        let eject = this.arEjectPoint;
        if (this.weaponMode === 'SNIPER') eject = this.sniperEjectPoint;

        const worldPos = new THREE.Vector3();
        if (eject) {
            eject.updateMatrixWorld(true);
            eject.getWorldPosition(worldPos);
        } else {
            worldPos.copy(this.camera.position).add(new THREE.Vector3(0.12, -0.15, -0.2));
        }

        const worldDir = new THREE.Vector3(1, 0, 0);
        worldDir.applyQuaternion(this.camera.quaternion);

        return { pos: worldPos, dir: worldDir };
    }

    /**
     * Set Aim Down Sights (ADS)
     */
    setADS(active) {
        const changed = (this.isADS !== active);
        this.isADS = active;

        if (changed && window.soundEngine) {
            window.soundEngine.playScopeZoom(active);
        }

        const scopeOverlay = document.getElementById('sniper-scope-overlay');
        const crosshair = document.getElementById('crosshair-container');

        if (this.weaponMode === 'SNIPER') {
            if (scopeOverlay) scopeOverlay.style.display = active ? 'block' : 'none';
            if (crosshair) crosshair.style.display = active ? 'none' : 'block';
        } else {
            if (scopeOverlay) scopeOverlay.style.display = 'none';
            if (crosshair) crosshair.style.display = 'block';
        }
    }

    /**
     * Update weapon sway, bobbing, recoil recovery, and reload animation
     */
    update(dt, isMoving, isSprinting, mouseDeltaX = 0, mouseDeltaY = 0) {
        // 1. ADS Interpolation
        const adsTarget = this.isADS ? 1.0 : 0.0;
        const adsSpeed = (this.weaponMode === 'SNIPER') ? 16 : 14;
        this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, adsTarget, dt * adsSpeed);

        // Dynamic FOV Zoom during ADS
        // Sniper zooms deep (18 deg = 4.1x magnification), Grenade zooms to 60 deg
        const targetFOV = this.isADS
            ? (this.weaponMode === 'SNIPER' ? 18 : 60)
            : 75;
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, dt * 14);
        this.camera.updateProjectionMatrix();

        // When scoped in with Sniper, hide 3D weapon model so view is 100% clean optic
        if (this.weaponMode === 'SNIPER') {
            if (this.sniperMesh) {
                this.sniperMesh.visible = (this.adsProgress < 0.75);
            }
        }

        // 2. Recoil Spring-Damper Physics
        const springK = 240;
        const damping = 24;

        // Recoil Z (backwards kick)
        const forceZ = -springK * this.recoilZ - damping * this.recoilVelZ;
        this.recoilVelZ += forceZ * dt;
        this.recoilZ += this.recoilVelZ * dt;

        // Recoil Pitch (muzzle climb)
        const forceRot = -springK * this.recoilRotX - damping * this.recoilVelRotX;
        this.recoilVelRotX += forceRot * dt;
        this.recoilRotX += this.recoilVelRotX * dt;

        // 3. Movement Bobbing & Breathing Sway
        let bobSpeed = 3.5;
        let bobAmtX = 0.008;
        let bobAmtY = 0.006;

        if (isMoving) {
            bobSpeed = isSprinting ? 12.0 : 8.5;
            bobAmtX = (isSprinting ? 0.035 : 0.02) * (1.0 - this.adsProgress * 0.75);
            bobAmtY = (isSprinting ? 0.045 : 0.025) * (1.0 - this.adsProgress * 0.75);
        }

        this.bobTime += dt * bobSpeed;
        const bobX = Math.cos(this.bobTime * 0.5) * bobAmtX;
        const bobY = Math.abs(Math.sin(this.bobTime)) * bobAmtY;

        // Mouse look inertia sway
        this.swayX = THREE.MathUtils.lerp(this.swayX, -mouseDeltaX * 0.0004, dt * 10);
        this.swayY = THREE.MathUtils.lerp(this.swayY, -mouseDeltaY * 0.0004, dt * 10);

        // 4. Weapon Specific Animations
        let reloadOffset = new THREE.Vector3(0, 0, 0);
        let reloadRot = new THREE.Vector3(0, 0, 0);

        if (this.weaponMode === 'SNIPER') {
            // Bolt Cycling Animation
            if (this.boltTimer > 0) {
                this.boltTimer -= dt;
                const boltProg = 1.0 - (this.boltTimer / this.boltCycleTime); // 0 -> 1

                if (this.sniperBolt) {
                    if (boltProg < 0.25) {
                        // Lift bolt handle
                        this.sniperBolt.rotation.z = (boltProg / 0.25) * 0.75;
                        this.sniperBolt.position.z = 0.10;
                    } else if (boltProg < 0.55) {
                        // Pull bolt back
                        const t = (boltProg - 0.25) / 0.3;
                        this.sniperBolt.rotation.z = 0.75;
                        this.sniperBolt.position.z = 0.10 + t * 0.12;
                    } else if (boltProg < 0.82) {
                        // Push bolt forward
                        const t = (boltProg - 0.55) / 0.27;
                        this.sniperBolt.rotation.z = 0.75;
                        this.sniperBolt.position.z = 0.22 - t * 0.12;
                    } else {
                        // Lock bolt handle down
                        const t = (boltProg - 0.82) / 0.18;
                        this.sniperBolt.rotation.z = 0.75 * (1.0 - t);
                        this.sniperBolt.position.z = 0.10;
                    }
                }
            } else if (this.sniperBolt) {
                this.sniperBolt.rotation.z = 0;
                this.sniperBolt.position.z = 0.10;
            }

            // Sniper Tactical Reload
            if (this.isReloading) {
                this.reloadTimer += dt;
                const prog = this.reloadTimer / this.reloadTime;

                if (prog < 0.4) {
                    // Lower rifle, drop magazine
                    const t = prog / 0.4;
                    reloadOffset.set(0.04 * t, -0.18 * t, 0.04 * t);
                    reloadRot.set(-0.35 * t, 0.3 * t, -0.2 * t);
                    if (this.sniperMag) this.sniperMag.position.y = -0.10 - t * 0.3;
                } else if (prog < 0.8) {
                    // Slap fresh magazine in
                    const t = (prog - 0.4) / 0.4;
                    reloadOffset.set(0.04, -0.18, 0.04);
                    reloadRot.set(-0.35, 0.3, -0.2);
                    if (this.sniperMag) this.sniperMag.position.y = -0.40 + t * 0.3;
                } else if (prog < 1.0) {
                    // Rack bolt and return to ready
                    const t = (prog - 0.8) / 0.2;
                    reloadOffset.set(0.04 * (1.0 - t), -0.18 * (1.0 - t), 0.04 * (1.0 - t));
                    reloadRot.set(-0.35 * (1.0 - t), 0.3 * (1.0 - t), -0.2 * (1.0 - t));
                    if (this.sniperMag) this.sniperMag.position.y = -0.10;
                } else {
                    this.isReloading = false;
                    this.currentAmmo = this.maxAmmo;
                    if (this.sniperMag) this.sniperMag.position.y = -0.10;
                }
            }
        } else if (this.weaponMode === 'ASSAULT_RIFLE') {
            // Assault Rifle Tactical Reload (35 Rounds)
            if (this.isReloading) {
                this.reloadTimer += dt;
                const prog = this.reloadTimer / this.reloadTime;

                if (prog < 0.38) {
                    const t = prog / 0.38;
                    reloadOffset.set(0.02 * t, -0.14 * t, 0.03 * t);
                    reloadRot.set(-0.25 * t, 0.2 * t, -0.15 * t);
                    if (this.arMag) this.arMag.position.y = -0.16 - t * 0.25;
                } else if (prog < 0.76) {
                    const t = (prog - 0.38) / 0.38;
                    reloadOffset.set(0.02, -0.14, 0.03);
                    reloadRot.set(-0.25, 0.2, -0.15);
                    if (this.arMag) this.arMag.position.y = -0.41 + t * 0.25;
                } else if (prog < 1.0) {
                    const t = (prog - 0.76) / 0.24;
                    reloadOffset.set(0.02 * (1.0 - t), -0.14 * (1.0 - t), 0.03 * (1.0 - t));
                    reloadRot.set(-0.25 * (1.0 - t), 0.2 * (1.0 - t), -0.15 * (1.0 - t));
                    if (this.arMag) this.arMag.position.y = -0.16;
                } else {
                    this.isReloading = false;
                    this.currentAmmo = this.maxAmmo;
                    if (this.ammoPools['ASSAULT_RIFLE']) this.ammoPools['ASSAULT_RIFLE'].current = this.maxAmmo;
                    if (this.arMag) this.arMag.position.y = -0.16;
                }
            }
        } else if (this.weaponMode === 'FLAMETHROWER' || this.weaponMode === 'LASER' || this.weaponMode === 'BAZOOKA') {
            // Special weapons don't reload manually; they reload at Special Ammo Depot!
            this.isReloading = false;
        } else {
            // Grenade Launcher Animations
            this.cylinderAngle = THREE.MathUtils.lerp(this.cylinderAngle, this.targetCylinderAngle, dt * 18);
            if (this.cylinderDrum) this.cylinderDrum.rotation.z = this.cylinderAngle;

            let cylinderSwing = 0;
            if (this.isReloading) {
                this.reloadTimer += dt;
                const progress = this.reloadTimer / this.reloadTime;

                if (progress < 0.25) {
                    const t = progress / 0.25;
                    reloadOffset.set(0.04 * t, -0.15 * t, 0.05 * t);
                    reloadRot.set(-0.35 * t, 0.4 * t, -0.3 * t);
                } else if (progress < 0.75) {
                    reloadOffset.set(0.04, -0.15, 0.05);
                    reloadRot.set(-0.35, 0.4, -0.3);
                    cylinderSwing = -1.1;

                    if (progress > 0.6) {
                        for (let g of this.grenadeMeshes) {
                            g.visible = true;
                        }
                    }
                } else if (progress < 1.0) {
                    const t = (progress - 0.75) / 0.25;
                    cylinderSwing = -1.1 * (1.0 - t);
                    reloadOffset.set(0.04 * (1.0 - t), -0.15 * (1.0 - t), 0.05 * (1.0 - t));
                    reloadRot.set(-0.35 * (1.0 - t), 0.4 * (1.0 - t), -0.3 * (1.0 - t));
                } else {
                    this.isReloading = false;
                    this.currentAmmo = this.maxAmmo;
                    for (let g of this.grenadeMeshes) {
                        g.visible = true;
                    }
                }
            }

            if (this.cylinderPivot) this.cylinderPivot.rotation.y = cylinderSwing;
        }

        // 5. Final Position & Rotation Blend
        const basePos = this.hipOffset.clone().lerp(this.adsOffset, this.adsProgress);
        this.root.position.copy(basePos);
        this.root.position.x += bobX + this.swayX + reloadOffset.x;
        this.root.position.y += bobY + this.swayY + reloadOffset.y;
        this.root.position.z += this.recoilZ + reloadOffset.z;

        this.root.rotation.set(
            this.recoilRotX + this.swayY * 1.5 + reloadRot.x,
            this.swayX * 1.5 + reloadRot.y,
            bobX * 0.8 + reloadRot.z
        );
    }
}

window.WeaponRig = WeaponRig;
