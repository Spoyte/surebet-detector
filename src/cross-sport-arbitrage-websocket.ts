/**
 * Cross-Sport Arbitrage WebSocket
 * 
 * Real-time WebSocket server for cross-sport arbitrage opportunities.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { CrossSportArbitrageService, CrossSportAlert } from './cross-sport-arbitrage-service.js';
import { CrossSportOpportunity } from './cross-sport-arbitrage-detector.js';
import logger from './utils/logger.js';

interface ClientSubscription {
  ws: WebSocket;
  filters: {
    sportPairs?: string[];
    minProfit?: number;
    minConfidence?: number;
    minCorrelationStrength?: number;
  };
}

export class CrossSportArbitrageWebSocket {
  private wss: WebSocketServer;
  private service: CrossSportArbitrageService;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private port: number;

  constructor(service: CrossSportArbitrageService, port: number = 8083) {
    this.service = service;
    this.port = port;
    this.wss = new WebSocketServer({ port });

    this.setupWebSocketServer();
    this.setupServiceListeners();
  }

  /**
   * Setup WebSocket server handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      logger.info(`Cross-sport WebSocket client connected: ${clientId}`);

      // Initialize client with no filters
      this.clients.set(ws, { ws, filters: {} });

      // Send initial data
      this.sendInitialData(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          logger.error('Invalid message from client:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        logger.info(`Cross-sport WebSocket client disconnected: ${clientId}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(ws);
      });
    });

    logger.info(`Cross-sport arbitrage WebSocket server started on port ${this.port}`);
  }

  /**
   * Setup service event listeners
   */
  private setupServiceListeners(): void {
    this.service.on('opportunity:new', (alert: CrossSportAlert) => {
      this.broadcastOpportunity(alert.opportunity, 'new');
    });

    this.service.on('opportunity:updated', (alert: CrossSportAlert) => {
      this.broadcastOpportunity(alert.opportunity, 'updated');
    });

    this.service.on('opportunity:expiring', (alert: CrossSportAlert) => {
      this.broadcastOpportunity(alert.opportunity, 'expiring');
    });
  }

  /**
   * Handle client messages
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(ws, message.filters);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws);
        break;
      case 'get_opportunities':
        this.handleGetOpportunities(ws, message.filters);
        break;
      case 'get_mappings':
        this.handleGetMappings(ws);
        break;
      case 'get_stats':
        this.handleGetStats(ws);
        break;
      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(ws: WebSocket, filters: any): void {
    const client = this.clients.get(ws);
    if (client) {
      client.filters = filters || {};
      this.clients.set(ws, client);
      
      this.send(ws, {
        type: 'subscribed',
        filters: client.filters,
        timestamp: Date.now()
      });

      logger.debug('Client subscribed with filters', { filters });
    }
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      client.filters = {};
      this.clients.set(ws, client);
      
      this.send(ws, {
        type: 'unsubscribed',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle get opportunities request
   */
  private handleGetOpportunities(ws: WebSocket, filters: any): void {
    const opportunities = this.service.getCachedOpportunities(filters);
    
    this.send(ws, {
      type: 'opportunities_list',
      data: opportunities,
      count: opportunities.length,
      timestamp: Date.now()
    });
  }

  /**
   * Handle get mappings request
   */
  private handleGetMappings(ws: WebSocket): void {
    const mappings = this.service.getMappings();
    
    this.send(ws, {
      type: 'mappings_list',
      data: mappings,
      count: mappings.length,
      timestamp: Date.now()
    });
  }

  /**
   * Handle get stats request
   */
  private handleGetStats(ws: WebSocket): void {
    const stats = this.service.getStats();
    
    this.send(ws, {
      type: 'stats',
      data: stats,
      timestamp: Date.now()
    });
  }

  /**
   * Send initial data to newly connected client
   */
  private sendInitialData(ws: WebSocket): void {
    const opportunities = this.service.getCachedOpportunities();
    const stats = this.service.getStats();
    
    this.send(ws, {
      type: 'initial_data',
      data: {
        opportunities,
        stats,
        serverTime: Date.now()
      }
    });
  }

  /**
   * Broadcast opportunity to subscribed clients
   */
  private broadcastOpportunity(
    opportunity: CrossSportOpportunity,
    alertType: 'new' | 'updated' | 'expiring'
  ): void {
    const message = {
      type: 'opportunity_alert',
      alertType,
      data: opportunity,
      timestamp: Date.now()
    };

    for (const [ws, client] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        // Check if client is interested in this opportunity
        if (this.shouldSendToClient(client, opportunity)) {
          this.send(ws, message);
        }
      }
    }
  }

  /**
   * Check if opportunity matches client filters
   */
  private shouldSendToClient(
    client: ClientSubscription,
    opportunity: CrossSportOpportunity
  ): boolean {
    const { filters } = client;

    // Check sport pairs filter
    if (filters.sportPairs && filters.sportPairs.length > 0) {
      const pair = `${opportunity.sportA}/${opportunity.sportB}`;
      if (!filters.sportPairs.includes(pair)) {
        return false;
      }
    }

    // Check min profit filter
    if (filters.minProfit !== undefined) {
      if (opportunity.profitPercent < filters.minProfit) {
        return false;
      }
    }

    // Check min confidence filter
    if (filters.minConfidence !== undefined) {
      if (opportunity.confidence < filters.minConfidence) {
        return false;
      }
    }

    // Check min correlation strength filter
    if (filters.minCorrelationStrength !== undefined) {
      if (opportunity.correlationStrength < filters.minCorrelationStrength) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send message to client
   */
  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      error,
      timestamp: Date.now()
    });
  }

  /**
   * Close WebSocket server
   */
  public async close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      for (const [ws] of this.clients.entries()) {
        ws.close();
      }
      this.clients.clear();

      // Close server
      this.wss.close(() => {
        logger.info('Cross-sport arbitrage WebSocket server closed');
        resolve();
      });
    });
  }

  /**
   * Get connected client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }
}

export default CrossSportArbitrageWebSocket;
