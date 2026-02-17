/**
 * @fileoverview WebSocket Server for Real-Time Updates
 * @description Provides WebSocket connections for instant odds updates and live notifications
 * @module surebet-detector/websocket-server
 */

const WebSocket = require('ws');
const http = require('http');
const EventEmitter = require('events');

/**
 * WebSocket Server for real-time surebet updates
 */
class SurebetWebSocketServer extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            port: config.wsPort || 3001,
            path: config.wsPath || '/ws',
            heartbeatInterval: config.heartbeatInterval || 30000, // 30s
            ...config
        };
        
        this.wss = null;
        this.clients = new Map(); // clientId -> { ws, subscriptions, lastPing }
        this.clientIdCounter = 0;
        this.heartbeatTimer = null;
    }

    /**
     * Initialize WebSocket server
     */
    async init(server = null) {
        if (server) {
            // Attach to existing HTTP server
            this.wss = new WebSocket.Server({ 
                server,
                path: this.config.path
            });
        } else {
            // Create standalone server
            this.wss = new WebSocket.Server({ 
                port: this.config.port,
                path: this.config.path
            });
        }

        this.setupEventHandlers();
        this.startHeartbeat();
        
        console.log(`🔌 WebSocket server initialized on ${server ? 'existing server' : `port ${this.config.port}`}`);
        
        this.emit('initialized');
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.wss.on('connection', (ws, req) => {
            const clientId = ++this.clientIdCounter;
            const clientInfo = {
                id: clientId,
                ws,
                subscriptions: new Set(),
                lastPing: Date.now(),
                connectedAt: new Date().toISOString(),
                ip: req.socket.remoteAddress
            };
            
            this.clients.set(clientId, clientInfo);
            
            console.log(`🔌 Client ${clientId} connected from ${clientInfo.ip}`);
            this.emit('clientConnected', { clientId, ip: clientInfo.ip });

            // Send welcome message
            this.sendToClient(clientId, {
                type: 'connected',
                clientId,
                timestamp: new Date().toISOString(),
                message: 'Connected to Surebet WebSocket server'
            });

            // Handle incoming messages
            ws.on('message', (data) => {
                this.handleMessage(clientId, data);
            });

            // Handle client disconnect
            ws.on('close', (code, reason) => {
                console.log(`🔌 Client ${clientId} disconnected (${code})`);
                this.clients.delete(clientId);
                this.emit('clientDisconnected', { clientId, code, reason });
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`WebSocket error for client ${clientId}:`, error.message);
                this.emit('clientError', { clientId, error });
            });

            // Handle pong (heartbeat response)
            ws.on('pong', () => {
                if (this.clients.has(clientId)) {
                    this.clients.get(clientId).lastPing = Date.now();
                }
            });
        });

        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error.message);
            this.emit('error', error);
        });
    }

    /**
     * Handle incoming client messages
     */
    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data);
            const client = this.clients.get(clientId);
            
            if (!client) return;

            console.log(`📨 Message from client ${clientId}: ${message.type}`);

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscribe(clientId, message);
                    break;
                
                case 'unsubscribe':
                    this.handleUnsubscribe(clientId, message);
                    break;
                
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                
                case 'getStatus':
                    this.sendStatus(clientId);
                    break;
                
                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        message: `Unknown message type: ${message.type}`
                    });
            }
        } catch (error) {
            console.error(`Error handling message from client ${clientId}:`, error.message);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid message format'
            });
        }
    }

    /**
     * Handle subscription request
     */
    handleSubscribe(clientId, message) {
        const { channels } = message;
        const client = this.clients.get(clientId);
        
        if (!channels || !Array.isArray(channels)) {
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid subscription: channels array required'
            });
            return;
        }

        const validChannels = [
            'opportunities',
            'liveMatches',
            'oddsMovements',
            'bankroll',
            'alerts',
            'all'
        ];

        const subscribed = [];
        const rejected = [];

        for (const channel of channels) {
            if (validChannels.includes(channel)) {
                client.subscriptions.add(channel);
                subscribed.push(channel);
            } else {
                rejected.push(channel);
            }
        }

        this.sendToClient(clientId, {
            type: 'subscribed',
            channels: subscribed,
            rejected: rejected.length > 0 ? rejected : undefined
        });

        this.emit('subscribed', { clientId, channels: subscribed });
    }

    /**
     * Handle unsubscription request
     */
    handleUnsubscribe(clientId, message) {
        const { channels } = message;
        const client = this.clients.get(clientId);
        
        if (!channels || !Array.isArray(channels)) {
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid unsubscription: channels array required'
            });
            return;
        }

        const unsubscribed = [];

        for (const channel of channels) {
            if (client.subscriptions.has(channel)) {
                client.subscriptions.delete(channel);
                unsubscribed.push(channel);
            }
        }

        this.sendToClient(clientId, {
            type: 'unsubscribed',
            channels: unsubscribed
        });
    }

    /**
     * Send server status to client
     */
    sendStatus(clientId) {
        const client = this.clients.get(clientId);
        
        this.sendToClient(clientId, {
            type: 'status',
            connectedClients: this.clients.size,
            subscriptions: Array.from(client.subscriptions),
            serverTime: new Date().toISOString()
        });
    }

    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            client.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error(`Error sending to client ${clientId}:`, error.message);
            return false;
        }
    }

    /**
     * Broadcast message to all subscribed clients
     */
    broadcast(channel, data) {
        const message = {
            type: 'update',
            channel,
            timestamp: new Date().toISOString(),
            data
        };

        let sentCount = 0;

        for (const [clientId, client] of this.clients) {
            // Check if client is subscribed to this channel or 'all'
            if (client.subscriptions.has(channel) || client.subscriptions.has('all')) {
                if (this.sendToClient(clientId, message)) {
                    sentCount++;
                }
            }
        }

        return sentCount;
    }

    /**
     * Broadcast new arbitrage opportunity
     */
    broadcastArbitrage(opportunity) {
        return this.broadcast('opportunities', {
            subtype: 'arbitrage',
            opportunity
        });
    }

    /**
     * Broadcast new +EV opportunity
     */
    broadcastPositiveEV(opportunity) {
        return this.broadcast('opportunities', {
            subtype: 'positiveEV',
            opportunity
        });
    }

    /**
     * Broadcast live match update
     */
    broadcastLiveMatch(match) {
        return this.broadcast('liveMatches', {
            subtype: 'matchUpdate',
            match
        });
    }

    /**
     * Broadcast live arbitrage opportunity
     */
    broadcastLiveArbitrage(opportunity) {
        return this.broadcast('liveMatches', {
            subtype: 'liveArbitrage',
            opportunity
        });
    }

    /**
     * Broadcast odds movement
     */
    broadcastOddsMovement(movement) {
        return this.broadcast('oddsMovements', {
            subtype: 'movement',
            movement
        });
    }

    /**
     * Broadcast bankroll update
     */
    broadcastBankrollUpdate(bankroll) {
        return this.broadcast('bankroll', {
            subtype: 'update',
            bankroll
        });
    }

    /**
     * Broadcast alert
     */
    broadcastAlert(alert) {
        return this.broadcast('alerts', {
            subtype: alert.type || 'general',
            alert
        });
    }

    /**
     * Start heartbeat to detect disconnected clients
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            const deadClients = [];

            for (const [clientId, client] of this.clients) {
                // Check if client hasn't responded to ping in 60 seconds
                if (now - client.lastPing > 60000) {
                    deadClients.push(clientId);
                    continue;
                }

                // Send ping
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.ping();
                }
            }

            // Remove dead clients
            for (const clientId of deadClients) {
                console.log(`💀 Removing dead client ${clientId}`);
                const client = this.clients.get(clientId);
                if (client) {
                    client.ws.terminate();
                    this.clients.delete(clientId);
                }
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Stop the WebSocket server
     */
    stop() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        // Close all client connections
        for (const [clientId, client] of this.clients) {
            client.ws.close(1000, 'Server shutting down');
        }
        this.clients.clear();

        // Close server
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }

        console.log('🔌 WebSocket server stopped');
        this.emit('stopped');
    }

    /**
     * Get server statistics
     */
    getStats() {
        const subscriptions = {};
        
        for (const client of this.clients.values()) {
            for (const channel of client.subscriptions) {
                subscriptions[channel] = (subscriptions[channel] || 0) + 1;
            }
        }

        return {
            connectedClients: this.clients.size,
            subscriptions,
            uptime: process.uptime()
        };
    }
}

module.exports = SurebetWebSocketServer;
