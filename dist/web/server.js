"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const logger_js_1 = __importDefault(require("../utils/logger.js"));
const metrics_js_1 = require("../utils/metrics.js");
/**
 * Express server for API endpoints
 */
function createServer(engine) {
    const app = (0, express_1.default)();
    // Middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)());
    app.use((0, compression_1.default)());
    app.use(express_1.default.json());
    // Health check
    app.get('/health', (req, res) => {
        const stats = engine.getStats();
        res.json({
            status: stats.isRunning ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            stats
        });
    });
    // Metrics endpoint for Prometheus
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', metrics_js_1.register.contentType);
        res.end(await metrics_js_1.register.metrics());
    });
    // Get all active events with aggregated odds
    app.get('/api/events', async (req, res) => {
        try {
            const events = await engine.getAllEvents();
            res.json({
                count: events.length,
                events
            });
        }
        catch (error) {
            logger_js_1.default.error('Error fetching events:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    });
    // Get aggregated odds for a specific event
    app.get('/api/events/:eventId', async (req, res) => {
        try {
            const { eventId } = req.params;
            const event = await engine.getEventOdds(eventId);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            res.json(event);
        }
        catch (error) {
            logger_js_1.default.error('Error fetching event:', error);
            res.status(500).json({ error: 'Failed to fetch event' });
        }
    });
    // Get bookmaker health status
    app.get('/api/bookmakers/health', (req, res) => {
        const health = engine.getBookmakerHealth();
        res.json({
            count: health.length,
            bookmakers: health
        });
    });
    // Get engine statistics
    app.get('/api/stats', (req, res) => {
        const stats = engine.getStats();
        res.json(stats);
    });
    // WebSocket upgrade endpoint for real-time odds streaming
    app.get('/api/stream', (req, res) => {
        res.json({
            message: 'WebSocket streaming available at ws://localhost:3001/stream',
            documentation: 'Connect via WebSocket to receive real-time odds updates'
        });
    });
    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
    // Error handler
    app.use((err, req, res, next) => {
        logger_js_1.default.error('Express error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });
    return app;
}
//# sourceMappingURL=server.js.map