/**
 * Slippage Protection WebSocket Server
 *
 * Real-time WebSocket interface for slippage protection events.
 * Allows clients to subscribe to slippage alerts and configure
 * protection settings dynamically.
 */
import { SlippageProtector } from './slippage-protector.js';
export declare class SlippageProtectionWebSocket {
    private wss;
    private protector;
    private clients;
    private alertHistory;
    private readonly MAX_HISTORY;
    constructor(protector: SlippageProtector, port?: number);
    private setupWebSocketServer;
    private setupSlippageListeners;
    private handleMessage;
    private handleSubscribe;
    private handleUnsubscribe;
    private sendHistory;
    private handleUpdateConfig;
    private sendConfig;
    private getPublicConfig;
    private broadcastSlippageEvent;
    private broadcastToSubscribers;
    private sendToClient;
    private addToHistory;
    /**
     * Get current connection statistics
     */
    getStats(): {
        connectedClients: number;
        alertHistoryCount: number;
    };
    /**
     * Close the WebSocket server
     */
    close(): Promise<void>;
}
export default SlippageProtectionWebSocket;
//# sourceMappingURL=slippage-protection-websocket.d.ts.map