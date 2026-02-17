"use strict";
/**
 * Monitoring and Alerting Service
 *
 * Comprehensive monitoring with Prometheus metrics, health checks,
 * and intelligent alerting via multiple channels.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const events_1 = require("events");
const logger_js_1 = __importDefault(require("./utils/logger.js"));
class MonitoringService extends events_1.EventEmitter {
    alerts = new Map();
    activeAlerts = new Map();
    alertHistory = [];
    healthChecks = new Map();
    healthStatus = null;
    checkIntervals = new Map();
    metricBuffers = new Map();
    constructor() {
        super();
        this.initializeDefaultAlerts();
    }
    /**
     * Initialize default monitoring alerts
     */
    initializeDefaultAlerts() {
        // High error rate alert
        this.registerAlert({
            id: 'high-error-rate',
            name: 'High Error Rate',
            condition: {
                metric: 'errors_per_minute',
                operator: 'gt',
                threshold: 10,
                durationSeconds: 120
            },
            severity: 'critical',
            channels: [{ type: 'telegram', config: {} }],
            cooldownMinutes: 15,
            enabled: true
        });
        // Bookmaker disconnection alert
        this.registerAlert({
            id: 'bookmaker-disconnect',
            name: 'Bookmaker Disconnected',
            condition: {
                metric: 'bookmaker_disconnections',
                operator: 'gt',
                threshold: 0,
                durationSeconds: 60
            },
            severity: 'warning',
            channels: [{ type: 'telegram', config: {} }],
            cooldownMinutes: 5,
            enabled: true
        });
        // Low cache hit rate alert
        this.registerAlert({
            id: 'low-cache-hit-rate',
            name: 'Low Cache Hit Rate',
            condition: {
                metric: 'cache_hit_rate',
                operator: 'lt',
                threshold: 50,
                durationSeconds: 300
            },
            severity: 'warning',
            channels: [{ type: 'slack', config: {} }],
            cooldownMinutes: 30,
            enabled: true
        });
        // High arbitrage opportunity alert (for tracking)
        this.registerAlert({
            id: 'high-value-opportunity',
            name: 'High Value Arbitrage Detected',
            condition: {
                metric: 'arbitrage_profit_percent',
                operator: 'gt',
                threshold: 5
            },
            severity: 'info',
            channels: [{ type: 'telegram', config: {} }],
            cooldownMinutes: 1,
            enabled: true
        });
        // System memory alert
        this.registerAlert({
            id: 'high-memory-usage',
            name: 'High Memory Usage',
            condition: {
                metric: 'memory_usage_percent',
                operator: 'gt',
                threshold: 85,
                durationSeconds: 180
            },
            severity: 'critical',
            channels: [{ type: 'pagerduty', config: {} }],
            cooldownMinutes: 10,
            enabled: true
        });
    }
    /**
     * Register a new alert
     */
    registerAlert(config) {
        this.alerts.set(config.id, config);
        logger_js_1.default.info(`Registered alert: ${config.name}`);
    }
    /**
     * Register a health check
     */
    registerHealthCheck(check) {
        this.healthChecks.set(check.name, check);
        // Start periodic health checks
        const interval = setInterval(async () => {
            await this.runHealthCheck(check);
        }, check.intervalSeconds * 1000);
        this.checkIntervals.set(check.name, interval);
        // Run initial check
        this.runHealthCheck(check);
    }
    /**
     * Run a single health check
     */
    async runHealthCheck(check) {
        const startTime = Date.now();
        try {
            const result = await check.check();
            const responseTime = Date.now() - startTime;
            // Update health status
            if (!this.healthStatus) {
                this.healthStatus = {
                    status: 'healthy',
                    checks: [],
                    timestamp: Date.now()
                };
            }
            const existingIndex = this.healthStatus.checks.findIndex(c => c.name === check.name);
            const checkResult = {
                name: check.name,
                status: result.healthy ? 'pass' : 'fail',
                message: result.message,
                responseTime,
                lastCheck: Date.now()
            };
            if (existingIndex >= 0) {
                this.healthStatus.checks[existingIndex] = checkResult;
            }
            else {
                this.healthStatus.checks.push(checkResult);
            }
            // Update overall status
            const failedChecks = this.healthStatus.checks.filter(c => c.status === 'fail').length;
            const warnChecks = this.healthStatus.checks.filter(c => c.status === 'warn').length;
            if (failedChecks > 0) {
                this.healthStatus.status = 'unhealthy';
            }
            else if (warnChecks > 0) {
                this.healthStatus.status = 'degraded';
            }
            else {
                this.healthStatus.status = 'healthy';
            }
            this.healthStatus.timestamp = Date.now();
            // Emit event
            this.emit('health:check', checkResult);
        }
        catch (error) {
            logger_js_1.default.error(`Health check failed: ${check.name}`, error);
        }
    }
    /**
     * Record a metric value
     */
    recordMetric(name, value) {
        // Buffer metrics for condition evaluation
        if (!this.metricBuffers.has(name)) {
            this.metricBuffers.set(name, []);
        }
        const buffer = this.metricBuffers.get(name);
        buffer.push(value);
        // Keep last 100 values
        if (buffer.length > 100) {
            buffer.shift();
        }
        // Check alert conditions
        this.evaluateAlertConditions(name, value);
    }
    /**
     * Evaluate alert conditions for a metric
     */
    evaluateAlertConditions(metricName, value) {
        for (const alert of this.alerts.values()) {
            if (!alert.enabled)
                continue;
            if (alert.condition.metric !== metricName)
                continue;
            const condition = alert.condition;
            let breached = false;
            switch (condition.operator) {
                case 'gt':
                    breached = value > condition.threshold;
                    break;
                case 'lt':
                    breached = value < condition.threshold;
                    break;
                case 'eq':
                    breached = value === condition.threshold;
                    break;
                case 'gte':
                    breached = value >= condition.threshold;
                    break;
                case 'lte':
                    breached = value <= condition.threshold;
                    break;
            }
            if (breached) {
                this.triggerAlert(alert, value);
            }
        }
    }
    /**
     * Trigger an alert
     */
    triggerAlert(config, value) {
        // Check cooldown
        const existingAlert = this.activeAlerts.get(config.id);
        if (existingAlert) {
            const cooldownMs = config.cooldownMinutes * 60 * 1000;
            if (Date.now() - existingAlert.timestamp < cooldownMs) {
                return; // Still in cooldown
            }
        }
        const alert = {
            id: `${config.id}-${Date.now()}`,
            configId: config.id,
            name: config.name,
            severity: config.severity,
            message: this.generateAlertMessage(config, value),
            metric: config.condition.metric,
            value,
            threshold: config.condition.threshold,
            timestamp: Date.now(),
            acknowledged: false
        };
        this.activeAlerts.set(config.id, alert);
        this.alertHistory.push(alert);
        // Send to channels
        this.sendAlertToChannels(alert, config.channels);
        // Emit event
        this.emit('alert:triggered', alert);
        logger_js_1.default.warn(`Alert triggered: ${config.name}`, { value, threshold: config.condition.threshold });
    }
    /**
     * Generate human-readable alert message
     */
    generateAlertMessage(config, value) {
        const operatorMap = {
            gt: 'exceeds',
            lt: 'below',
            eq: 'equals',
            gte: 'exceeds or equals',
            lte: 'below or equals'
        };
        return `${config.name}: ${config.condition.metric} (${value.toFixed(2)}) ${operatorMap[config.condition.operator]} threshold (${config.condition.threshold})`;
    }
    /**
     * Send alert to configured channels
     */
    async sendAlertToChannels(alert, channels) {
        for (const channel of channels) {
            try {
                switch (channel.type) {
                    case 'telegram':
                        await this.sendTelegramAlert(alert, channel.config);
                        break;
                    case 'slack':
                        await this.sendSlackAlert(alert, channel.config);
                        break;
                    case 'discord':
                        await this.sendDiscordAlert(alert, channel.config);
                        break;
                    case 'email':
                        await this.sendEmailAlert(alert, channel.config);
                        break;
                    case 'webhook':
                        await this.sendWebhookAlert(alert, channel.config);
                        break;
                    case 'pagerduty':
                        await this.sendPagerDutyAlert(alert, channel.config);
                        break;
                }
            }
            catch (error) {
                logger_js_1.default.error(`Failed to send alert to ${channel.type}:`, error);
            }
        }
    }
    async sendTelegramAlert(alert, config) {
        // Implementation would use Telegram Bot API
        logger_js_1.default.info(`[Telegram] ${alert.message}`);
    }
    async sendSlackAlert(alert, config) {
        // Implementation would use Slack Webhook API
        logger_js_1.default.info(`[Slack] ${alert.message}`);
    }
    async sendDiscordAlert(alert, config) {
        // Implementation would use Discord Webhook API
        logger_js_1.default.info(`[Discord] ${alert.message}`);
    }
    async sendEmailAlert(alert, config) {
        // Implementation would use SMTP
        logger_js_1.default.info(`[Email] ${alert.message}`);
    }
    async sendWebhookAlert(alert, config) {
        // Implementation would POST to webhook URL
        logger_js_1.default.info(`[Webhook] ${alert.message}`);
    }
    async sendPagerDutyAlert(alert, config) {
        // Implementation would use PagerDuty Events API
        logger_js_1.default.info(`[PagerDuty] ${alert.message}`);
    }
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId) {
        for (const [configId, alert] of this.activeAlerts.entries()) {
            if (alert.id === alertId) {
                alert.acknowledged = true;
                this.emit('alert:acknowledged', alert);
                return true;
            }
        }
        return false;
    }
    /**
     * Resolve an alert
     */
    resolveAlert(configId) {
        const alert = this.activeAlerts.get(configId);
        if (alert) {
            this.activeAlerts.delete(configId);
            this.emit('alert:resolved', alert);
            return true;
        }
        return false;
    }
    /**
     * Get current health status
     */
    getHealthStatus() {
        return this.healthStatus;
    }
    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values())
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Get alert history
     */
    getAlertHistory(limit = 100) {
        return this.alertHistory
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Get metric statistics
     */
    getMetricStats(metricName) {
        const buffer = this.metricBuffers.get(metricName);
        if (!buffer || buffer.length === 0)
            return null;
        const sum = buffer.reduce((a, b) => a + b, 0);
        return {
            count: buffer.length,
            avg: sum / buffer.length,
            min: Math.min(...buffer),
            max: Math.max(...buffer),
            last: buffer[buffer.length - 1]
        };
    }
    /**
     * Stop all monitoring
     */
    stop() {
        for (const interval of this.checkIntervals.values()) {
            clearInterval(interval);
        }
        this.checkIntervals.clear();
    }
}
exports.MonitoringService = MonitoringService;
exports.default = MonitoringService;
//# sourceMappingURL=monitoring-service.js.map