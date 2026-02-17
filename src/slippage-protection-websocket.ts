/**
 * Slippage Protection WebSocket Server
 * 
 * Real-time WebSocket interface for slippage protection events.
 * Allows clients to subscribe to slippage alerts and configure
 * protection settings dynamically.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { SlippageProtector, SlippageConfig, SlippageEvent } from './slippage-protector.js';
import { logger } from './logger.js';

interface ClientSubscription {
  ws: WebSocket;
  minSlippagePercent?: number;
  slippageTypes: ('none' | 'favorable' | 'acceptable' | 'critical')[];
  bookmakers?: string[];
}

interface WsMessage {
  type: string;
  payload?: any;
}

export class SlippageProtectionWebSocket {
  private wss: WebSocketServer;
  private protector: SlippageProtector;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private alertHistory: SlippageEvent[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(protector: SlippageProtector, port: number = 8081) {
    this.protector = protector;
    this.wss = new WebSocketServer({ port });
    
    this.setupWebSocketServer();
    this.setupSlippageListeners();
    
    logger.info('SlippageProtectionWebSocket started', { port });
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Client connected to slippage protection WebSocket');
      
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

      ws.on('message', (data: Buffer) => {
        try {
          const message: WsMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          this.sendToClient(ws, {
            type: 'error',
            payload: { message: 'Invalid JSON message' }
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('Client disconnected from slippage protection WebSocket');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error });
        this.clients.delete(ws);
      });
    });
  }

  private setupSlippageListeners(): void {
    // Listen for all slippage checks
    this.protector.on('slippageCheck', (event: SlippageEvent) => {
      this.addToHistory(event);
      this.broadcastSlippageEvent(event);
    });

    // Listen for successful bet placements
    this.protector.on('betPlaced', (event: SlippageEvent & { attempts: number }) => {
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
    this.protector.on('betAborted', (event: SlippageEvent & { attempts: number }) => {
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

  private handleMessage(ws: WebSocket, message: WsMessage): void {
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

  private handleSubscribe(ws: WebSocket, payload: any): void {
    const subscription: ClientSubscription = {
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
    
    logger.info('Client subscribed to slippage alerts', { subscription });
  }

  private handleUnsubscribe(ws: WebSocket): void {
    this.clients.delete(ws);
    this.sendToClient(ws, {
      type: 'unsubscribed',
      payload: { message: 'Unsubscribed from slippage alerts' }
    });
  }

  private sendHistory(ws: WebSocket, limit: number = 50): void {
    const history = this.alertHistory
      .slice(-Math.min(limit, this.MAX_HISTORY))
      .reverse();
    
    this.sendToClient(ws, {
      type: 'history',
      payload: { alerts: history }
    });
  }

  private handleUpdateConfig(ws: WebSocket, payload: Partial<SlippageConfig>): void {
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
      
      logger.info('Slippage protection config updated via WebSocket', { payload });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        payload: { message: 'Failed to update config', error: String(error) }
      });
    }
  }

  private sendConfig(ws: WebSocket): void {
    this.sendToClient(ws, {
      type: 'config',
      payload: { config: this.getPublicConfig() }
    });
  }

  private getPublicConfig(): Partial<SlippageConfig> {
    // Return config without sensitive values
    return {
      maxSlippagePercent: 0.5,
      criticalSlippagePercent: 2.0,
      autoRetry: true,
      maxRetries: 3,
      detectPriceImprovement: true
    };
  }

  private broadcastSlippageEvent(event: SlippageEvent): void {
    const message = {
      type: 'slippageAlert',
      payload: {
        request: event.request,
        result: event.result,
        timestamp: event.timestamp
      }
    };

    for (const [ws, subscription] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;

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

  private broadcastToSubscribers(message: any): void {
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, message);
      }
    }
  }

  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private addToHistory(event: SlippageEvent): void {
    this.alertHistory.push(event);
    
    // Trim history if it exceeds max
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory = this.alertHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * Get current connection statistics
   */
  getStats(): {
    connectedClients: number;
    alertHistoryCount: number;
  } {
    return {
      connectedClients: this.clients.size,
      alertHistoryCount: this.alertHistory.length
    };
  }

  /**
   * Close the WebSocket server
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info('SlippageProtectionWebSocket closed');
        resolve();
      });
    });
  }
}

export default SlippageProtectionWebSocket;
