"use strict";
/**
 * Slippage Protection WebSocket Server
 *
 * Real-time WebSocket interface for slippage protection events.
 * Allows clients to subscribe to slippage alerts and configure
 * protection settings dynamically.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlippageProtectionWebSocket = void 0;
const ws_1 = require("ws");
const logger_js_1 = require("./logger.js");
class SlippageProtectionWebSocket {
    wss;
    protector;
    clients = new Map();
    alertHistory = [];
    MAX_HISTORY = 100;
    constructor(protector, port = 8081) {
        this.protector = protector;
        this.wss = new ws_1.WebSocketServer({ port });
        this.setupWebSocketServer();
        this.setupSlippageListeners();
        logger_js_1.logger.info('SlippageProtectionWebSocket started', { port });
    }
    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            logger_js_1.logger.info('Client connected to slippage protection WebSocket');
            // Default subscription
            this.clients.set(ws, {
                ws,
                slippageTypes: ['acceptable', 'critical']
            });
            // Send initial state
            this.sendToClient(ws, {
                type: 'connected',
                payload: {
                    message: 'Connected to slippage protection service',
                    alertCount: this.alertHistory.length,
                    config: this.getPublicConfig()
                }
            });
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(ws, message);
                }
                catch (error) {
                    this.sendToClient(ws, {
                        type: 'error',
                        payload: { message: 'Invalid JSON message' }
                    });
                }
            });
            ws.on('close', () => {
                this.clients.delete(ws);
                logger_js_1.logger.info('Client disconnected from slippage protection WebSocket');
            });
            ws.on('error', (error) => {
                logger_js_1.logger.error('WebSocket error', { error });
                this.clients.delete(ws);
            });
        });
    }
    setupSlippageListeners() {
        // Listen for all slippage checks
        this.protector.on('slippageCheck', (event) => {
            this.addToHistory(event);
            this.broadcastSlippageEvent(event);
        });
        // Listen for successful bet placements
        this.protector.on('betPlaced', (event) => {
            this.broadcastToSubscribers({
                type: 'betPlaced',
                payload: {
                    request: event.request,
                    result: event.result,
                    attempts: event.attempts,
                    timestamp: event.timestamp
                }
            });
        });
        // Listen for aborted bets
        this.protector.on('betAborted', (event) => {
            this.broadcastToSubscribers({
                type: 'betAborted',
                payload: {
                    request: event.request,
                    result: event.result,
                    attempts: event.attempts,
                    timestamp: event.timestamp
                }
            });
        });
    }
    handleMessage(ws, message) {
        switch (message.type) {
            case 'subscribe':
                this.handleSubscribe(ws, message.payload);
                break;
            case 'unsubscribe':
                this.handleUnsubscribe(ws);
                break;
            case 'getHistory':
                this.sendHistory(ws, message.payload?.limit);
                break;
            case 'updateConfig':
                this.handleUpdateConfig(ws, message.payload);
                break;
            case 'getConfig':
                this.sendConfig(ws);
                break;
            case 'ping':
                this.sendToClient(ws, { type: 'pong', payload: { timestamp: Date.now() } });
                break;
            default:
                this.sendToClient(ws, {
                    type: 'error',
                    payload: { message: `Unknown message type: ${message.type}` }
                });
        }
    }
    handleSubscribe(ws, payload) {
        const subscription = {
            ws,
            minSlippagePercent: payload?.minSlippagePercent,
            slippageTypes: payload?.slippageTypes || ['acceptable', 'critical'],
            bookmakers: payload?.bookmakers
        };
        this.clients.set(ws, subscription);
        this.sendToClient(ws, {
            type: 'subscribed',
            payload: { subscription }
        });
        logger_js_1.logger.info('Client subscribed to slippage alerts', { subscription });
    }
    handleUnsubscribe(ws) {
        this.clients.delete(ws);
        this.sendToClient(ws, {
            type: 'unsubscribed',
            payload: { message: 'Unsubscribed from slippage alerts' }
        });
    }
    sendHistory(ws, limit = 50) {
        const history = this.alertHistory
            .slice(-Math.min(limit, this.MAX_HISTORY))
            .reverse();
        this.sendToClient(ws, {
            type: 'history',
            payload: { alerts: history }
        });
    }
    handleUpdateConfig(ws, payload) {
        try {
            this.protector.updateConfig(payload);
            this.sendToClient(ws, {
                type: 'configUpdated',
                payload: { config: this.getPublicConfig() }
            });
            // Broadcast config change to all clients
            this.broadcastToSubscribers({
                type: 'configChanged',
                payload: { config: this.getPublicConfig() }
            });
            logger_js_1.logger.info('Slippage protection config updated via WebSocket', { payload });
        }
        catch (error) {
            this.sendToClient(ws, {
                type: 'error',
                payload: { message: 'Failed to update config', error: String(error) }
            });
        }
    }
    sendConfig(ws) {
        this.sendToClient(ws, {
            type: 'config',
            payload: { config: this.getPublicConfig() }
        });
    }
    getPublicConfig() {
        // Return config without sensitive values
        return {
            maxSlippagePercent: 0.5,
            criticalSlippagePercent: 2.0,
            autoRetry: true,
            maxRetries: 3,
            detectPriceImprovement: true
        };
    }
    broadcastSlippageEvent(event) {
        const message = {
            type: 'slippageAlert',
            payload: {
                request: event.request,
                result: event.result,
                timestamp: event.timestamp
            }
        };
        for (const [ws, subscription] of this.clients) {
            if (ws.readyState !== ws_1.WebSocket.OPEN)
                continue;
            // Check if client is subscribed to this slippage type
            if (!subscription.slippageTypes.includes(event.result.slippageType)) {
                continue;
            }
            // Check minimum slippage threshold
            if (subscription.minSlippagePercent !== undefined) {
                const absSlippage = Math.abs(event.result.slippagePercent);
                if (absSlippage < subscription.minSlippagePercent) {
                    continue;
                }
            }
            // Check bookmaker filter
            if (subscription.bookmakers?.length) {
                if (!subscription.bookmakers.includes(event.request.bookmaker)) {
                    continue;
                }
            }
            this.sendToClient(ws, message);
        }
    }
    broadcastToSubscribers(message) {
        for (const [ws] of this.clients) {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                this.sendToClient(ws, message);
            }
        }
    }
    sendToClient(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    addToHistory(event) {
        this.alertHistory.push(event);
        // Trim history if it exceeds max
        if (this.alertHistory.length > this.MAX_HISTORY) {
            this.alertHistory = this.alertHistory.slice(-this.MAX_HISTORY);
        }
    }
    /**
     * Get current connection statistics
     */
    getStats() {
        return {
            connectedClients: this.clients.size,
            alertHistoryCount: this.alertHistory.length
        };
    }
    /**
     * Close the WebSocket server
     */
    close() {
        return new Promise((resolve) => {
            this.wss.close(() => {
                logger_js_1.logger.info('SlippageProtectionWebSocket closed');
                resolve();
            });
        });
    }
}
exports.SlippageProtectionWebSocket = SlippageProtectionWebSocket;
exports.default = SlippageProtectionWebSocket;
//# sourceMappingURL=slippage-protection-websocket.js.map