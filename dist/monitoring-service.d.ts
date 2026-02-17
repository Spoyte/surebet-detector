/**
 * Monitoring and Alerting Service
 *
 * Comprehensive monitoring with Prometheus metrics, health checks,
 * and intelligent alerting via multiple channels.
 */
import { EventEmitter } from 'events';
export interface AlertConfig {
    id: string;
    name: string;
    condition: AlertCondition;
    severity: 'info' | 'warning' | 'critical';
    channels: AlertChannel[];
    cooldownMinutes: number;
    enabled: boolean;
}
export interface AlertCondition {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    durationSeconds?: number;
}
export interface AlertChannel {
    type: 'telegram' | 'slack' | 'discord' | 'email' | 'webhook' | 'pagerduty';
    config: Record<string, string>;
}
export interface Alert {
    id: string;
    configId: string;
    name: string;
    severity: string;
    message: string;
    metric: string;
    value: number;
    threshold: number;
    timestamp: number;
    acknowledged: boolean;
}
export interface HealthCheck {
    name: string;
    check: () => Promise<{
        healthy: boolean;
        message?: string;
        details?: any;
    }>;
    intervalSeconds: number;
}
export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
        name: string;
        status: 'pass' | 'fail' | 'warn';
        message?: string;
        responseTime: number;
        lastCheck: number;
    }>;
    timestamp: number;
}
export declare class MonitoringService extends EventEmitter {
    private alerts;
    private activeAlerts;
    private alertHistory;
    private healthChecks;
    private healthStatus;
    private checkIntervals;
    private metricBuffers;
    constructor();
    /**
     * Initialize default monitoring alerts
     */
    private initializeDefaultAlerts;
    /**
     * Register a new alert
     */
    registerAlert(config: AlertConfig): void;
    /**
     * Register a health check
     */
    registerHealthCheck(check: HealthCheck): void;
    /**
     * Run a single health check
     */
    private runHealthCheck;
    /**
     * Record a metric value
     */
    recordMetric(name: string, value: number): void;
    /**
     * Evaluate alert conditions for a metric
     */
    private evaluateAlertConditions;
    /**
     * Trigger an alert
     */
    private triggerAlert;
    /**
     * Generate human-readable alert message
     */
    private generateAlertMessage;
    /**
     * Send alert to configured channels
     */
    private sendAlertToChannels;
    private sendTelegramAlert;
    private sendSlackAlert;
    private sendDiscordAlert;
    private sendEmailAlert;
    private sendWebhookAlert;
    private sendPagerDutyAlert;
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): boolean;
    /**
     * Resolve an alert
     */
    resolveAlert(configId: string): boolean;
    /**
     * Get current health status
     */
    getHealthStatus(): SystemHealth | null;
    /**
     * Get active alerts
     */
    getActiveAlerts(): Alert[];
    /**
     * Get alert history
     */
    getAlertHistory(limit?: number): Alert[];
    /**
     * Get metric statistics
     */
    getMetricStats(metricName: string): {
        count: number;
        avg: number;
        min: number;
        max: number;
        last: number;
    } | null;
    /**
     * Stop all monitoring
     */
    stop(): void;
}
export default MonitoringService;
//# sourceMappingURL=monitoring-service.d.ts.map