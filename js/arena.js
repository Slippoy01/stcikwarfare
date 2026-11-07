/**
 * stickenade - Procedural 3D Tactical Arena Engine
 * Supports Multi-Map Switching:
 *   1. PVP Map: Daylight Shipping Container Proving Grounds (88m x 64m)
 *   2. EDF Map: Earth Defense Force Outpost "Aegis" (Spacious 104m x 80m Fortified Battlefield)
 * 100% Procedural Code-Generated Textures & Geometry (Zero External Assets)
 */

class TacticalArena {
    constructor(scene) {
        this.scene = scene;
        this.colliders = []; // Array of THREE.Box3 bounding boxes for collision
        this.jumpPads = [];  // Array of { pos, radius, force, light, baseTime }
        this.currentMapType = 'PVP';

        // Root groups for seamless clean map switching
        this.atmosphereGroup = new THREE.Group();
        this.mapGroup = new THREE.Group();
        this.scene.add(this.atmosphereGroup);
        this.scene.add(this.mapGroup);

        // Arena Dimensions (EDF Outpost "Aegis": 104m width x 80m depth)
        this.halfWidth = 52;
        this.halfDepth = 40;

        this.spawnPoints = [
            new THREE.Vector3(-26, 1.2, 22),   // Slot 1 (Hero/P1): SW quadrant
            new THREE.Vector3(26, 1.2, -22),   // Slot 2 (Enemy/Bot/P2): NE quadrant
            new THREE.Vector3(26, 1.2, 22),    // Slot 3 (P3): SE quadrant
            new THREE.Vector3(-26, 1.2, -22)   // Slot 4 (P4): NW quadrant
        ];
        this.spawnYaws = [
            Math.PI * 0.25,
            Math.PI * 1.25,
            Math.PI * 0.75,
            Math.PI * 1.75
        ];

        this.initProceduralTextures();
        this.loadMap('EDF');
    }

    // ========================================================
    // 1. PROCEDURAL REALISTIC TEXTURES (Canvas 2D Generators)
    // ========================================================
    initProceduralTextures() {
        // A. Daylight Weathered Tarmac Floor Texture
        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 256;
        floorCanvas.height = 256;
        const fCtx = floorCanvas.getContext('2d');
        fCtx.fillStyle = '#6e747e';
        fCtx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 4000; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const shade = Math.random() > 0.5 ? 255 : 0;
            const alpha = 0.03 + Math.random() * 0.05;
            fCtx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
            fCtx.fillRect(x, y, 1.5, 1.5);
        }
        fCtx.strokeStyle = 'rgba(40, 44, 52, 0.45)';
        fCtx.lineWidth = 2;
        fCtx.strokeRect(0, 0, 256, 256);
        this.floorTexture = new THREE.CanvasTexture(floorCanvas);
        this.floorTexture.wrapS = THREE.RepeatWrapping;
        this.floorTexture.wrapT = THREE.RepeatWrapping;
        this.floorTexture.repeat.set(16, 12);

        // B. Shipping Container Textures (Blue, Green, Red)
        this.containerTextures = {
            red: this.createContainerTexture('#b91c1c', 'RED-01 // TAC', '#f87171'),
            blue: this.createContainerTexture('#1d4ed8', 'BLU-02 // CSX', '#60a5fa'),
            green: this.createContainerTexture('#15803d', 'GRN-03 // MIL', '#4ade80')
        };

        // C. Daylight Sky Dome Texture
        const skyCanvas = document.createElement('canvas');
        skyCanvas.width = 512;
        skyCanvas.height = 256;
        const skyCtx = skyCanvas.getContext('2d');
        const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
        skyGrad.addColorStop(0.00, '#1d4ed8');
        skyGrad.addColorStop(0.35, '#3b82f6');
        skyGrad.addColorStop(0.70, '#93c5fd');
        skyGrad.addColorStop(0.92, '#e0f2fe');
        skyGrad.addColorStop(1.00, '#ffffff');
        skyCtx.fillStyle = skyGrad;
        skyCtx.fillRect(0, 0, 512, 256);

