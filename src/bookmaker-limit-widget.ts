/**
 * Bookmaker Limit Dashboard Widget
 * 
 * Provides data formatting and real-time updates for the limit visualization widget.
 * This module prepares data for the frontend dashboard component.
 */

import { EventEmitter } from 'events';
import {
  BookmakerLimitOptimizer,
  BookmakerAccount,
  BookmakerLimit,
  OptimizedStakes,
  DynamicLimitAdjustment
} from './bookmaker-limit-optimizer.js';
import logger from './utils/logger.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LimitWidgetData {
  summary: LimitSummary;
  accounts: AccountWidgetData[];
  recentOptimizations: OptimizationWidgetData[];
  alerts: LimitAlert[];
  charts: ChartData;
  timestamp: number;
}

export interface LimitSummary {
  totalAccounts: number;
  activeAccounts: number;
  limitedAccounts: number;
  totalBalance: number;
  baseCurrency: string;
  totalLimitsTracked: number;
  averageGubbingRisk: number;
  atRiskAccounts: number;
}

export interface AccountWidgetData {
  bookmakerId: string;
  bookmakerName: string;
  balance: number;
  currency: string;
  isActive: boolean;
  isLimited: boolean;
  limits: LimitWidgetItem[];
  dynamicAdjustment: AdjustmentWidgetData;
  gubbingRisk: number;
  riskLevel: 'low' | 'medium' | 'high';
  recentChanges: LimitChange[];
}

export interface LimitWidgetItem {
  market: string;
  minStake: number;
  maxStake: number;
  effectiveMax: number;
  currency: string;
  source: string;
  confidence: number;
  lastUpdated: number;
}

export interface AdjustmentWidgetData {
  adjustmentFactor: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalProfit: number;
  isLimited: boolean;
  lastAdjustmentTime: number;
}

export interface LimitChange {
  timestamp: number;
  type: 'increase' | 'decrease' | 'reset';
  market: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

export interface OptimizationWidgetData {
  opportunityId: string;
  totalStake: number;
  expectedProfit: number;
  profitPercent: number;
  isOptimal: boolean;
  constrainedLegs: number;
  bookmakers: string[];
  timestamp: number;
}

export interface LimitAlert {
  id: string;
  type: 'limit_reduced' | 'gubbing_risk' | 'partial_fill' | 'opportunity_blocked';
  severity: 'info' | 'warning' | 'critical';
  bookmakerId?: string;
  bookmakerName?: string;
  message: string;
  details: any;
  timestamp: number;
  acknowledged: boolean;
}

export interface ChartData {
  limitDistribution: LimitDistributionPoint[];
  gubbingRiskTrend: TrendPoint[];
  optimizationSuccessRate: TrendPoint[];
  profitByBookmaker: ProfitPoint[];
}

export interface LimitDistributionPoint {
  range: string;
  count: number;
  totalCapacity: number;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface ProfitPoint {
  bookmakerId: string;
  bookmakerName: string;
  totalProfit: number;
  betCount: number;
  avgStake: number;
}

export interface WidgetConfig {
  refreshIntervalMs: number;
  maxHistoryItems: number;
  alertRetentionHours: number;
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
  };
}

// ============================================================================
// DASHBOARD WIDGET CLASS
// ============================================================================

export class BookmakerLimitWidget extends EventEmitter {
  private optimizer: BookmakerLimitOptimizer;
  private config: WidgetConfig;
  private alerts: LimitAlert[] = [];
  private alertIdCounter = 0;
  private refreshInterval?: NodeJS.Timeout;

  constructor(
    optimizer: BookmakerLimitOptimizer,
    config: Partial<WidgetConfig> = {}
  ) {
    super();
    this.optimizer = optimizer;
    this.config = {
      refreshIntervalMs: 5000,
      maxHistoryItems: 100,
      alertRetentionHours: 24,
      riskThresholds: {
        low: 0.3,
        medium: 0.6,
        high: 0.8
      },
      ...config
    };

    this.setupEventListeners();
    this.startRefreshInterval();
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // Listen for limit updates
    this.optimizer.on('limitUpdated', (event) => {
      const changeType = event.newLimit.maxStake > event.oldLimit.maxStake ? 'increase' : 'decrease';
      
      this.addAlert({
        type: changeType === 'decrease' ? 'limit_reduced' : 'limit_reduced',
        severity: changeType === 'decrease' ? 'warning' : 'info',
        bookmakerId: event.bookmakerId,
        bookmakerName: event.newLimit.bookmakerName,
        message: `${event.newLimit.bookmakerName} ${event.market} limit ${changeType}d to ${event.newLimit.maxStake}`,
        details: {
          oldLimit: event.oldLimit.maxStake,
          newLimit: event.newLimit.maxStake,
          market: event.market
        },
        timestamp: Date.now(),
        acknowledged: false
      });

      this.emit('dataUpdated', this.getWidgetData());
    });

    // Listen for dynamic adjustments
    this.optimizer.on('dynamicAdjustmentUpdated', (event) => {
      if (event.adjustment.isLimited) {
        this.addAlert({
          type: 'limit_reduced',
          severity: 'warning',
          bookmakerId: event.bookmakerId,
          message: `Dynamic limit reduction applied to ${event.bookmakerId}`,
          details: event.adjustment,
          timestamp: Date.now(),
          acknowledged: false
        });
      }

      this.emit('dataUpdated', this.getWidgetData());
    });

    // Listen for stake optimizations
    this.optimizer.on('stakesOptimized', (event) => {
      if (!event.result.isOptimal) {
        const constrainedBookmakers = event.result.legs
          .filter(l => l.isConstrained)
          .map(l => l.bookmakerName);

        if (constrainedBookmakers.length > 0) {
          this.addAlert({
            type: 'opportunity_blocked',
            severity: 'info',
            message: `Opportunity ${event.opportunityId} constrained by limits`,
            details: {
              constrainedBookmakers,
              fallbackStrategy: event.result.fallbackStrategy
            },
            timestamp: Date.now(),
            acknowledged: false
          });
        }
      }

      this.emit('dataUpdated', this.getWidgetData());
    });

    // Listen for partial fill events
    this.optimizer.on('cancelPartialFills', (event) => {
      this.addAlert({
        type: 'partial_fill',
        severity: 'critical',
        message: `Partial fill detected for group ${event.groupId}`,
        details: event,
        timestamp: Date.now(),
        acknowledged: false
      });

      this.emit('dataUpdated', this.getWidgetData());
    });
  }

