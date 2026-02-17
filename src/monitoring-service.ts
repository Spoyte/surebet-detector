/**
 * Monitoring and Alerting Service
 * 
 * Comprehensive monitoring with Prometheus metrics, health checks,
 * and intelligent alerting via multiple channels.
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';

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
  durationSeconds?: number; // Must breach for this long
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
  check: () => Promise<{ healthy: boolean; message?: string; details?: any }>;
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

export class MonitoringService extends EventEmitter {
  private alerts: Map<string, AlertConfig> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private healthStatus: SystemHealth | null = null;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private metricBuffers: Map<string, number[]> = new Map();

  constructor() {
    super();
    this.initializeDefaultAlerts();
  }

  /**
   * Initialize default monitoring alerts
   */
  private initializeDefaultAlerts(): void {
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
  public registerAlert(config: AlertConfig): void {
    this.alerts.set(config.id, config);
    logger.info(`Registered alert: ${config.name}`);
  }

  /**
   * Register a health check
   */
  public registerHealthCheck(check: HealthCheck): void {
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
  private async runHealthCheck(check: HealthCheck): Promise<void> {
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
        status: result.healthy ? 'pass' : 'fail' as 'pass' | 'fail' | 'warn',
        message: result.message,
        responseTime,
        lastCheck: Date.now()
      };

      if (existingIndex >= 0) {
        this.healthStatus.checks[existingIndex] = checkResult;
      } else {
        this.healthStatus.checks.push(checkResult);
      }

      // Update overall status
      const failedChecks = this.healthStatus.checks.filter(c => c.status === 'fail').length;
      const warnChecks = this.healthStatus.checks.filter(c => c.status === 'warn').length;
      
      if (failedChecks > 0) {
        this.healthStatus.status = 'unhealthy';
      } else if (warnChecks > 0) {
        this.healthStatus.status = 'degraded';
      } else {
        this.healthStatus.status = 'healthy';
      }

      this.healthStatus.timestamp = Date.now();

      // Emit event
      this.emit('health:check', checkResult);

    } catch (error) {
      logger.error(`Health check failed: ${check.name}`, error);
    }
  }

  /**
   * Record a metric value
   */
  public recordMetric(name: string, value: number): void {
    // Buffer metrics for condition evaluation
    if (!this.metricBuffers.has(name)) {
      this.metricBuffers.set(name, []);
    }
    
    const buffer = this.metricBuffers.get(name)!;
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
  private evaluateAlertConditions(metricName: string, value: number): void {
    for (const alert of this.alerts.values()) {
      if (!alert.enabled) continue;
      if (alert.condition.metric !== metricName) continue;

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
  private triggerAlert(config: AlertConfig, value: number): void {
    // Check cooldown
    const existingAlert = this.activeAlerts.get(config.id);
    if (existingAlert) {
      const cooldownMs = config.cooldownMinutes * 60 * 1000;
      if (Date.now() - existingAlert.timestamp < cooldownMs) {
        return; // Still in cooldown
      }
    }

    const alert: Alert = {
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

    logger.warn(`Alert triggered: ${config.name}`, { value, threshold: config.condition.threshold });
  }

  /**
   * Generate human-readable alert message
   */
  private generateAlertMessage(config: AlertConfig, value: number): string {
    const operatorMap: Record<string, string> = {
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
  private async sendAlertToChannels(alert: Alert, channels: AlertChannel[]): Promise<void> {
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
      } catch (error) {
        logger.error(`Failed to send alert to ${channel.type}:`, error);
      }
    }
  }

  private async sendTelegramAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would use Telegram Bot API
    logger.info(`[Telegram] ${alert.message}`);
  }

  private async sendSlackAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would use Slack Webhook API
    logger.info(`[Slack] ${alert.message}`);
  }

  private async sendDiscordAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would use Discord Webhook API
    logger.info(`[Discord] ${alert.message}`);
  }

  private async sendEmailAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would use SMTP
    logger.info(`[Email] ${alert.message}`);
  }

  private async sendWebhookAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would POST to webhook URL
    logger.info(`[Webhook] ${alert.message}`);
  }

  private async sendPagerDutyAlert(alert: Alert, config: Record<string, string>): Promise<void> {
    // Implementation would use PagerDuty Events API
    logger.info(`[PagerDuty] ${alert.message}`);
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string): boolean {
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
  public resolveAlert(configId: string): boolean {
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
  public getHealthStatus(): SystemHealth | null {
    return this.healthStatus;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get alert history
   */
  public getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get metric statistics
   */
  public getMetricStats(metricName: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    last: number;
  } | null {
    const buffer = this.metricBuffers.get(metricName);
    if (!buffer || buffer.length === 0) return null;

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
  public stop(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
  }
}

export default MonitoringService;