        const sunX = 360, sunY = 70;
        const sunGlow = skyCtx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 90);
        sunGlow.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        sunGlow.addColorStop(0.2, 'rgba(255, 252, 230, 0.85)');
        sunGlow.addColorStop(0.5, 'rgba(255, 240, 190, 0.35)');
        sunGlow.addColorStop(1.0, 'rgba(255, 220, 150, 0.0)');
        skyCtx.fillStyle = sunGlow;
        skyCtx.beginPath();
        skyCtx.arc(sunX, sunY, 90, 0, Math.PI * 2);
        skyCtx.fill();

        this.skyTexture = new THREE.CanvasTexture(skyCanvas);

        // D. EDF Military Base Runway Tarmac Texture (Dark, fortified, with caution chevrons)
        const edfFloorCanvas = document.createElement('canvas');
        edfFloorCanvas.width = 256;
        edfFloorCanvas.height = 256;
        const efCtx = edfFloorCanvas.getContext('2d');
        efCtx.fillStyle = '#262a30';
        efCtx.fillRect(0, 0, 256, 256);

        // Heavy concrete expansion tiles
        efCtx.strokeStyle = 'rgba(15, 18, 22, 0.65)';
        efCtx.lineWidth = 3;
        efCtx.strokeRect(0, 0, 256, 256);
        efCtx.strokeRect(128, 0, 0, 256);
        efCtx.strokeRect(0, 128, 256, 0);

        // Weathering noise
        for (let i = 0; i < 3500; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const c = Math.random() > 0.5 ? 255 : 0;
            efCtx.fillStyle = `rgba(${c}, ${c}, ${c}, 0.035)`;
            efCtx.fillRect(x, y, 1.5, 1.5);
        }

        // Yellow warning border stripes
        efCtx.fillStyle = 'rgba(234, 179, 8, 0.35)';
        for (let i = 0; i < 256; i += 32) {
            efCtx.beginPath();
            efCtx.moveTo(i, 0);
            efCtx.lineTo(i + 14, 0);
            efCtx.lineTo(i - 8, 16);
            efCtx.lineTo(i - 22, 16);
            efCtx.fill();
        }

        this.edfFloorTexture = new THREE.CanvasTexture(edfFloorCanvas);
        this.edfFloorTexture.wrapS = THREE.RepeatWrapping;
        this.edfFloorTexture.wrapT = THREE.RepeatWrapping;
        this.edfFloorTexture.repeat.set(20, 16);

        // E. EDF Apocalyptic Battle Twilight Sky Dome Texture
        const edfSkyCanvas = document.createElement('canvas');
        edfSkyCanvas.width = 512;
        edfSkyCanvas.height = 256;
        const esCtx = edfSkyCanvas.getContext('2d');
        const esGrad = esCtx.createLinearGradient(0, 0, 0, 256);
        esGrad.addColorStop(0.00, '#0a0d1a'); // Dark cosmic zenith
        esGrad.addColorStop(0.30, '#1c152e'); // Deep threat violet
        esGrad.addColorStop(0.65, '#5e1b29'); // Apocalyptic crimson
        esGrad.addColorStop(0.85, '#9a3412'); // Blazing amber horizon
        esGrad.addColorStop(1.00, '#271210'); // Dark smoky horizon boundary
        esCtx.fillStyle = esGrad;
        esCtx.fillRect(0, 0, 512, 256);

        // Distant Alien Mothership Energy Rift
        const riftGrad = esCtx.createRadialGradient(256, 90, 8, 256, 90, 120);
        riftGrad.addColorStop(0.0, 'rgba(239, 68, 68, 0.9)');
        riftGrad.addColorStop(0.4, 'rgba(185, 28, 28, 0.45)');
        riftGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        esCtx.fillStyle = riftGrad;
        esCtx.beginPath();
        esCtx.arc(256, 90, 120, 0, Math.PI * 2);
        esCtx.fill();

        this.edfSkyTexture = new THREE.CanvasTexture(edfSkyCanvas);

        // F. EDF Fortified Concrete Bunker Wall Texture
        const bnkCanvas = document.createElement('canvas');
        bnkCanvas.width = 256;
        bnkCanvas.height = 128;
        const bCtx = bnkCanvas.getContext('2d');
        bCtx.fillStyle = '#3f4652';
        bCtx.fillRect(0, 0, 256, 128);

        // Concrete panels & rivets
        bCtx.strokeStyle = 'rgba(20, 24, 30, 0.6)';
        bCtx.lineWidth = 2;
        bCtx.strokeRect(4, 4, 248, 120);
        bCtx.strokeRect(128, 4, 0, 120);

        bCtx.fillStyle = '#1e242d';
        for (let x = 12; x < 256; x += 32) {
            bCtx.beginPath();
            bCtx.arc(x, 12, 2.5, 0, Math.PI * 2);
            bCtx.arc(x, 116, 2.5, 0, Math.PI * 2);
            bCtx.fill();
        }

        bCtx.fillStyle = '#f59e0b';
        bCtx.font = 'bold 12px monospace';
        bCtx.fillText('EDF DEFENSE FOB // SEC-01', 18, 38);
        bCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        bCtx.font = '9px monospace';
        bCtx.fillText('ARMORED BULKHEAD // LEVEL 4', 18, 56);

        this.bunkerTexture = new THREE.CanvasTexture(bnkCanvas);
    }

    createContainerTexture(baseColor, codeText, decalColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, 256, 128);

        for (let x = 0; x < 256; x += 16) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(x, 0, 7, 128);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fillRect(x + 7, 0, 4, 128);
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, 256, 8);
        ctx.fillRect(0, 120, 256, 8);
        ctx.fillRect(0, 0, 8, 128);
        ctx.fillRect(248, 0, 8, 128);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(codeText, 18, 36);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '9px monospace';
        ctx.fillText('MAX GROSS: 30,480 KG // TARE: 3,850 KG', 18, 52);

        ctx.fillStyle = decalColor;
        ctx.fillRect(18, 68, 20, 20);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(18, 68, 20, 20);

        return new THREE.CanvasTexture(canvas);
    }

    // ========================================================
    // 2. UNIFIED MAP LOADER (PVP vs DEDICATED EDF MAP)
    // ========================================================
    loadMap(mapType = 'EDF') {
        this.currentMapType = 'EDF';

        // Clean out existing meshes and lights
        while (this.mapGroup.children.length > 0) {
            const child = this.mapGroup.children[0];
            this.mapGroup.remove(child);
        }
        while (this.atmosphereGroup.children.length > 0) {
            const child = this.atmosphereGroup.children[0];
            this.atmosphereGroup.remove(child);
        }

        this.colliders = [];
        this.jumpPads = [];

        // Unified across all modes: EDF Outpost "Aegis" (Optimized, smooth, fortified battlefield)
        this.buildEDFAtmosphere();
        this.buildEDFMap();
    }

    // ========================================================
    // 3. PVP MAP (DAYLIGHT CONTAINER ARENA)
    // ========================================================
    buildPVPAtmosphere() {
        this.halfWidth = 44;
        this.halfDepth = 32;

        this.spawnPoints = [
            new THREE.Vector3(-32, 1.2, 0),
            new THREE.Vector3(32, 1.2, 0),
            new THREE.Vector3(0, 1.2, -22),
            new THREE.Vector3(0, 1.2, 22)
        ];
        this.spawnYaws = [ -Math.PI / 2, Math.PI / 2, Math.PI, 0 ];

        const skyGeo = new THREE.SphereGeometry(360, 24, 16);
        const skyMat = new THREE.MeshBasicMaterial({
            map: this.skyTexture,
            side: THREE.BackSide,
            depthWrite: false
        });
        const skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.atmosphereGroup.add(skyDome);

        this.scene.fog = new THREE.FogExp2(0xd6e8f8, 0.0022);

        const sun = new THREE.DirectionalLight(0xfffaec, 1.85);
        sun.position.set(45, 60, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 180;
        sun.shadow.camera.left = -52;
        sun.shadow.camera.right = 52;
        sun.shadow.camera.top = 40;
        sun.shadow.camera.bottom = -40;
        sun.shadow.bias = -0.0004;
        this.atmosphereGroup.add(sun);

        const hemiLight = new THREE.HemisphereLight(0x8ac7f8, 0xc2b09a, 0.85);
        this.atmosphereGroup.add(hemiLight);
    }

    buildPVPMap() {
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.floorTexture,
            roughness: 0.82,
            metalness: 0.08
        });

        const groundGeo = new THREE.PlaneGeometry(130, 96);
        groundGeo.rotateX(-Math.PI / 2);
        const ground = new THREE.Mesh(groundGeo, floorMat);
        ground.receiveShadow = true;
        this.mapGroup.add(ground);

        this.groundBox = new THREE.Box3(
            new THREE.Vector3(-65, -1, -48),
            new THREE.Vector3(65, 0, 48)
        );
        this.colliders.push(this.groundBox);

        const barrierHeight = 4.2;
        const barrierThick = 0.08;

        const blueBarrierMat = new THREE.MeshBasicMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.32,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const blueRailMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

        this.createThinBlueWall(0, barrierHeight / 2, -this.halfDepth, this.halfWidth * 2, barrierHeight, barrierThick, blueBarrierMat, blueRailMat);
        this.createThinBlueWall(0, barrierHeight / 2, this.halfDepth, this.halfWidth * 2, barrierHeight, barrierThick, blueBarrierMat, blueRailMat);
        this.createThinBlueWall(-this.halfWidth, barrierHeight / 2, 0, barrierThick, barrierHeight, this.halfDepth * 2, blueBarrierMat, blueRailMat);
        this.createThinBlueWall(this.halfWidth, barrierHeight / 2, 0, barrierThick, barrierHeight, this.halfDepth * 2, blueBarrierMat, blueRailMat);

        this.addInvisibleWall(0, 10, -this.halfDepth, this.halfWidth * 2 + 4, 20, 2);
        this.addInvisibleWall(0, 10, this.halfDepth, this.halfWidth * 2 + 4, 20, 2);
        this.addInvisibleWall(-this.halfWidth, 10, 0, 2, 20, this.halfDepth * 2 + 4);
        this.addInvisibleWall(this.halfWidth, 10, 0, 2, 20, this.halfDepth * 2 + 4);
        this.addInvisibleWall(0, 32, 0, this.halfWidth * 2 + 8, 2, this.halfDepth * 2 + 8);

        this.createCentralPlatform(0, 0, 0, 16, 16, 5.2);

        const padRadius = 2.0;
        const padLaunchForce = 18.2;
        const padInwardPush = 5.5;

        this.createJumpPad(0, 0.05, -12.0, padRadius, padLaunchForce, 0, padInwardPush);
        this.createJumpPad(0, 0.05, 12.0, padRadius, padLaunchForce, 0, -padInwardPush);
        this.createJumpPad(-12.0, 0.05, 0, padRadius, padLaunchForce, padInwardPush, 0);
        this.createJumpPad(12.0, 0.05, 0, padRadius, padLaunchForce, -padInwardPush, 0);

        const cLen = 5.6;
        const cHgt = 2.4;
        const cWid = 2.3;

        this.createShippingContainer(-22, 1.2, -14, cLen, cHgt, cWid, 0, this.containerTextures.blue);
        this.createShippingContainer(-22, 1.2, 14, cLen, cHgt, cWid, 0, this.containerTextures.green);
        this.createShippingContainer(22, 1.2, -14, cLen, cHgt, cWid, 0, this.containerTextures.red);
        this.createShippingContainer(22, 1.2, 14, cLen, cHgt, cWid, 0, this.containerTextures.blue);

        this.createShippingContainer(-13, 1.2, -22, cLen, cHgt, cWid, Math.PI / 2, this.containerTextures.green);
        this.createShippingContainer(13, 1.2, -22, cLen, cHgt, cWid, Math.PI / 2, this.containerTextures.red);
        this.createShippingContainer(-13, 1.2, 22, cLen, cHgt, cWid, Math.PI / 2, this.containerTextures.green);
        this.createShippingContainer(13, 1.2, 22, cLen, cHgt, cWid, Math.PI / 2, this.containerTextures.red);
    }

    // ========================================================
    // 4. DEDICATED EDF MAP (EARTH DEFENSE FORCE FORWARD BASE)
    // ========================================================
    buildEDFAtmosphere() {
        // Spacious EDF Battlefield: 104m width x 80m depth
        this.halfWidth = 52;
        this.halfDepth = 40;

        // Balanced tactical 4-quadrant spawns across outpost (facing center)
        this.spawnPoints = [
            new THREE.Vector3(-26, 1.2, 22),   // Slot 1 (Hero/P1): SW quadrant
            new THREE.Vector3(26, 1.2, -22),   // Slot 2 (Enemy/Bot/P2): NE quadrant
            new THREE.Vector3(26, 1.2, 22),    // Slot 3 (P3): SE quadrant
            new THREE.Vector3(-26, 1.2, -22)   // Slot 4 (P4): NW quadrant
        ];
        this.spawnYaws = [
            Math.PI * 0.25,
            Math.PI * 1.25,
            Math.PI * 0.75,
            Math.PI * 1.75
        ];

        // Apocalyptic Sky Dome
        const skyGeo = new THREE.SphereGeometry(380, 24, 16);
        const skyMat = new THREE.MeshBasicMaterial({
            map: this.edfSkyTexture,
            side: THREE.BackSide,
            depthWrite: false
        });
        const skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.atmosphereGroup.add(skyDome);

        // Ominous twilight defense fog
        this.scene.fog = new THREE.FogExp2(0x1a121d, 0.0028);

        // Defense Searchlight / Moonlight
        const moon = new THREE.DirectionalLight(0xffab73, 1.45);
        moon.position.set(-35, 75, 45);
        moon.castShadow = true;
        moon.shadow.mapSize.width = 1024;
        moon.shadow.mapSize.height = 1024;
        moon.shadow.camera.near = 10;
        moon.shadow.camera.far = 200;
        moon.shadow.camera.left = -62;
        moon.shadow.camera.right = 62;
        moon.shadow.camera.top = 50;
        moon.shadow.camera.bottom = -50;
        moon.shadow.bias = -0.0004;
        this.atmosphereGroup.add(moon);

        // Ambient Skylight
        const hemiLight = new THREE.HemisphereLight(0x424f6b, 0x472218, 0.85);
        this.atmosphereGroup.add(hemiLight);
    }

    buildEDFMap() {
        // 1. Heavy Military Tarmac Runway (150m x 120m)
        const floorMat = new THREE.MeshStandardMaterial({
            map: this.edfFloorTexture,
            roughness: 0.88,
            metalness: 0.12
        });

        const groundGeo = new THREE.PlaneGeometry(150, 120);
        groundGeo.rotateX(-Math.PI / 2);
        const ground = new THREE.Mesh(groundGeo, floorMat);
        ground.receiveShadow = true;
        this.mapGroup.add(ground);

        this.groundBox = new THREE.Box3(
            new THREE.Vector3(-75, -1, -60),
            new THREE.Vector3(75, 0, 60)
        );
        this.colliders.push(this.groundBox);

        // 2. Perimeter Anti-Alien Plasma Energy Barrier
        const barrierHeight = 5.0;
        const barrierThick = 0.10;
        const edfBarrierMat = new THREE.MeshBasicMaterial({
            color: 0xff3b30,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const edfRailMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        this.createThinBlueWall(0, barrierHeight / 2, -this.halfDepth, this.halfWidth * 2, barrierHeight, barrierThick, edfBarrierMat, edfRailMat);
        this.createThinBlueWall(0, barrierHeight / 2, this.halfDepth, this.halfWidth * 2, barrierHeight, barrierThick, edfBarrierMat, edfRailMat);
        this.createThinBlueWall(-this.halfWidth, barrierHeight / 2, 0, barrierThick, barrierHeight, this.halfDepth * 2, edfBarrierMat, edfRailMat);
        this.createThinBlueWall(this.halfWidth, barrierHeight / 2, 0, barrierThick, barrierHeight, this.halfDepth * 2, edfBarrierMat, edfRailMat);

        // Boundary colliders
        this.addInvisibleWall(0, 10, -this.halfDepth, this.halfWidth * 2 + 4, 20, 2);
        this.addInvisibleWall(0, 10, this.halfDepth, this.halfWidth * 2 + 4, 20, 2);
        this.addInvisibleWall(-this.halfWidth, 10, 0, 2, 20, this.halfDepth * 2 + 4);
        this.addInvisibleWall(this.halfWidth, 10, 0, 2, 20, this.halfDepth * 2 + 4);
        this.addInvisibleWall(0, 32, 0, this.halfWidth * 2 + 8, 2, this.halfDepth * 2 + 8);

        // 3. Four Concrete Defense Pillbox Bunkers (NW, NE, SW, SE)
        this.createEDFBunker(-26, 0, -18, 'NW');
        this.createEDFBunker(26, 0, -18, 'NE');
        this.createEDFBunker(-26, 0, 18, 'SW');
        this.createEDFBunker(26, 0, 18, 'SE');

        // 4. Two High-Ground Sniper Watchtowers with Walk-Up Access Ramps (West & East)
        this.createEDFWatchtower(-34, 0, 0, 'WEST');
        this.createEDFWatchtower(34, 0, 0, 'EAST');

        // 5. Sandbag Defense Revetments (Low cover to crouch and fire over)
        this.createSandbagLine(-14, 0, -8, 8, 0);
        this.createSandbagLine(14, 0, -8, 8, 0);
        this.createSandbagLine(-14, 0, 8, 8, 0);
        this.createSandbagLine(14, 0, 8, 8, 0);

        // 6. Central High Platform (Fortified 16m x 16m Elevated Platform at Y = 5.2m)
        this.createCentralPlatform(0, 0, 0, 16, 16, 5.2);

        // 7. Exactly 4 Jump Pads (ONLY for the Central High Platform, No Extra Objects)
        const padRadius = 2.0;
        const padLaunchForce = 18.5;
        const padInwardPush = 5.5;

        this.createJumpPad(0, 0.05, -12.0, padRadius, padLaunchForce, 0, padInwardPush, 'CYAN', true);  // North -> launches South onto Central High Platform
        this.createJumpPad(0, 0.05, 12.0, padRadius, padLaunchForce, 0, -padInwardPush, 'CYAN', true); // South -> launches North onto Central High Platform
        this.createJumpPad(-12.0, 0.05, 0, padRadius, padLaunchForce, padInwardPush, 0, 'CYAN', true);  // West -> launches East onto Central High Platform
        this.createJumpPad(12.0, 0.05, 0, padRadius, padLaunchForce, -padInwardPush, 0, 'CYAN', true);  // East -> launches West onto Central High Platform
    }

    // ========================================================
    // 5. EDF MAP PROCEDURAL BUILDERS
    // ========================================================
    createEDFBunker(x, y, z, label) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            map: this.bunkerTexture,
            roughness: 0.75,
            metalness: 0.25
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x22272e,
            roughness: 0.85
        });

        // Main bunker pillbox: 8m width, 3.2m height, 6m depth
        const w = 8.0, h = 3.2, d = 6.0;

        // Solid armored bunker block (Optimized single low-poly mesh)
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        body.position.set(0, h / 2, 0);
        group.add(body);

        // Heavy Reinforced Concrete Roof Slab (Walkable Platform at Y = 3.7m)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(0, h + 0.25, 0);
        group.add(roof);

        // Warning light beacon on roof corner
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.6, 8), beaconMat);
        beacon.position.set((w / 2) - 0.7, h + 0.8, (d / 2) - 0.7);
        group.add(beacon);

        group.position.set(x, y, z);
        this.mapGroup.add(group);

        // Register solid bounding box collider for entire bunker
        const box = new THREE.Box3(
            new THREE.Vector3(x - w / 2 - 0.2, y, z - d / 2 - 0.2),
            new THREE.Vector3(x + w / 2 + 0.2, y + h + 0.5, z + d / 2 + 0.2)
        );
        this.colliders.push(box);
    }

    createEDFWatchtower(x, y, z, flank) {
        const group = new THREE.Group();
        const towerMat = new THREE.MeshStandardMaterial({
            color: 0x2d3748,
            roughness: 0.6,
            metalness: 0.4
        });
        const platformMat = new THREE.MeshStandardMaterial({
            color: 0x1f2937,
            roughness: 0.5,
            metalness: 0.6
        });
        const railMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

        const towerH = 4.2;
        const platW = 9.0;
        const platD = 8.0;

        // 4 Steel Support Pillars
        const pillarGeo = new THREE.BoxGeometry(0.5, towerH, 0.5);
        for (let dx of [-platW / 2 + 0.5, platW / 2 - 0.5]) {
            for (let dz of [-platD / 2 + 0.5, platD / 2 - 0.5]) {
                const pillar = new THREE.Mesh(pillarGeo, towerMat);
                pillar.position.set(dx, towerH / 2, dz);
                group.add(pillar);
            }
        }

        // Elevated Platform Deck at Y = 4.2m
        const deck = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.35, platD), platformMat);
        deck.position.set(0, towerH, 0);
        group.add(deck);

        // Waist-high Guard Rails around deck
        const railH = 1.1;
        const nRail = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.08, 0.08), railMat);
        nRail.position.set(0, towerH + railH, -platD / 2);
        group.add(nRail);

        const sRail = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.08, 0.08), railMat);
        sRail.position.set(0, towerH + railH, platD / 2);
        group.add(sRail);

        // Walk-up Access Ramp connecting Ground to Elevated Deck
        const rampLen = 11.0;
        const rampWid = 2.8;
        const rampAngle = Math.atan2(towerH, rampLen);
        const rampGeo = new THREE.BoxGeometry(rampWid, 0.25, Math.hypot(towerH, rampLen));
        const rampMesh = new THREE.Mesh(rampGeo, platformMat);

        const inwardDir = (flank === 'WEST') ? 1 : -1;
        rampMesh.position.set(inwardDir * (platW / 2 + rampLen / 2), towerH / 2, 0);
        rampMesh.rotation.y = (flank === 'WEST') ? Math.PI / 2 : -Math.PI / 2;
        rampMesh.rotation.x = (flank === 'WEST') ? rampAngle : -rampAngle;
        group.add(rampMesh);

        group.position.set(x, y, z);
        this.mapGroup.add(group);

        // 1. Deck collider
        const deckBox = new THREE.Box3(
            new THREE.Vector3(x - platW / 2, y + towerH - 0.2, z - platD / 2),
            new THREE.Vector3(x + platW / 2, y + towerH + 0.2, z + platD / 2)
        );
        this.colliders.push(deckBox);

        // 2. Smooth Stepping Colliders for the walk-up ramp (4 steps - performance optimized)
        const numSteps = 4;
        const stepSpan = rampLen / numSteps;
        for (let s = 0; s < numSteps; s++) {
            const frac = (s + 0.5) / numSteps;
            const stepY = frac * towerH;
            const stepX = x + inwardDir * (platW / 2 + (1 - frac) * rampLen);
            const stepBox = new THREE.Box3(
                new THREE.Vector3(stepX - stepSpan / 2, y, z - rampWid / 2),
                new THREE.Vector3(stepX + stepSpan / 2, y + stepY + 0.2, z + rampWid / 2)
            );
            this.colliders.push(stepBox);
        }
    }

    createSandbagLine(x, y, z, length, rotY = 0) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8a785d,
            roughness: 0.95
        });

        // Waist-high tactical barricade (Height 1.15m, thickness 0.7m)
        const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.15, 0.7), mat);
        wall.position.y = 1.15 / 2;
        group.add(wall);

        // Top chevron pattern
        const cap = new THREE.Mesh(new THREE.BoxGeometry(length + 0.1, 0.12, 0.8), mat);
        cap.position.y = 1.15 + 0.06;
        group.add(cap);

        group.position.set(x, y, z);
        group.rotation.y = rotY;
        this.mapGroup.add(group);

        const box = new THREE.Box3().setFromObject(group);
        this.colliders.push(box);
    }

    // ========================================================
    // 6. GEOMETRY HELPERS & INVISIBLE BOUNDARIES
    // ========================================================
    createThinBlueWall(x, y, z, w, h, d, panelMat, railMat) {
        const panelGeo = new THREE.BoxGeometry(w, h, d);
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(x, y, z);
        this.mapGroup.add(panel);

        const railThick = 0.12;
        const topRailGeo = new THREE.BoxGeometry(
            w > d ? w + 0.1 : railThick,
            railThick,
            d > w ? d + 0.1 : railThick
        );
        const topRail = new THREE.Mesh(topRailGeo, railMat);
        topRail.position.set(x, y + h / 2, z);
        this.mapGroup.add(topRail);

        const btmRailGeo = new THREE.BoxGeometry(
            w > d ? w + 0.1 : railThick,
            0.06,
            d > w ? d + 0.1 : railThick
        );
        const btmRail = new THREE.Mesh(btmRailGeo, railMat);
        btmRail.position.set(x, 0.03, z);
        this.mapGroup.add(btmRail);
    }

    addInvisibleWall(x, y, z, w, h, d) {
        const min = new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2);
        const max = new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2);
        const box = new THREE.Box3(min, max);
        this.colliders.push(box);
    }

    createShippingContainer(x, y, z, length, height, width, rotationY, texture) {
        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.65,
            metalness: 0.35
        });

        const bodyGeo = new THREE.BoxGeometry(length, height, width);
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.set(x, y, z);
        bodyMesh.rotation.y = rotationY;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mapGroup.add(bodyMesh);

        const box = new THREE.Box3().setFromObject(bodyMesh);
        this.colliders.push(box);

        return bodyMesh;
    }

    createCentralPlatform(x, y, z, width = 16, depth = 16, height = 5.2) {
        const group = new THREE.Group();

        const slabThick = 0.35;
        const slabGeo = new THREE.BoxGeometry(width, slabThick, depth);
        const slabMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.55,
            metalness: 0.45
        });
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.y = height;
        group.add(slab);

        // Cyber Guard Rails around the platform deck (Height 1.1m)
        const railMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
        const nRail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.08), railMat);
        nRail.position.set(0, height + 1.1, -depth / 2);
        group.add(nRail);
        const sRail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.08), railMat);
        sRail.position.set(0, height + 1.1, depth / 2);
        group.add(sRail);
        const wRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, depth), railMat);
        wRail.position.set(-width / 2, height + 1.1, 0);
        group.add(wRail);
        const eRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, depth), railMat);
        eRail.position.set(width / 2, height + 1.1, 0);
        group.add(eRail);

        const pillarGeo = new THREE.BoxGeometry(0.7, height, 0.7);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.7,
            metalness: 0.3
        });

        const pillarOffsets = [
            [-width / 2 + 0.6, -depth / 2 + 0.6],
            [ width / 2 - 0.6, -depth / 2 + 0.6],
            [-width / 2 + 0.6,  depth / 2 - 0.6],
            [ width / 2 - 0.6,  depth / 2 - 0.6]
        ];

        for (let [ox, oz] of pillarOffsets) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(ox, height / 2, oz);
            group.add(pillar);
        }

        group.position.set(x, y, z);
        this.mapGroup.add(group);

        const topBox = new THREE.Box3(
            new THREE.Vector3(x - width / 2, y + height - slabThick / 2, z - depth / 2),
            new THREE.Vector3(x + width / 2, y + height + slabThick / 2, z + depth / 2)
        );
        this.colliders.push(topBox);

        for (let [ox, oz] of pillarOffsets) {
            const pBox = new THREE.Box3(
                new THREE.Vector3(x + ox - 0.35, y, z + oz - 0.35),
                new THREE.Vector3(x + ox + 0.35, y + height, z + oz + 0.35)
            );
            this.colliders.push(pBox);
        }
    }

    createJumpPad(x, y, z, radius = 2.0, force = 18.2, dirX = 0, dirZ = 0, theme = 'CYAN', hasLight = true) {
        const group = new THREE.Group();

        const isSuper = (theme === 'GOLD' || theme === 'ORANGE' || force > 22.0);
        const padColor = isSuper ? 0xd97706 : 0x0284c7;
        const emissiveColor = isSuper ? 0xffaa00 : 0x00d4ff;
        const ringColor = isSuper ? 0xfbbf24 : 0x38bdf8;
        const lightColor = isSuper ? 0xffaa00 : 0x00f0ff;

        const rimGeo = new THREE.CylinderGeometry(radius * 1.08, radius * 1.15, 0.12, 16);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.4,
            metalness: 0.8
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = 0.06;
        group.add(rim);

        const padGeo = new THREE.CylinderGeometry(radius, radius, 0.08, 16);
        const padMat = new THREE.MeshStandardMaterial({
            color: padColor,
            emissive: emissiveColor,
            emissiveIntensity: isSuper ? 0.75 : 0.55,
            roughness: 0.3,
            metalness: 0.4
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.y = 0.07;
        group.add(padMesh);

        const ringGeo = new THREE.RingGeometry(radius * 0.45, radius * 0.58, 16);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: ringColor,
            side: THREE.DoubleSide
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 0.075;
        group.add(ringMesh);

        // Visual indicator on pad: Directional chevron arrow pointing in launch direction OR star/diamond for super vertical high jump
        if (Math.abs(dirX) > 0.1 || Math.abs(dirZ) > 0.1) {
            const arrowLen = radius * 0.55;
            const arrowGeo = new THREE.PlaneGeometry(arrowLen * 0.42, arrowLen);
            arrowGeo.rotateX(-Math.PI / 2);
            const arrowAngle = Math.atan2(dirX, dirZ);
            const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
            const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
            arrowMesh.rotation.y = arrowAngle;
            arrowMesh.position.y = 0.078;
            group.add(arrowMesh);
        } else {
            const starGeo = new THREE.RingGeometry(0.12, radius * 0.32, 4);
            starGeo.rotateX(-Math.PI / 2);
            const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
            const starMesh = new THREE.Mesh(starGeo, starMat);
            starMesh.position.y = 0.078;
            group.add(starMesh);
        }

        let light = null;
        if (hasLight) {
            light = new THREE.PointLight(lightColor, isSuper ? 1.6 : 1.2, isSuper ? 8.5 : 6.5);
            light.position.set(0, 0.45, 0);
            group.add(light);
        }

        group.position.set(x, y, z);
        this.mapGroup.add(group);

        this.jumpPads.push({
            pos: new THREE.Vector3(x, y, z),
            radius: radius,
            force: force,
            dirX: dirX,
            dirZ: dirZ,
            theme: theme,
            light: light,
            padMat: padMat,
            padMesh: padMesh,
            baseTime: Math.random() * 10
        });
    }

    // ========================================================
    // 7. COLLISION & PHYSICS RESOLUTION
    // ========================================================
    checkJumpPad(playerPos) {
        for (let pad of this.jumpPads) {
            const dx = playerPos.x - pad.pos.x;
            const dz = playerPos.z - pad.pos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < pad.radius * pad.radius && Math.abs(playerPos.y - pad.pos.y) < 1.4) {
                return {
                    force: pad.force,
                    dirX: pad.dirX || 0,
                    dirZ: pad.dirZ || 0,
                    pos: pad.pos,
                    theme: pad.theme
                };
            }
        }
        return null;
    }

    raycastBounce(startPos, endPos) {
        const dir = endPos.clone().sub(startPos);
        const rayDist = dir.length();
        if (rayDist < 0.0001) return null;

        const ray = new THREE.Ray(startPos, dir.clone().normalize());
        let closestHit = null;
        let minT = rayDist;

        if (startPos.y > 0 && endPos.y <= 0.08) {
            const t = (startPos.y - 0.08) / (startPos.y - endPos.y);
            if (t >= 0 && t <= 1.0) {
                const hitX = startPos.x + (endPos.x - startPos.x) * t;
                const hitZ = startPos.z + (endPos.z - startPos.z) * t;
                if (Math.abs(hitX) <= this.halfWidth && Math.abs(hitZ) <= this.halfDepth) {
                    closestHit = {
                        point: new THREE.Vector3(hitX, 0.08, hitZ),
                        normal: new THREE.Vector3(0, 1, 0),
                        dist: t * rayDist
                    };
                    minT = closestHit.dist;
                }
            }
        }

        for (let box of this.colliders) {
            if (box === this.groundBox) continue;
            const targetPt = new THREE.Vector3();
            if (ray.intersectBox(box, targetPt)) {
                const dist = startPos.distanceTo(targetPt);
                if (dist < minT) {
                    minT = dist;
                    const norm = new THREE.Vector3(0, 1, 0);
                    const center = new THREE.Vector3();
                    box.getCenter(center);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const local = targetPt.clone().sub(center);
                    const dx = Math.abs(local.x) / (size.x / 2);
                    const dy = Math.abs(local.y) / (size.y / 2);
                    const dz = Math.abs(local.z) / (size.z / 2);

                    if (dx > dy && dx > dz) norm.set(Math.sign(local.x), 0, 0);
                    else if (dy > dx && dy > dz) norm.set(0, Math.sign(local.y), 0);
                    else norm.set(0, 0, Math.sign(local.z));

                    closestHit = {
                        point: targetPt.clone(),
                        normal: norm,
                        dist: dist
                    };
                }
            }
        }

        return closestHit;
    }

    resolvePlayerCollision(pos, radius = 0.45, height = 1.8) {
        let isGrounded = false;

        if (pos.y <= 0) {
            pos.y = 0;
            isGrounded = true;
        }

        pos.x = Math.max(-this.halfWidth + 0.8, Math.min(this.halfWidth - 0.8, pos.x));
        pos.z = Math.max(-this.halfDepth + 0.8, Math.min(this.halfDepth - 0.8, pos.z));

        const playerMin = new THREE.Vector3(pos.x - radius, pos.y, pos.z - radius);
        const playerMax = new THREE.Vector3(pos.x + radius, pos.y + height, pos.z + radius);
        const playerBox = new THREE.Box3(playerMin, playerMax);

        for (let box of this.colliders) {
            if (box === this.groundBox) continue;

            if (playerBox.intersectsBox(box)) {
                const overlapX1 = playerMax.x - box.min.x;
                const overlapX2 = box.max.x - playerMin.x;
                const overlapY1 = playerMax.y - box.min.y;
                const overlapY2 = box.max.y - playerMin.y;
                const overlapZ1 = playerMax.z - box.min.z;
                const overlapZ2 = box.max.z - playerMin.z;

                const minX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
                const minY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;
                const minZ = overlapZ1 < overlapZ2 ? -overlapZ1 : overlapZ2;

                const absX = Math.abs(minX);
                const absY = Math.abs(minY);
                const absZ = Math.abs(minZ);

                if (absY < absX && absY < absZ) {
                    if (minY > 0) {
                        pos.y += minY;
                        isGrounded = true;
                    } else {
                        pos.y += minY;
                    }
                } else if (absX < absZ) {
                    pos.x += minX;
                } else {
                    pos.z += minZ;
                }

                playerMin.set(pos.x - radius, pos.y, pos.z - radius);
                playerMax.set(pos.x + radius, pos.y + height, pos.z + radius);
                playerBox.set(playerMin, playerMax);
            }
        }

        return isGrounded;
    }

    // ========================================================
    // 8. UPDATE LOOP (PULSE JUMP PADS)
    // ========================================================
    update(dt) {
        const time = performance.now() * 0.003;

        for (let pad of this.jumpPads) {
            const pulse = 0.5 + Math.sin(time + pad.baseTime) * 0.35;
            if (pad.light) pad.light.intensity = 0.9 + pulse * 1.1;
            if (pad.padMat) pad.padMat.emissiveIntensity = 0.45 + pulse * 0.45;
            if (pad.padMesh) {
                pad.padMesh.scale.set(1 + pulse * 0.02, 1, 1 + pulse * 0.02);
            }
        }
    }
}

window.TacticalArena = TacticalArena;