  /**
   * Start refresh interval for periodic updates
   */
  private startRefreshInterval(): void {
    this.refreshInterval = setInterval(() => {
      this.cleanupOldAlerts();
      this.emit('dataUpdated', this.getWidgetData());
    }, this.config.refreshIntervalMs);
  }

  /**
   * Get complete widget data
   */
  public getWidgetData(): LimitWidgetData {
    const accounts = this.optimizer.limitManager.getAllAccounts();
    
    return {
      summary: this.buildSummary(accounts),
      accounts: this.buildAccountData(accounts),
      recentOptimizations: this.getRecentOptimizations(),
      alerts: this.getActiveAlerts(),
      charts: this.buildChartData(accounts),
      timestamp: Date.now()
    };
  }

  /**
   * Build summary statistics
   */
  private buildSummary(accounts: BookmakerAccount[]): LimitSummary {
    const activeAccounts = accounts.filter(a => a.isActive);
    const limitedAccounts = accounts.filter(a => a.dynamicAdjustment.isLimited);
    const totalBalance = activeAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalLimits = accounts.reduce((sum, a) => sum + a.limits.size, 0);
    const avgGubbingRisk = accounts.length > 0 
      ? accounts.reduce((sum, a) => sum + a.gubbingRisk, 0) / accounts.length 
      : 0;
    const atRiskAccounts = accounts.filter(a => a.gubbingRisk >= this.config.riskThresholds.medium).length;

    return {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      limitedAccounts: limitedAccounts.length,
      totalBalance,
      baseCurrency: 'EUR',
      totalLimitsTracked: totalLimits,
      averageGubbingRisk: Math.round(avgGubbingRisk * 100) / 100,
      atRiskAccounts
    };
  }

  /**
   * Build account widget data
   */
  private buildAccountData(accounts: BookmakerAccount[]): AccountWidgetData[] {
    return accounts.map(account => {
      const riskLevel = this.calculateRiskLevel(account.gubbingRisk);
      
      return {
        bookmakerId: account.bookmakerId,
        bookmakerName: account.bookmakerName,
        balance: account.balance,
        currency: account.currency,
        isActive: account.isActive,
        isLimited: account.dynamicAdjustment.isLimited,
        limits: this.buildLimitItems(account),
        dynamicAdjustment: {
          adjustmentFactor: account.dynamicAdjustment.adjustmentFactor,
          consecutiveWins: account.dynamicAdjustment.consecutiveWins,
          consecutiveLosses: account.dynamicAdjustment.consecutiveLosses,
          totalProfit: account.dynamicAdjustment.totalProfit,
          isLimited: account.dynamicAdjustment.isLimited,
          lastAdjustmentTime: account.dynamicAdjustment.lastAdjustmentTime
        },
        gubbingRisk: account.gubbingRisk,
        riskLevel,
        recentChanges: this.getRecentChanges(account)
      };
    });
  }

  /**
   * Build limit items for an account
   */
  private buildLimitItems(account: BookmakerAccount): LimitWidgetItem[] {
    const items: LimitWidgetItem[] = [];
    
    for (const [market, limit] of Array.from(account.limits.entries())) {
      const adjustedLimit = this.optimizer.limitManager.getAdjustedLimit(account.bookmakerId, market);
      
      items.push({
        market,
        minStake: limit.minStake,
        maxStake: limit.maxStake,
        effectiveMax: adjustedLimit.maxStake,
        currency: limit.currency,
        source: limit.source,
        confidence: limit.confidence,
        lastUpdated: limit.lastUpdated
      });
    }

    return items.sort((a, b) => a.market.localeCompare(b.market));
  }

