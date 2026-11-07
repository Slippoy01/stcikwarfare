/**
 * stickenade - WebRTC P2P Multi-Player Network Engine (Star Topology)
 * Supports 2, 3, or 4 Players Free-For-All with Zero Server Cost (Rp 0 Beban Server)
 * Powered by PeerJS (Free Cloud Signaling + Direct WebRTC DataChannels)
 *
 * Architecture:
 *   - Host acts as the central authoritative hub/relay.
 *   - Up to 3 Guests connect directly to Host.
 *   - Host assigns player slots (Slot 1 = Host, Slot 2..4 = Guests).
 *   - Host relays remote packets between guests seamlessly.
 */

class NetworkEngine {
    constructor() {
        this.peer = null;
        this.conn = null;          // Active connection to Host (for Guests)
        this.peers = new Map();     // Map<peerId, { conn, slot, name }> (for Host)
        this.isHost = false;
        this.roomCode = null;
        this.isConnected = false;
        this.mySlot = 1;           // 1 for Host, 2..4 for Guests
        this.maxPlayers = 2;       // 2, 3, or 4 players
        this.cachedPlayerList = []; // Cached player list from host (for Guests)
        this.localPlayerName = 'HERO';
        try {
            this.localPlayerName = localStorage.getItem('stick_player_name') || 'HERO';
        } catch (_) {}
        this.ping = 0;
        this.pingTimer = null;

        this.peerPrefix = 'stk-nade-';

        // Signaling Server & STUN/TURN ICE Configuration
        // Connected to Render.com Singapore private PeerServer (stickenade-peerserver.onrender.com)
        this.serverConfig = {
            host: 'stickenade-peerserver.onrender.com', // Render.com Private PeerServer
            port: 443,
            path: '/stickenade',
            secure: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:stun.cloudflare.com:3478' }
                ],
                iceCandidatePoolSize: 10
            }
        };

        try {
            const savedHost = localStorage.getItem('stickboom_peer_host');
            if (savedHost) {
                this.serverConfig.host = savedHost;
                const savedPath = localStorage.getItem('stickboom_peer_path');
                if (savedPath) this.serverConfig.path = savedPath;
            }
        } catch (_) {}

        // Callbacks
        this.onStatusChange = null;
        this.onPlayerListUpdate = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onRemoteData = null;
        this.onPingUpdate = null;
        this.onError = null;
        this.onMatchStart = null;
    }

    generateCode() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = 'GN';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    cleanCode(raw) {
        if (!raw) return '';
        const urlMatch = raw.match(/[?&]room=([A-Za-z0-9_-]+)/);
        if (urlMatch) {
            return urlMatch[1].toUpperCase().trim();
        }
        return raw.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().trim();
    }

    getPlayerList() {
        // If guest has cached authoritative list from host, map and return it
        if (!this.isHost && this.cachedPlayerList && this.cachedPlayerList.length > 0) {
            return this.cachedPlayerList.map(p => ({
                ...p,
                isMe: (p.slot === this.mySlot)
            }));
        }

        const hostName = (this.localPlayerName && this.localPlayerName.trim().slice(0, 14)) || 'HOST';
        const list = [
            { slot: 1, name: `${hostName} (HOST)`, isHost: true, isMe: this.isHost, connected: true }
        ];

        for (let s = 2; s <= this.maxPlayers; s++) {
            let found = null;
            if (this.isHost) {
                for (let [_, info] of this.peers) {
                    if (info.slot === s) {
                        found = info;
                        break;
                    }
                }
            }
            if (found) {
                list.push({ slot: s, name: found.name, isHost: false, isMe: false, connected: true });
            } else {
                list.push({ slot: s, name: `P${s}`, isHost: false, isMe: (!this.isHost && this.mySlot === s), connected: false });
            }
        }
        return list;
    }

    setPlayerName(newName) {
        if (!newName) return;
        const clean = newName.trim().slice(0, 14) || 'HERO';
        this.localPlayerName = clean;
        try {
            localStorage.setItem('stick_player_name', clean);
        } catch (_) {}

        if (this.isHost) {
            const list = this.getPlayerList();
            this.broadcastToGuests({
                type: 'ROOM_UPDATE',
                maxPlayers: this.maxPlayers,
                players: list
            });
            if (this.onPlayerListUpdate) {
                this.onPlayerListUpdate(list);
            }
        } else if (this.isConnected && this.conn) {
            this.send({
                type: 'SET_NAME',
                name: clean
            });
        }
    }

    setMaxPlayers(newMax) {
        const val = Math.max(2, Math.min(4, parseInt(newMax) || 2));
        this.maxPlayers = val;
        console.log(`[Network] Max players updated to: ${this.maxPlayers}`);

        if (this.isHost) {
            // Disconnect peers exceeding new max
            for (let [peerId, info] of this.peers) {
                if (info.slot > this.maxPlayers) {
                    try {
                        info.conn.send({ type: 'ROOM_FULL', max: this.maxPlayers });
                        setTimeout(() => info.conn.close(), 200);
                    } catch (_) {}
                    this.peers.delete(peerId);
                }
            }

            const roomUpdate = {
                type: 'ROOM_UPDATE',
                maxPlayers: this.maxPlayers,
                players: this.getPlayerList()
            };
            this.broadcastToGuests(roomUpdate);

            if (this.onPlayerListUpdate) {
                this.onPlayerListUpdate(this.getPlayerList());
            }

            this.updateStatus(`Menunggu Pemain Bergabung (${this.peers.size + 1}/${this.maxPlayers})...`);
        }
    }

    setServer(host, port = 443, path = '/', secure = true) {
        this.serverConfig.host = host ? host.trim() : null;
        this.serverConfig.port = port || 443;
        this.serverConfig.path = path || '/';
        this.serverConfig.secure = secure;
        try {
            if (this.serverConfig.host) {
                localStorage.setItem('stickboom_peer_host', this.serverConfig.host);
                localStorage.setItem('stickboom_peer_path', this.serverConfig.path);
            } else {
                localStorage.removeItem('stickboom_peer_host');
                localStorage.removeItem('stickboom_peer_path');
            }
        } catch (_) {}
        console.log('[Network] Server updated:', this.serverConfig.host || 'Default (0.peerjs.com)');
    }

    addIceServer(iceServer) {
        if (iceServer && iceServer.urls) {
            this.serverConfig.config.iceServers.push(iceServer);
        }
    }

    initPeer(customId = null, onReady = null) {
        if (typeof Peer === 'undefined') {
            console.error('PeerJS not loaded');
            if (this.onError) this.onError('PeerJS library gagal dimuat dari CDN. Periksa koneksi internet.');
            return;
        }

        if (this.peer && !this.peer.destroyed) {
            this.peer.destroy();
            this.peer = null;
        }

        try {
            const peerOptions = {
                debug: 1,
                config: this.serverConfig.config
            };

            // Custom PeerServer support (e.g. Glitch, Koyeb, Hugging Face, VPS)
            if (this.serverConfig.host) {
                peerOptions.host = this.serverConfig.host;
                peerOptions.port = this.serverConfig.port || 443;
                peerOptions.path = this.serverConfig.path || '/';
                peerOptions.secure = this.serverConfig.secure !== false;
                console.log(`[Network] Connecting to custom PeerServer: ${peerOptions.secure ? 'wss://' : 'ws://'}${peerOptions.host}:${peerOptions.port}${peerOptions.path}`);
            } else {
                console.log('[Network] Connecting to default PeerJS Cloud (0.peerjs.com) with multi-STUN');
            }

            this.peer = customId ? new Peer(customId, peerOptions) : new Peer(peerOptions);

            this.peer.on('open', (id) => {
                console.log('[Network] Peer open with ID:', id);
                if (onReady) onReady(id);
            });

            this.peer.on('error', (err) => {
                console.warn('[Network] Peer error:', err.type, err);
                let msg = 'Terjadi kesalahan koneksi P2P.';
                if (err.type === 'unavailable-id') {
                    msg = 'Kode Room ini sedang aktif digunakan. Silakan buat kode lain.';
                } else if (err.type === 'peer-unavailable') {
                    msg = 'Room tidak ditemukan! Pastikan Host sudah membuat room dan kodenya benar.';
                } else if (err.type === 'network') {
                    msg = 'Gagal terhubung ke Peer server. Periksa koneksi internet.';
                }
                if (this.onError) this.onError(msg, err);
            });

            this.peer.on('disconnected', () => {
                console.log('[Network] Peer disconnected, attempting reconnect...');
                if (this.peer && !this.peer.destroyed) {
                    try { this.peer.reconnect(); } catch (_) {}
                }
            });
        } catch (e) {
            console.error('[Network] Init peer exception:', e);
            if (this.onError) this.onError('Gagal menginisialisasi modul WebRTC.');
        }
    }

    createRoom(customCode = null, maxPlayers = 2) {
        // If already connected as host with this room code, update maxPlayers instead of destroying peer
        if (this.isConnected && this.isHost && this.peer && !this.peer.destroyed && (!customCode || this.cleanCode(customCode) === this.roomCode)) {
            this.setMaxPlayers(maxPlayers);
            return;
        }

        this.isHost = true;
        this.mySlot = 1;
        this.maxPlayers = Math.max(2, Math.min(4, parseInt(maxPlayers) || 2));
        this.peers.clear();
        this.cachedPlayerList = [];
        this.roomCode = customCode ? this.cleanCode(customCode) : this.generateCode();
        const peerId = this.peerPrefix + this.roomCode.toLowerCase();

        this.updateStatus('Mempersiapkan Room...');

        this.initPeer(peerId, () => {
            this.isConnected = true;
            this.updateStatus(`Menunggu Pemain Bergabung (1/${this.maxPlayers})...`);

            if (this.onStatusChange) {
                this.onStatusChange({
                    status: 'WAITING',
                    code: this.roomCode,
                    isHost: true,
                    maxPlayers: this.maxPlayers
                });
            }

            if (this.onPlayerListUpdate) {
                this.onPlayerListUpdate(this.getPlayerList());
            }

            // Host receives incoming connections from guests
            this.peer.on('connection', (conn) => {
                console.log('[Network] Guest attempting connection:', conn.peer);

                // Reject if room is already at max capacity
                if (this.peers.size >= (this.maxPlayers - 1)) {
                    console.warn('[Network] Room full! Rejecting:', conn.peer);
                    const rejectConn = () => {
                        try { conn.send({ type: 'ROOM_FULL', max: this.maxPlayers }); } catch (_) {}
                        setTimeout(() => conn.close(), 300);
                    };
                    if (conn.open) rejectConn();
                    else conn.on('open', rejectConn);
                    return;
                }

                this.setupHostGuestConnection(conn);
            });
        });
    }

    setupHostGuestConnection(conn) {
        const handleOpen = () => {
            if (this.peers.has(conn.peer)) return;

            // Assign lowest available slot [2, 3, 4]
            const usedSlots = new Set([1]);
            for (let [_, info] of this.peers) {
                usedSlots.add(info.slot);
            }

            let assignedSlot = null;
            for (let s = 2; s <= this.maxPlayers; s++) {
                if (!usedSlots.has(s)) {
                    assignedSlot = s;
                    break;
                }
            }

            if (!assignedSlot) {
                console.warn('[Network] No slots available, rejecting:', conn.peer);
                try { conn.send({ type: 'ROOM_FULL', max: this.maxPlayers }); } catch (_) {}
                setTimeout(() => conn.close(), 300);
                return;
            }

            const guestName = `PLAYER ${assignedSlot}`;
            this.peers.set(conn.peer, {
                conn: conn,
                slot: assignedSlot,
                name: guestName
            });

            console.log(`[Network] Guest registered: ${guestName} (Slot ${assignedSlot})`);

            // Send WELCOME packet to the new guest
            try {
                conn.send({
                    type: 'WELCOME',
                    slot: assignedSlot,
                    maxPlayers: this.maxPlayers,
                    roomCode: this.roomCode,
                    players: this.getPlayerList()
                });
            } catch (err) {
                console.warn('[Network] Send WELCOME failed:', err);
            }

            // Notify all other existing guests about the new player
            const joinPacket = {
                type: 'PLAYER_JOINED',
                slot: assignedSlot,
                name: guestName,
                players: this.getPlayerList()
            };
            this.broadcastToGuests(joinPacket, conn.peer);

            // Update host UI
            if (this.onPlayerListUpdate) {
                this.onPlayerListUpdate(this.getPlayerList());
            }

            this.updateStatus(`Pemain Terhubung (${this.peers.size + 1}/${this.maxPlayers})`);
            this.startPingLoop();
        };

        if (conn.open) {
            handleOpen();
        } else {
            conn.on('open', handleOpen);
        }

        conn.on('data', (data) => {
            if (!data) return;

            const guestInfo = this.peers.get(conn.peer);
            if (!guestInfo) return;

            if (data.type === '__PING__') {
                conn.send({ type: '__PONG__', t: data.t });
                return;
            }
            if (data.type === '__PONG__') {
                const rtt = Date.now() - data.t;
                this.ping = Math.max(1, Math.round(rtt / 2));
                if (this.onPingUpdate) this.onPingUpdate(this.ping);
                return;
            }

            if (data.type === 'SET_NAME' || data.type === 'REGISTER_GUEST') {
                const newName = (data.name && data.name.trim().slice(0, 14)) || `PLAYER ${guestInfo.slot}`;
                guestInfo.name = newName;
                console.log(`[Network] Guest registered/renamed: ${newName} (Slot ${guestInfo.slot})`);
                const list = this.getPlayerList();
                this.broadcastToGuests({
                    type: 'ROOM_UPDATE',
                    maxPlayers: this.maxPlayers,
                    players: list
                });
                if (this.onPlayerListUpdate) {
                    this.onPlayerListUpdate(list);
                }
                if (this.onRemoteData) {
                    this.onRemoteData({ ...data, slot: guestInfo.slot, name: newName });
                }
                return;
            }

            // Tag data with senderSlot
            data.senderSlot = guestInfo.slot;

            // Deliver packet to Host Game instance
            if (this.onRemoteData) {
                this.onRemoteData(data);
            }

            // Relay packet to all other connected guests (Star Relay)
            this.broadcastToGuests(data, conn.peer);
        });

        conn.on('close', () => {
            const guestInfo = this.peers.get(conn.peer);
            if (guestInfo) {
                console.log(`[Network] Player left: ${guestInfo.name} (Slot ${guestInfo.slot})`);
                this.peers.delete(conn.peer);

                const leavePacket = {
                    type: 'PLAYER_LEFT',
                    slot: guestInfo.slot,
                    name: guestInfo.name,
                    players: this.getPlayerList()
                };
                this.broadcastToGuests(leavePacket);

                if (this.onPlayerListUpdate) {
                    this.onPlayerListUpdate(this.getPlayerList());
                }

                if (this.onDisconnected) {
                    this.onDisconnected(`${guestInfo.name} telah meninggalkan pertandingan.`);
                }
            }
        });

        conn.on('error', (err) => {
            console.error('[Network] Host-Guest connection error:', err);
        });
    }

    broadcastToGuests(packet, excludePeerId = null) {
        for (let [peerId, info] of this.peers) {
            if (peerId !== excludePeerId && info.conn && info.conn.open) {
                try {
                    info.conn.send(packet);
                } catch (_) {}
            }
        }
    }

    startHostMatch(weaponMode, matchDuration = 180, gameType = 'PVP') {
        if (!this.isHost) return;

        const isEDF = (gameType === 'EDF' || weaponMode === 'EDF_COOP');
        const startPacket = {
            type: 'MATCH_START',
            weaponMode: weaponMode,
            gameType: gameType,
            isEDF: isEDF,
            timer: matchDuration,
            players: this.getPlayerList(),
            maxPlayers: this.maxPlayers
        };

        this.broadcastToGuests(startPacket);

        if (this.onMatchStart) {
            this.onMatchStart(startPacket);
        }
    }

    joinRoom(targetCode) {
        this.isHost = false;
        this.roomCode = this.cleanCode(targetCode);

        if (!this.roomCode) {
            if (this.onError) this.onError('Silakan masukkan Kode Room yang valid!');
            return;
        }

        const targetPeerId = this.peerPrefix + this.roomCode.toLowerCase();
        this.updateStatus('Menghubungkan ke Peer Server...');

        this.initPeer(null, () => {
            this.updateStatus(`Menghubungkan ke Host (${this.roomCode})...`);

            const conn = this.peer.connect(targetPeerId, {
                reliable: true
            });

            this.conn = conn;

            this.conn.on('open', () => {
                console.log('[Network] Connected to Host DataChannel!');
                this.isConnected = true;
                this.updateStatus('Terhubung ke Host! Menunggu sesi permainan...');
                this.startPingLoop();
                // Send chosen nickname to host immediately
                this.send({
                    type: 'REGISTER_GUEST',
                    name: this.localPlayerName || 'PLAYER'
                });
            });

            this.conn.on('data', (data) => {
                if (!data) return;

                if (data.type === '__PING__') {
                    this.send({ type: '__PONG__', t: data.t });
                    return;
                }
                if (data.type === '__PONG__') {
                    const rtt = Date.now() - data.t;
                    this.ping = Math.max(1, Math.round(rtt / 2));
                    if (this.onPingUpdate) this.onPingUpdate(this.ping);
                    return;
                }

                if (data.type === 'ROOM_FULL') {
                    if (this.onError) this.onError(`Room sudah penuh (Maksimal ${data.max} pemain).`);
                    this.disconnect();
                    return;
                }

                if (data.type === 'WELCOME') {
                    this.mySlot = data.slot;
                    this.maxPlayers = data.maxPlayers || this.maxPlayers;
                    this.cachedPlayerList = data.players || [];
                    console.log(`[Network] Assigned slot P${this.mySlot} of ${this.maxPlayers}`);
                    this.updateStatus(`Terhubung sebagai P${this.mySlot}! Menunggu Host memulai...`);

                    if (this.onPlayerListUpdate) {
                        this.onPlayerListUpdate(this.getPlayerList());
                    }
                    if (this.onConnected) {
                        this.onConnected({
                            isHost: false,
                            slot: this.mySlot,
                            roomCode: this.roomCode,
                            maxPlayers: this.maxPlayers,
                            players: this.getPlayerList()
                        });
                    }

                    // Sync local nickname with host
                    if (this.localPlayerName) {
                        this.send({
                            type: 'SET_NAME',
                            name: this.localPlayerName
                        });
                    }
                    return;
                }

                if (data.type === 'ROOM_UPDATE') {
                    this.maxPlayers = data.maxPlayers || this.maxPlayers;
                    this.cachedPlayerList = data.players || [];
                    console.log(`[Network] Room updated by host: maxPlayers=${this.maxPlayers}`);
                    if (this.onPlayerListUpdate) {
                        this.onPlayerListUpdate(this.getPlayerList());
                    }
                    return;
                }

                if (data.type === 'PLAYER_JOINED' || data.type === 'PLAYER_LEFT') {
                    this.cachedPlayerList = data.players || [];
                    if (this.onPlayerListUpdate) {
                        this.onPlayerListUpdate(this.getPlayerList());
                    }
                    return;
                }

                if (data.type === 'MATCH_START') {
                    if (data.players) {
                        this.cachedPlayerList = data.players;
                    }
                    if (this.onMatchStart) {
                        this.onMatchStart(data);
                    }
                    return;
                }

                // Normal game packets delivered to local game instance
                if (this.onRemoteData) {
                    this.onRemoteData(data);
                }
            });

            this.conn.on('close', () => {
                console.warn('[Network] Connection to Host closed');
                this.handleDisconnect('Host telah menutup room atau koneksi terputus.');
            });

            this.conn.on('error', (err) => {
                console.error('[Network] Connection error with Host:', err);
                this.handleDisconnect('Terjadi kesalahan pada koneksi WebRTC.');
            });
        });
    }

    send(data) {
        if (!data) return;

        // Ensure senderSlot is always attached
        if (!data.senderSlot) {
            data.senderSlot = this.mySlot;
        }

        if (this.isHost) {
            // Host delivers to local game if needed, and broadcasts to all connected guests
            this.broadcastToGuests(data);
        } else {
            // Guest sends to Host
            if (this.conn && this.conn.open) {
                try {
                    this.conn.send(data);
                } catch (err) {
                    console.error('[Network] Send to host failed:', err);
                }
            }
        }
    }

    startPingLoop() {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            if (this.isConnected) {
                if (this.isHost) {
                    for (let [_, info] of this.peers) {
                        if (info.conn && info.conn.open) {
                            info.conn.send({ type: '__PING__', t: Date.now() });
                        }
                    }
                } else if (this.conn && this.conn.open) {
                    this.conn.send({ type: '__PING__', t: Date.now() });
                }
            }
        }, 1500);
    }

    updateStatus(text) {
        if (this.onStatusChange) {
            this.onStatusChange({
                status: this.isConnected ? 'CONNECTED' : (this.isHost ? 'WAITING' : 'CONNECTING'),
                text: text,
                code: this.roomCode,
                isHost: this.isHost,
                mySlot: this.mySlot,
                maxPlayers: this.maxPlayers
            });
        }
    }

    handleDisconnect(reason = 'Koneksi terputus.') {
        this.isConnected = false;
        clearInterval(this.pingTimer);
        if (this.onDisconnected) {
            this.onDisconnected(reason);
        }
    }

    disconnect() {
        clearInterval(this.pingTimer);
        this.isConnected = false;
        for (let [_, info] of this.peers) {
            try { info.conn.close(); } catch (_) {}
        }
        this.peers.clear();

        if (this.conn) {
            try { this.conn.close(); } catch (_) {}
            this.conn = null;
        }
        if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (_) {}
            this.peer = null;
        }
        this.roomCode = null;
        this.isHost = false;
        this.mySlot = 1;
        this.cachedPlayerList = [];
        this.ping = 0;
    }
}

window.networkEngine = new NetworkEngine();
