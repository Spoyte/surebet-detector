/**
 * Opportunity Confidence Scoring WebSocket Server
 *
 * Real-time WebSocket server for streaming ML-based confidence scores
 * to connected dashboard clients.
 */
import { EventEmitter } from 'events';
import { OpportunityConfidenceScorer, OpportunityFeatures, ConfidenceScore } from './opportunity-confidence-scorer.js';
interface ScoredOpportunity {
    id: string;
    match: string;
    sport: string;
    league: string;
    market: string;
    bookmakers: string[];
    features: OpportunityFeatures;
    score: ConfidenceScore;
    timestamp: number;
}
export declare class ConfidenceScoringWebSocket extends EventEmitter {
    private wss;
    private clients;
    private scorer;
    private scoredOpportunities;
    private readonly maxHistorySize;
    private statsInterval?;
    private heartbeatInterval?;
    constructor(scorer: OpportunityConfidenceScorer, port?: number);
    private setupWebSocketServer;
    private handleMessage;
    private handleSubscribe;
    private handleUnsubscribe;
    private handleScoreRequest;
    private handleBatchScoreRequest;
    private handleGetModel;
    private handleGetBookmakerRanking;
    private handleGetSportInsights;
    private matchesSubscription;
    /**
     * Broadcast a scored opportunity to all subscribed clients
     */
    broadcastOpportunity(opportunity: ScoredOpportunity): void;
    /**
     * Score and broadcast an opportunity
     */
    scoreAndBroadcast(id: string, match: string, sport: string, league: string, market: string, bookmakers: string[], features: OpportunityFeatures): Promise<ConfidenceScore>;
    private startStatsBroadcast;
    private startHeartbeat;
    private broadcast;
    private sendToClient;
    private generateClientId;
    getStats(): {
        connectedClients: number;
        totalScored: number;
        highScoreCount: number;
        avgScore: number;
        gradeDistribution: Record<string, number>;
    };
    getRecentOpportunities(count?: number): ScoredOpportunity[];
    close(): Promise<void>;
}
export default ConfidenceScoringWebSocket;
//# sourceMappingURL=confidence-scoring-websocket.d.ts.map