/**
 * Dynamic Stake Sizing WebSocket Server
 * 
 * Real-time WebSocket interface for dynamic stake calculations,
 * bankroll management, and stake recommendations.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import {
  DynamicStakeSizer,
  StakeSizingResult,
  BankrollState,
  SizedStake
} from './dynamic-stake-sizing.js';
import { ConfidenceScore, Grade } from './opportunity-confidence-scorer.js';
import logger from './utils/logger.js';

interface ClientSubscription {
  ws: WebSocket;
  filters: {
    minGrade?: Grade;
    minConfidence?: number;
    maxStakePercent?: number;
  };
  id: string;
  connectedAt: Date;
  lastPing: Date;
}

interface WsMessage {
  type: string;
  payload?: any;
}

export class DynamicStakeSizingWebSocket extends EventEmitter {
  private wss: WebSocketServer;
  private sizer: DynamicStakeSizer;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private calculationHistory: StakeSizingResult[] = [];
  private readonly MAX_HISTORY = 100;
  private port: number;
  private statsInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(sizer: DynamicStakeSizer, port: number = 8085) {
    super();
    this.sizer = sizer;
    this.port = port;
    this.wss = new WebSocketServer({ port });
    
    this.setupWebSocketServer();
    this.setupSizerListeners();
    this.startStatsBroadcast();
    this.startHeartbeat();
    
    logger.info('DynamicStakeSizingWebSocket started', { port });
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
      logger.info(`Client connected to stake sizing WebSocket`, { clientId, ip: req.socket.remoteAddress });

      // Send initial state
      this.sendToClient(client, {
        type: 'connected',
        payload: {
          message: 'Connected to dynamic stake sizing service',
          clientId,
          bankroll: this.sizer.getBankrollState(),
          recommendations: this.sizer.getStakeRecommendations()
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
        logger.info(`Client disconnected from stake sizing WebSocket`, { clientId });
        this.emit('clientDisconnected', { clientId });
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(ws);
      });

      this.emit('clientConnected', { clientId });
    });

    this.wss.on('error', (error) => {
      logger.error('Dynamic stake sizing WebSocket server error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Setup sizer event listeners
   */
  private setupSizerListeners(): void {
    this.sizer.on('stakeCalculated', (result: StakeSizingResult) => {
      this.addToHistory(result);
      
      this.broadcastToSubscribers({
        type: 'stakeCalculated',
        payload: this.sanitizeResult(result)
      }, (client) => {
        // Filter by grade if set
        if (client.filters.minGrade) {
          const gradeOrder = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
          const resultGrade = result.stakes[0]?.grade || 'F';
          if (gradeOrder[resultGrade] < gradeOrder[client.filters.minGrade]) {
            return false;
          }
        }
        
        // Filter by confidence if set
        if (client.filters.minConfidence !== undefined) {
          const confidence = result.stakes[0]?.confidenceScore || 0;
          if (confidence < client.filters.minConfidence) {
            return false;
          }
        }
        
        // Filter by max stake percent if set
        if (client.filters.maxStakePercent !== undefined) {
          if (result.totalStakePercent > client.filters.maxStakePercent) {
            return false;
          }
        }
        
        return true;
      });
    });

    this.sizer.on('outcomeRecorded', (event: any) => {
      this.broadcastToSubscribers({
        type: 'outcomeRecorded',
        payload: event
      });
    });

    this.sizer.on('bankrollUpdated', (event: any) => {
      this.broadcastToSubscribers({
        type: 'bankrollUpdated',
        payload: event
      });
    });

    this.sizer.on('dailyReset', (event: any) => {
      this.broadcastToSubscribers({
        type: 'dailyReset',
        payload: event
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

      case 'calculateStake':
        this.handleCalculateStake(client, message.payload);
        break;

      case 'recordOutcome':
        this.handleRecordOutcome(client, message.payload);
        break;

      case 'updateBankroll':
        this.handleUpdateBankroll(client, message.payload);
        break;

      case 'getBankroll':
        this.handleGetBankroll(client);
        break;

      case 'getRecommendations':
        this.handleGetRecommendations(client, message.payload);
        break;

      case 'getHistory':
        this.handleGetHistory(client, message.payload?.limit);
        break;

      case 'getStats':
        this.handleGetStats(client);
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
   * Handle stake calculation request
   */
  private handleCalculateStake(client: ClientSubscription, payload: any): void {
    try {
      const {
        opportunityId,
        match,
        confidenceScore,
        odds,
        profitPercent,
        legs,
        sport,
        market
      } = payload;

      if (!opportunityId || !match || !confidenceScore) {
        throw new Error('Missing required fields: opportunityId, match, confidenceScore');
      }

      const result = this.sizer.calculateStake(
        opportunityId,
        match,
        confidenceScore as ConfidenceScore,
        odds || [2.0, 2.0],
        profitPercent || 1.0,
        { legs, sport, market }
      );

      this.sendToClient(client, {
        type: 'stakeCalculated',
        payload: this.sanitizeResult(result)
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: {
          message: 'Failed to calculate stake',
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
      const { opportunityId, stake, profit, result } = payload;

      if (!opportunityId || stake === undefined || result === undefined) {
        throw new Error('Missing required fields: opportunityId, stake, result');
      }

      this.sizer.recordOutcome(opportunityId, stake, profit || 0, result);

      this.sendToClient(client, {
        type: 'outcomeRecorded',
        payload: { opportunityId, stake, profit, result }
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
   * Handle update bankroll request
   */
  private handleUpdateBankroll(client: ClientSubscription, payload: any): void {
    try {
      const { bankroll } = payload;

      if (bankroll === undefined || bankroll <= 0) {
        throw new Error('Invalid bankroll value');
      }

      this.sizer.updateBankroll(bankroll);

      this.sendToClient(client, {
        type: 'bankrollUpdated',
        payload: { bankroll }
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        payload: {
          message: 'Failed to update bankroll',
          error: (error as Error).message
        }
      });
    }
  }

  /**
   * Handle get bankroll request
   */
  private handleGetBankroll(client: ClientSubscription): void {
    const bankroll = this.sizer.getBankrollState();
    
    this.sendToClient(client, {
      type: 'bankroll',
      payload: { bankroll }
    });
  }

  /**
   * Handle get recommendations request
   */
  private handleGetRecommendations(client: ClientSubscription, payload: any): void {
    const { profitPercent } = payload || {};
    const recommendations = this.sizer.getStakeRecommendations(profitPercent);
    
    this.sendToClient(client, {
      type: 'recommendations',
      payload: { recommendations }
    });
  }

  /**
   * Handle get history request
   */
  private handleGetHistory(client: ClientSubscription, limit: number = 50): void {
    const history = this.calculationHistory
      .slice(-Math.min(limit, this.MAX_HISTORY))
      .reverse();
    
    this.sendToClient(client, {
      type: 'history',
      payload: {
        calculations: history.map(h => this.sanitizeResult(h)),
        count: history.length
      }
    });
  }

  /**
   * Handle get stats request
   */
  private handleGetStats(client: ClientSubscription): void {
    const stats = this.sizer.getStats();
    const bankroll = this.sizer.getBankrollState();
    
    this.sendToClient(client, {
      type: 'stats',
      payload: {
        ...stats,
        bankroll
      }
    });
  }

  /**
   * Sanitize result for client consumption
   */
  private sanitizeResult(result: StakeSizingResult): any {
    return {
      opportunityId: result.opportunityId,
      match: result.match,
      totalBankroll: result.totalBankroll,
      totalStake: result.totalStake,
      totalStakePercent: result.totalStakePercent,
      profitPotential: result.profitPotential,
      riskAmount: result.riskAmount,
      riskRewardRatio: result.riskRewardRatio,
      recommendation: result.recommendation,
      reasoning: result.reasoning,
      stakes: result.stakes.map(s => ({
        stake: s.stake,
        stakePercent: s.stakePercent,
        gradeMultiplier: s.gradeMultiplier,
        confidenceScore: s.confidenceScore,
        grade: s.grade,
        kellyFraction: s.kellyFraction,
        expectedValue: s.expectedValue,
        isSafe: s.isSafe
      }))
    };
  }

  /**
   * Add calculation to history
   */
  private addToHistory(result: StakeSizingResult): void {
    this.calculationHistory.push(result);
    
    if (this.calculationHistory.length > this.MAX_HISTORY) {
      this.calculationHistory.shift();
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
    
    for (const client of this.clients.values()) {
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
      for (const client of this.clients.values()) {
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
    return `stake_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current statistics
   */
  public getStats(): {
    connectedClients: number;
    calculationHistoryCount: number;
    bankroll: BankrollState;
    sizerStats: ReturnType<DynamicStakeSizer['getStats']>;
  } {
    return {
      connectedClients: this.clients.size,
      calculationHistoryCount: this.calculationHistory.length,
      bankroll: this.sizer.getBankrollState(),
      sizerStats: this.sizer.getStats()
    };
  }

  /**
   * Close WebSocket server
   */
  public async close(): Promise<void> {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info('DynamicStakeSizingWebSocket closed');
        resolve();
      });
    });
  }
}

export default DynamicStakeSizingWebSocket;