  /**
   * Calculate risk level based on gubbing risk score
   */
  private calculateRiskLevel(gubbingRisk: number): 'low' | 'medium' | 'high' {
    if (gubbingRisk >= this.config.riskThresholds.high) return 'high';
    if (gubbingRisk >= this.config.riskThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Get recent limit changes for an account
   */
  private getRecentChanges(account: BookmakerAccount): LimitChange[] {
    const history = this.optimizer.limitManager.getLimitHistory(account.bookmakerId);
    
    return history.slice(-5).map(event => ({
      timestamp: event.timestamp,
      type: event.newLimit.maxStake > event.oldLimit.maxStake ? 'increase' : 'decrease',
      market: event.market,
      oldValue: event.oldLimit.maxStake,
      newValue: event.newLimit.maxStake,
      reason: event.reason
    }));
  }

  /**
   * Get recent optimizations from cache
   */
  private getRecentOptimizations(): OptimizationWidgetData[] {
    // This would come from the optimization engine's history
    // For now, return empty array
    return [];
  }

  /**
   * Get active (unacknowledged) alerts
   */
  private getActiveAlerts(): LimitAlert[] {
    return this.alerts
      .filter(a => !a.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }

  /**
   * Add a new alert
   */
  private addAlert(alert: Omit<LimitAlert, 'id'>): void {
    const newAlert: LimitAlert = {
      ...alert,
      id: `alert_${++this.alertIdCounter}_${Date.now()}`
    };

    this.alerts.push(newAlert);
    
    // Trim old alerts
    if (this.alerts.length > 200) {
      this.alerts = this.alerts.slice(-200);
    }

    this.emit('newAlert', newAlert);
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('dataUpdated', this.getWidgetData());
      return true;
    }
    return false;
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const cutoff = Date.now() - (this.config.alertRetentionHours * 60 * 60 * 1000);
    this.alerts = this.alerts.filter(a => a.timestamp > cutoff || !a.acknowledged);
  }

  /**
   * Build chart data
   */
  private buildChartData(accounts: BookmakerAccount[]): ChartData {
    return {
      limitDistribution: this.buildLimitDistribution(accounts),
      gubbingRiskTrend: this.buildGubbingRiskTrend(accounts),
      optimizationSuccessRate: [], // Would come from historical data
      profitByBookmaker: this.buildProfitByBookmaker(accounts)
    };
  }

  /**
   * Build limit distribution chart data
   */
  private buildLimitDistribution(accounts: BookmakerAccount[]): LimitDistributionPoint[] {
    const ranges = [
      { min: 0, max: 500, label: '0-500' },
      { min: 500, max: 1000, label: '500-1K' },
      { min: 1000, max: 2500, label: '1K-2.5K' },
      { min: 2500, max: 5000, label: '2.5K-5K' },
      { min: 5000, max: 10000, label: '5K-10K' },
      { min: 10000, max: Infinity, label: '10K+' }
    ];

    const distribution = ranges.map(range => ({
      range: range.label,
      count: 0,
      totalCapacity: 0
    }));

    for (const account of accounts) {
      for (const limit of Array.from(account.limits.values())) {
        const rangeIndex = ranges.findIndex(r => 
          limit.maxStake >= r.min && limit.maxStake < r.max
        );
        if (rangeIndex >= 0) {
          distribution[rangeIndex].count++;
          distribution[rangeIndex].totalCapacity += limit.maxStake;
        }
      }
    }

    return distribution;
  }

  /**
   * Build gubbing risk trend
   */
  private buildGubbingRiskTrend(accounts: BookmakerAccount[]): TrendPoint[] {
    // In a real implementation, this would use historical data
    // For now, return current risk levels
    return accounts.map(account => ({
      timestamp: Date.now(),
      value: account.gubbingRisk
    }));
  }

  /**
   * Build profit by bookmaker data
   */
  private buildProfitByBookmaker(accounts: BookmakerAccount[]): ProfitPoint[] {
    return accounts.map(account => ({
      bookmakerId: account.bookmakerId,
      bookmakerName: account.bookmakerName,
      totalProfit: account.dynamicAdjustment.totalProfit,
      betCount: account.dynamicAdjustment.consecutiveWins + account.dynamicAdjustment.consecutiveLosses,
      avgStake: 0 // Would need historical bet data
    }));
  }

  /**
   * Get widget configuration
   */
  public getConfig(): WidgetConfig {
    return { ...this.config };
  }

  /**
   * Update widget configuration
   */
  public updateConfig(updates: Partial<WidgetConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart refresh interval if changed
    if (updates.refreshIntervalMs) {
      if (this.refreshInterval) clearInterval(this.refreshInterval);
      this.startRefreshInterval();
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Get all alerts (including acknowledged)
   */
  public getAllAlerts(): LimitAlert[] {
    return [...this.alerts].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear all alerts
   */
  public clearAlerts(): void {
    this.alerts = [];
    this.emit('dataUpdated', this.getWidgetData());
  }

  /**
   * Stop the widget
   */
  public stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }
}

export default BookmakerLimitWidget;
