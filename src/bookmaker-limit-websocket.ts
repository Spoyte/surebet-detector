/**
 * Bookmaker Limit Optimizer WebSocket Server
 * 
 * Real-time WebSocket interface for bookmaker limit updates,
 * stake optimization events, and partial fill protection alerts.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import {
  BookmakerLimitOptimizer,
  OptimizedStakes,
  BookmakerAccount,
  LimitUpdateEvent,
  PartialFillRisk
} from './bookmaker-limit-optimizer.js';
import logger from './utils/logger.js';

interface ClientSubscription {
  ws: WebSocket;
  filters: {
    bookmakers?: string[];
    markets?: string[];
    minProfitPercent?: number;
    showLimitedOnly?: boolean;
  };
  id: string;
  connectedAt: Date;
  lastPing: Date;
}

interface WsMessage {
  type: string;
  payload?: any;
}

export class BookmakerLimitWebSocket extends EventEmitter {
  private wss: WebSocketServer;
  private optimizer: BookmakerLimitOptimizer;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private optimizationHistory: OptimizedStakes[] = [];
  private readonly MAX_HISTORY = 100;
  private port: number;
  private statsInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(optimizer: BookmakerLimitOptimizer, port: number = 8084) {
    super();
    this.optimizer = optimizer;
    this.port = port;
    this.wss = new WebSocketServer({ port });
    
    this.setupWebSocketServer();
    this.setupOptimizerListeners();
    this.startStatsBroadcast();
    this.startHeartbeat();
    
    logger.info('BookmakerLimitWebSocket started', { port });
  }

  /**
   * Setup WebSocket server handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: ClientSubscription = {
        ws,
        filters: {},
        id: clientId,
        connectedAt: new Date(),
        lastPing: new Date()
      };

      this.clients.set(ws, client);
      logger.info(`Client connected to bookmaker limit WebSocket`, { clientId, ip: req.socket.remoteAddress });

      // Send initial state
      this.sendToClient(client, {
        type: 'connected',
        payload: {
          message: 'Connected to bookmaker limit optimizer',
          clientId,
          stats: this.optimizer.getStats(),
          accounts: this.optimizer.limitManager.getAllAccounts().map(a => ({
            bookmakerId: a.bookmakerId,
            bookmakerName: a.bookmakerName,
            balance: a.balance,
            currency: a.currency,
            isActive: a.isActive,
            isLimited: a.dynamicAdjustment.isLimited,
            gubbingRisk: a.gubbingRisk
          }))
        }
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message: WsMessage = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch (error) {
          this.sendToClient(client, {
            type: 'error',
            payload: { message: 'Invalid JSON message' }
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`Client disconnected from bookmaker limit WebSocket`, { clientId });
        this.emit('clientDisconnected', { clientId });
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(ws);
      });

      this.emit('clientConnected', { clientId });
    });

    this.wss.on('error', (error) => {
      logger.error('Bookmaker limit WebSocket server error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Setup optimizer event listeners
   */
  private setupOptimizerListeners(): void {
    // Listen for limit updates
    this.optimizer.on('limitUpdated', (event: LimitUpdateEvent) => {
      this.broadcastToSubscribers({
        type: 'limitUpdated',
        payload: event
      }, (client) => {
        if (!client.filters.bookmakers) return true;
        return client.filters.bookmakers.includes(event.bookmakerId);
      });
    });

    // Listen for dynamic adjustment updates
    this.optimizer.on('dynamicAdjustmentUpdated', (event: { bookmakerId: string; adjustment: any }) => {
      this.broadcastToSubscribers({
        type: 'dynamicAdjustmentUpdated',
        payload: event
      }, (client) => {
        if (!client.filters.bookmakers) return true;
        return client.filters.bookmakers.includes(event.bookmakerId);
      });
    });

    // Listen for stake optimizations
    this.optimizer.on('stakesOptimized', (event: { opportunityId: string; result: OptimizedStakes }) => {
      this.addToHistory(event.result);
      
      this.broadcastToSubscribers({
        type: 'stakesOptimized',
        payload: {
          opportunityId: event.opportunityId,
          result: this.sanitizeOptimizedStakes(event.result)
        }
      }, (client) => {
        // Filter by profit percent if set
        if (client.filters.minProfitPercent !== undefined) {
          return event.result.profitPercent >= client.filters.minProfitPercent;
        }
        return true;
      });
    });

    // Listen for partial fill events
    this.optimizer.on('allLegsFilled', (event: { groupId: string }) => {
      this.broadcastToSubscribers({
        type: 'allLegsFilled',
        payload: event
      });
    });

    this.optimizer.on('cancelPartialFills', (event: { groupId: string; filledLegs: any[]; unfilledLegs: any[] }) => {
      this.broadcastToSubscribers({
        type: 'cancelPartialFills',
        payload: event,
        severity: 'warning'
      });
    });
  }

  /**
   * Handle client messages
   */
  private handleMessage(client: ClientSubscription, message: WsMessage): void {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(client, message.payload);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(client);
        break;

      case 'optimizeStakes':
        this.handleOptimizeStakes(client, message.payload);
        break;

      case 'setLimit':
        this.handleSetLimit(client, message.payload);
        break;

      case 'registerAccount':
        this.handleRegisterAccount(client, message.payload);
        break;

      case 'recordOutcome':
        this.handleRecordOutcome(client, message.payload);
        break;

      case 'getAccounts':
        this.handleGetAccounts(client);
        break;

      case 'getLimits':
        this.handleGetLimits(client, message.payload);
        break;

      case 'getHistory':
        this.handleGetHistory(client, message.payload?.limit);
        break;

      case 'getStats':
        this.handleGetStats(client);
        break;

      case 'getLimitedAccounts':
        this.handleGetLimitedAccounts(client);
        break;

      case 'resetDynamicAdjustment':
        this.handleResetDynamicAdjustment(client, message.payload);
        break;

      case 'ping':
        client.lastPing = new Date();
        this.sendToClient(client, {
          type: 'pong',
          payload: { timestamp: Date.now() }
        });
        break;

      default:
        this.sendToClient(client, {
          type: 'error',
          payload: { message: `Unknown message type: ${message.type}` }
        });
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(client: ClientSubscription, payload: any): void {
    client.filters = {
      ...client.filters,
      ...payload
    };

    this.sendToClient(client, {
      type: 'subscribed',
      payload: {
        filters: client.filters,
        message: 'Subscription updated'
      }
    });

    logger.info(`Client ${client.id} updated subscriptions`, { filters: client.filters });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: ClientSubscription): void {
    client.filters = {};
    
    this.sendToClient(client, {
      type: 'unsubscribed',
      payload: { message: 'Unsubscribed from all filters' }
    });
  }

  /**
   * Handle stake optimization request
   */
  private handleOptimizeStakes(client: ClientSubscription, payload: any): void {
    try {
      const { opportunityId, legs, totalBankroll, options } = payload;
      
      if (!opportunityId || !legs || !totalBankroll) {
        throw new Error('Missing required fields: opportunityId, legs, totalBankroll');
      }

      const result = this.optimizer.optimizeStakes(opportunityId, legs, totalBankroll, options);

      this.sendToClient(client, {
        type: 'optimizeResult',
        payload: {
          opportunityId,
          result: this.sanitizeOptimizedStakes(result)
        }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: { 
          message: 'Failed to optimize stakes',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Handle set limit request
   */
  private handleSetLimit(client: ClientSubscription, payload: any): void {
    try {
      const { bookmakerId, market, minStake, maxStake, source } = payload;
      
      if (!bookmakerId || minStake === undefined || maxStake === undefined) {
        throw new Error('Missing required fields: bookmakerId, minStake, maxStake');
      }

      const limit = this.optimizer.setLimit(
        bookmakerId,
        market || 'default',
        minStake,
        maxStake,
        source || 'manual'
      );

      this.sendToClient(client, {
        type: 'limitSet',
        payload: { limit }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: { 
          message: 'Failed to set limit',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Handle register account request
   */
  private handleRegisterAccount(client: ClientSubscription, payload: any): void {
    try {
      const { bookmakerId, bookmakerName, balance, currency } = payload;
      
      if (!bookmakerId || balance === undefined) {
        throw new Error('Missing required fields: bookmakerId, balance');
      }

      const account = this.optimizer.registerAccount(
        bookmakerId,
        bookmakerName || bookmakerId,
        balance,
        currency || 'EUR'
      );

      this.sendToClient(client, {
        type: 'accountRegistered',
        payload: {
          account: {
            bookmakerId: account.bookmakerId,
            bookmakerName: account.bookmakerName,
            balance: account.balance,
            currency: account.currency,
            isActive: account.isActive
          }
        }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: { 
          message: 'Failed to register account',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Handle record outcome request
   */
  private handleRecordOutcome(client: ClientSubscription, payload: any): void {
    try {
      const { bookmakerId, profit, stake } = payload;
      
      if (!bookmakerId || profit === undefined || stake === undefined) {
        throw new Error('Missing required fields: bookmakerId, profit, stake');
      }

      this.optimizer.recordBetOutcome(bookmakerId, profit, stake);

      this.sendToClient(client, {
        type: 'outcomeRecorded',
        payload: { bookmakerId, profit, stake }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: { 
          message: 'Failed to record outcome',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Handle get accounts request
   */
  private handleGetAccounts(client: ClientSubscription): void {
    const accounts = this.optimizer.limitManager.getAllAccounts();
    
    this.sendToClient(client, {
      type: 'accounts',
      payload: {
        accounts: accounts.map(a => ({
          bookmakerId: a.bookmakerId,
          bookmakerName: a.bookmakerName,
          balance: a.balance,
          currency: a.currency,
          isActive: a.isActive,
          isLimited: a.dynamicAdjustment.isLimited,
          adjustmentFactor: a.dynamicAdjustment.adjustmentFactor,
          gubbingRisk: a.gubbingRisk,
          limitCount: a.limits.size
        })),
        count: accounts.length
      }
    });
  }

  /**
   * Handle get limits request
   */
  private handleGetLimits(client: ClientSubscription, payload: any): void {
    const { bookmakerId, market } = payload || {};
    
    if (bookmakerId) {
      const limit = this.optimizer.limitManager.getEffectiveLimit(bookmakerId, market || 'default');
      this.sendToClient(client, {
        type: 'limits',
        payload: { limit }
      });
    } else {
      // Get all limits
      const accounts = this.optimizer.limitManager.getAllAccounts();
      const allLimits: any[] = [];
      
      for (const account of accounts) {
        for (const [marketKey, limit] of Array.from(account.limits.entries())) {
          allLimits.push({
            ...limit,
            bookmakerId: account.bookmakerId,
            market: marketKey
          });
        }
      }
      
      this.sendToClient(client, {
        type: 'limits',
        payload: { limits: allLimits, count: allLimits.length }
      });
    }
  }

  /**
   * Handle get history request
   */
  private handleGetHistory(client: ClientSubscription, limit: number = 50): void {
    const history = this.optimizationHistory
      .slice(-Math.min(limit, this.MAX_HISTORY))
      .reverse();
    
    this.sendToClient(client, {
      type: 'history',
      payload: { 
        optimizations: history.map(h => this.sanitizeOptimizedStakes(h)),
        count: history.length
      }
    });
  }

  /**
   * Handle get stats request
   */
  private handleGetStats(client: ClientSubscription): void {
    const stats = this.optimizer.getStats();
    
    this.sendToClient(client, {
      type: 'stats',
      payload: stats
    });
  }

  /**
   * Handle get limited accounts request
   */
  private handleGetLimitedAccounts(client: ClientSubscription): void {
    const limitedAccounts = this.optimizer.limitManager.getLimitedAccounts();
    
    this.sendToClient(client, {
      type: 'limitedAccounts',
      payload: {
        accounts: limitedAccounts.map(a => ({
          bookmakerId: a.bookmakerId,
          bookmakerName: a.bookmakerName,
          adjustmentFactor: a.dynamicAdjustment.adjustmentFactor,
          consecutiveWins: a.dynamicAdjustment.consecutiveWins,
          totalProfit: a.dynamicAdjustment.totalProfit,
          gubbingRisk: a.gubbingRisk
        })),
        count: limitedAccounts.length
      }
    });
  }

  /**
   * Handle reset dynamic adjustment request
   */
  private handleResetDynamicAdjustment(client: ClientSubscription, payload: any): void {
    try {
      const { bookmakerId } = payload;
      
      if (!bookmakerId) {
        throw new Error('Missing required field: bookmakerId');
      }

      this.optimizer.limitManager.resetDynamicAdjustment(bookmakerId);

      this.sendToClient(client, {
        type: 'dynamicAdjustmentReset',
        payload: { bookmakerId }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: { 
          message: 'Failed to reset dynamic adjustment',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Sanitize optimized stakes for client consumption
   */
  private sanitizeOptimizedStakes(stakes: OptimizedStakes): any {
    return {
      opportunityId: stakes.opportunityId,
      totalStake: stakes.totalStake,
      expectedProfit: stakes.expectedProfit,
      profitPercent: stakes.profitPercent,
      isOptimal: stakes.isOptimal,
      constraintsApplied: stakes.constraintsApplied,
      partialFillRisk: stakes.partialFillRisk,
      fallbackStrategy: stakes.fallbackStrategy,
      legs: stakes.legs.map(leg => ({
        bookmakerId: leg.bookmakerId,
        bookmakerName: leg.bookmakerName,
        market: leg.market,
        selection: leg.selection,
        odds: leg.odds,
        idealStake: leg.idealStake,
        actualStake: leg.actualStake,
        isConstrained: leg.isConstrained,
        constraintReason: leg.constraintReason,
        fillProbability: leg.fillProbability
      })),
      alternativeSuggestions: stakes.alternativeSuggestions.map(alt => ({
        combinationId: alt.combinationId,
        totalStake: alt.totalStake,
        expectedProfit: alt.expectedProfit,
        profitPercent: alt.profitPercent,
        feasibility: alt.feasibility,
        reason: alt.reason
      }))
    };
  }

  /**
   * Add optimization to history
   */
  private addToHistory(stakes: OptimizedStakes): void {
    this.optimizationHistory.push(stakes);
    
    if (this.optimizationHistory.length > this.MAX_HISTORY) {
      this.optimizationHistory.shift();
    }
  }

  /**
   * Broadcast to subscribed clients
   */
  private broadcastToSubscribers(
    message: any,
    filter?: (client: ClientSubscription) => boolean
  ): void {
    const messageStr = JSON.stringify(message);
    
    for (const client of Array.from(this.clients.values())) {
      if (filter && !filter(client)) continue;
      
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: ClientSubscription, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start periodic stats broadcast
   */
  private startStatsBroadcast(): void {
    this.statsInterval = setInterval(() => {
      const stats = this.getStats();
      this.broadcastToSubscribers({
        type: 'stats',
        payload: stats
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Start heartbeat for connection health
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const client of Array.from(this.clients.values())) {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
        if (timeSinceLastPing > 120000) { // 2 minutes
          logger.warn(`Client ${client.id} timed out, closing connection`);
          client.ws.close();
          this.clients.delete(client.ws);
        } else {
          this.sendToClient(client, { type: 'ping' });
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `limit_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current statistics
   */
  public getStats(): {
    connectedClients: number;
    optimizationHistoryCount: number;
    optimizerStats: ReturnType<BookmakerLimitOptimizer['getStats']>;
  } {
    return {
      connectedClients: this.clients.size,
      optimizationHistoryCount: this.optimizationHistory.length,
      optimizerStats: this.optimizer.getStats()
    };
  }

  /**
   * Close WebSocket server
   */
  public async close(): Promise<void> {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Close all client connections
    for (const client of Array.from(this.clients.values())) {
      client.ws.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info('BookmakerLimitWebSocket closed');
        resolve();
      });
    });
  }
}

export default BookmakerLimitWebSocket;
