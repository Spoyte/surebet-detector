"use strict";
/**
 * Opportunity Confidence Scoring WebSocket Server
 *
 * Real-time WebSocket server for streaming ML-based confidence scores
 * to connected dashboard clients.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceScoringWebSocket = void 0;
const ws_1 = require("ws");
const events_1 = require("events");
const logger_js_1 = __importDefault(require("./utils/logger.js"));
class ConfidenceScoringWebSocket extends events_1.EventEmitter {
    wss;
    clients = new Map();
    scorer;
    scoredOpportunities = [];
    maxHistorySize = 1000;
    statsInterval;
    heartbeatInterval;
    constructor(scorer, port = 8082) {
        super();
        this.scorer = scorer;
        this.wss = new ws_1.WebSocketServer({ port });
        this.setupWebSocketServer();
        this.startStatsBroadcast();
        this.startHeartbeat();
        logger_js_1.default.info('Confidence scoring WebSocket server initialized', { port });
    }
    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            const client = {
                ws,
                id: clientId,
                subscriptions: {},
                connectedAt: new Date(),
                lastPing: new Date()
            };
            this.clients.set(clientId, client);
            logger_js_1.default.info(`Client connected to confidence scoring WebSocket`, { clientId });
            // Send welcome message with connection info
            this.sendToClient(client, {
                type: 'connected',
                data: {
                    clientId,
                    message: 'Connected to confidence scoring service',
                    features: {
                        realTimeScoring: true,
                        batchScoring: true,
                        modelExport: true,
                        filtering: true
                    }
                }
            });
            // Send recent high-scoring opportunities
            const recentHighScores = this.scoredOpportunities
                .filter(opp => opp.score.score >= 70)
                .slice(-20);
            if (recentHighScores.length > 0) {
                this.sendToClient(client, {
                    type: 'recentOpportunities',
                    data: recentHighScores
                });
            }
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(client, message);
                }
                catch (error) {
                    this.sendToClient(client, {
                        type: 'error',
                        data: { message: 'Invalid JSON message' }
                    });
                }
            });
            ws.on('close', () => {
                this.clients.delete(clientId);
                logger_js_1.default.info(`Client disconnected from confidence scoring WebSocket`, { clientId });
                this.emit('clientDisconnected', { clientId });
            });
            ws.on('error', (error) => {
                logger_js_1.default.error(`WebSocket error for client ${clientId}:`, error);
                this.clients.delete(clientId);
            });
            this.emit('clientConnected', { clientId });
        });
        this.wss.on('error', (error) => {
            logger_js_1.default.error('Confidence scoring WebSocket server error:', error);
            this.emit('error', error);
        });
    }
    handleMessage(client, message) {
        switch (message.type) {
            case 'subscribe':
                this.handleSubscribe(client, message.data);
                break;
            case 'unsubscribe':
                this.handleUnsubscribe(client);
                break;
            case 'scoreOpportunity':
                this.handleScoreRequest(client, message.data);
                break;
            case 'scoreBatch':
                this.handleBatchScoreRequest(client, message.data);
                break;
            case 'getModel':
                this.handleGetModel(client);
                break;
            case 'getBookmakerRanking':
                this.handleGetBookmakerRanking(client);
                break;
            case 'getSportInsights':
                this.handleGetSportInsights(client, message.data);
                break;
            case 'ping':
                client.lastPing = new Date();
                this.sendToClient(client, { type: 'pong', data: { timestamp: Date.now() } });
                break;
            default:
                this.sendToClient(client, {
                    type: 'error',
                    data: { message: `Unknown message type: ${message.type}` }
                });
        }
    }
    handleSubscribe(client, data) {
        client.subscriptions = { ...client.subscriptions, ...data };
        logger_js_1.default.info(`Client ${client.id} updated subscriptions`, { subscriptions: client.subscriptions });
        this.sendToClient(client, {
            type: 'subscribed',
            data: {
                subscriptions: client.subscriptions,
                activeOpportunities: this.scoredOpportunities.filter(opp => this.matchesSubscription(opp, client.subscriptions)).length
            }
        });
    }
    handleUnsubscribe(client) {
        client.subscriptions = {};
        this.sendToClient(client, {
            type: 'unsubscribed',
            data: { message: 'Unsubscribed from all filters' }
        });
    }
    async handleScoreRequest(client, data) {
        try {
            const score = await this.scorer.scoreOpportunity(data.features);
            this.sendToClient(client, {
                type: 'scoreResult',
                data: { features: data.features, score }
            });
        }
        catch (error) {
            this.sendToClient(client, {
                type: 'error',
                data: { message: 'Failed to score opportunity', error: error.message }
            });
        }
    }
    async handleBatchScoreRequest(client, data) {
        try {
            const scores = await this.scorer.scoreBatch(data.opportunities);
            this.sendToClient(client, {
                type: 'batchScoreResult',
                data: {
                    count: scores.length,
                    scores: data.opportunities.map((opp, i) => ({
                        features: opp,
                        score: scores[i]
                    }))
                }
            });
        }
        catch (error) {
            this.sendToClient(client, {
                type: 'error',
                data: { message: 'Failed to score batch', error: error.message }
            });
        }
    }
    handleGetModel(client) {
        const model = this.scorer.exportModel();
        this.sendToClient(client, {
            type: 'modelData',
            data: model
        });
    }
    handleGetBookmakerRanking(client) {
        const rankings = this.scorer.getBookmakerRanking();
        this.sendToClient(client, {
            type: 'bookmakerRanking',
            data: rankings
        });
    }
    handleGetSportInsights(client, data) {
        const insights = this.scorer.getSportInsights(data.sport);
        this.sendToClient(client, {
            type: 'sportInsights',
            data: { sport: data.sport, insights }
        });
    }
    matchesSubscription(opportunity, subscription) {
        if (subscription.minScore !== undefined && opportunity.score.score < subscription.minScore) {
            return false;
        }
        if (subscription.minGrade !== undefined) {
            const gradeOrder = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
            if (gradeOrder[opportunity.score.grade] < gradeOrder[subscription.minGrade]) {
                return false;
            }
        }
        if (subscription.sports !== undefined && !subscription.sports.includes(opportunity.sport)) {
            return false;
        }
        if (subscription.bookmakers !== undefined) {
            const hasBookmaker = opportunity.bookmakers.some(bm => subscription.bookmakers.includes(bm));
            if (!hasBookmaker)
                return false;
        }
        if (subscription.action !== undefined && opportunity.score.recommendedAction !== subscription.action) {
            return false;
        }
        return true;
    }
    /**
     * Broadcast a scored opportunity to all subscribed clients
     */
    broadcastOpportunity(opportunity) {
        // Add to history
        this.scoredOpportunities.push(opportunity);
        if (this.scoredOpportunities.length > this.maxHistorySize) {
            this.scoredOpportunities.shift();
        }
        // Broadcast to subscribed clients
        for (const client of this.clients.values()) {
            if (this.matchesSubscription(opportunity, client.subscriptions)) {
                this.sendToClient(client, {
                    type: 'opportunityScored',
                    data: opportunity
                });
            }
        }
        this.emit('opportunityBroadcast', { opportunity, clientCount: this.clients.size });
    }
    /**
     * Score and broadcast an opportunity
     */
    async scoreAndBroadcast(id, match, sport, league, market, bookmakers, features) {
        const score = await this.scorer.scoreOpportunity(features);
        const opportunity = {
            id,
            match,
            sport,
            league,
            market,
            bookmakers,
            features,
            score,
            timestamp: Date.now()
        };
        this.broadcastOpportunity(opportunity);
        return score;
    }
    startStatsBroadcast() {
        this.statsInterval = setInterval(() => {
            const stats = this.getStats();
            this.broadcast({ type: 'stats', data: stats });
        }, 30000); // Every 30 seconds
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = new Date();
            for (const client of this.clients.values()) {
                const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
                if (timeSinceLastPing > 120000) { // 2 minutes
                    logger_js_1.default.warn(`Client ${client.id} timed out, closing connection`);
                    client.ws.close();
                    this.clients.delete(client.id);
                }
                else {
                    this.sendToClient(client, { type: 'ping' });
                }
            }
        }, 30000); // Every 30 seconds
    }
    broadcast(message) {
        const data = JSON.stringify(message);
        for (const client of this.clients.values()) {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }
    sendToClient(client, message) {
        if (client.ws.readyState === ws_1.WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getStats() {
        const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        let totalScore = 0;
        let highScoreCount = 0;
        for (const opp of this.scoredOpportunities) {
            gradeDistribution[opp.score.grade]++;
            totalScore += opp.score.score;
            if (opp.score.score >= 70)
                highScoreCount++;
        }
        return {
            connectedClients: this.clients.size,
            totalScored: this.scoredOpportunities.length,
            highScoreCount,
            avgScore: this.scoredOpportunities.length > 0
                ? Math.round(totalScore / this.scoredOpportunities.length)
                : 0,
            gradeDistribution
        };
    }
    getRecentOpportunities(count = 50) {
        return this.scoredOpportunities.slice(-count);
    }
    async close() {
        if (this.statsInterval)
            clearInterval(this.statsInterval);
        if (this.heartbeatInterval)
            clearInterval(this.heartbeatInterval);
        for (const client of this.clients.values()) {
            client.ws.close();
        }
        this.clients.clear();
        return new Promise((resolve) => {
            this.wss.close(() => {
                logger_js_1.default.info('Confidence scoring WebSocket server closed');
                resolve();
            });
        });
    }
}
exports.ConfidenceScoringWebSocket = ConfidenceScoringWebSocket;
exports.default = ConfidenceScoringWebSocket;
//# sourceMappingURL=confidence-scoring-websocket.js.map