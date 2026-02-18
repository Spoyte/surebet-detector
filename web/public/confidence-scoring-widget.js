/**
 * Opportunity Confidence Scoring Widget
 * 
 * Real-time dashboard widget for displaying ML-based confidence scores
 * with filtering, visualization, and actionable insights.
 */

(function() {
  'use strict';

  class ConfidenceScoringWidget {
    private ws: WebSocket | null = null;
    private container: HTMLElement;
    private opportunities: Map<string, any> = new Map();
    private filters = {
      minScore: 60,
      minGrade: 'C' as 'A' | 'B' | 'C' | 'D' | 'F' | null,
      sports: [] as string[],
      bookmakers: [] as string[],
      action: null as 'execute' | 'monitor' | 'skip' | null
    };
    private stats = {
      totalScored: 0,
      highScoreCount: 0,
      avgScore: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 }
    };
    private reconnectInterval: number = 5000;
    private reconnectTimer: any = null;
    private wsUrl: string;

    constructor(containerId: string, wsUrl: string = 'ws://localhost:8082') {
      this.container = document.getElementById(containerId)!;
      this.wsUrl = wsUrl;
      this.render();
      this.connect();
    }

    private render(): void {
      this.container.innerHTML = `
        <div class="confidence-scoring-widget">
          <div class="widget-header">
            <h3>🎯 Opportunity Confidence Scorer</h3>
            <div class="connection-status" id="confidence-connection-status">
              <span class="status-dot disconnected"></span> Disconnected
            </div>
          </div>
          
          <div class="stats-cards">
            <div class="stat-card">
              <div class="stat-value" id="confidence-total-scored">0</div>
              <div class="stat-label">Total Scored</div>
            </div>
            <div class="stat-card highlight">
              <div class="stat-value" id="confidence-high-scores">0</div>
              <div class="stat-label">High Scores (≥70)</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="confidence-avg-score">0</div>
              <div class="stat-label">Avg Score</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="confidence-connected-clients">0</div>
              <div class="stat-label">Connected</div>
            </div>
          </div>

          <div class="grade-distribution">
            <div class="grade-bar">
              <div class="grade-segment grade-a" id="grade-a-bar" style="width: 0%"></div>
              <div class="grade-segment grade-b" id="grade-b-bar" style="width: 0%"></div>
              <div class="grade-segment grade-c" id="grade-c-bar" style="width: 0%"></div>
              <div class="grade-segment grade-d" id="grade-d-bar" style="width: 0%"></div>
              <div class="grade-segment grade-f" id="grade-f-bar" style="width: 0%"></div>
            </div>
            <div class="grade-labels">
              <span>A</span>
              <span>B</span>
              <span>C</span>
              <span>D</span>
              <span>F</span>
            </div>
          </div>

          <div class="filters-section">
            <div class="filter-row">
              <div class="filter-group">
                <label>Min Score</label>
                <input type="range" id="filter-min-score" min="0" max="100" value="60">
                <span id="filter-min-score-value">60</span>
              </div>
              <div class="filter-group">
                <label>Min Grade</label>
                <select id="filter-min-grade">
                  <option value="">Any</option>
                  <option value="A">A (Excellent)</option>
                  <option value="B">B (Good)</option>
                  <option value="C" selected>C (Fair)</option>
                  <option value="D">D (Poor)</option>
                </select>
              </div>
              <div class="filter-group">
                <label>Action</label>
                <select id="filter-action">
                  <option value="">Any</option>
                  <option value="execute">Execute</option>
                  <option value="monitor">Monitor</option>
                  <option value="skip">Skip</option>
                </select>
              </div>
            </div>
          </div>

          <div class="opportunities-list" id="confidence-opportunities-list">
            <div class="empty-state">
              <p>Waiting for opportunities...</p>
              <p class="sub">High-confidence opportunities will appear here</p>
            </div>
          </div>
        </div>
      `;

      this.attachStyles();
      this.attachEventListeners();
    }

    private attachStyles(): void {
      if (document.getElementById('confidence-scoring-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'confidence-scoring-styles';
      styles.textContent = `
        .confidence-scoring-widget {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 12px;
          padding: 20px;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
        }

        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .widget-header h3 {
          margin: 0;
          font-size: 1.4rem;
          background: linear-gradient(90deg, #00d4ff, #7b2cbf);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #888;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff4444;
          transition: background 0.3s;
        }

        .status-dot.connected {
          background: #00ff88;
          box-shadow: 0 0 8px #00ff88;
        }

        .stats-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 15px;
          text-align: center;
          border: 1px solid rgba(255,255,255,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .stat-card.highlight {
          background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,44,191,0.2));
          border-color: rgba(0,212,255,0.3);
        }

        .stat-value {
          font-size: 1.8rem;
          font-weight: bold;
          color: #00d4ff;
          margin-bottom: 5px;
        }

        .stat-card.highlight .stat-value {
          color: #00ff88;
        }

        .stat-label {
          font-size: 0.8rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .grade-distribution {
          margin-bottom: 20px;
        }

        .grade-bar {
          display: flex;
          height: 30px;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(255,255,255,0.05);
        }

        .grade-segment {
          transition: width 0.5s ease;
          min-width: 5px;
        }

        .grade-a { background: linear-gradient(90deg, #00ff88, #00cc6a); }
        .grade-b { background: linear-gradient(90deg, #88ff00, #66cc00); }
        .grade-c { background: linear-gradient(90deg, #ffcc00, #cc9900); }
        .grade-d { background: linear-gradient(90deg, #ff6600, #cc4400); }
        .grade-f { background: linear-gradient(90deg, #ff4444, #cc0000); }

        .grade-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 5px;
          font-size: 0.75rem;
          color: #666;
        }

        .filters-section {
          background: rgba(255,255,255,0.03);
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .filter-row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .filter-group label {
          font-size: 0.8rem;
          color: #888;
          text-transform: uppercase;
        }

        .filter-group input[type="range"] {
          width: 150px;
        }

        .filter-group select {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 4px;
          color: #fff;
          padding: 6px 12px;
          font-size: 0.9rem;
        }

        .opportunities-list {
          max-height: 500px;
          overflow-y: auto;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .empty-state .sub {
          font-size: 0.85rem;
          color: #444;
        }

        .opportunity-card {
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
          border-left: 4px solid;
          transition: transform 0.2s, box-shadow 0.2s;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .opportunity-card:hover {
          transform: translateX(5px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .opportunity-card.grade-a { border-left-color: #00ff88; }
        .opportunity-card.grade-b { border-left-color: #88ff00; }
        .opportunity-card.grade-c { border-left-color: #ffcc00; }
        .opportunity-card.grade-d { border-left-color: #ff6600; }
        .opportunity-card.grade-f { border-left-color: #ff4444; }

        .opportunity-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .opportunity-title {
          font-weight: 600;
          font-size: 1rem;
        }

        .opportunity-meta {
          font-size: 0.8rem;
          color: #888;
          margin-top: 2px;
        }

        .score-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 12px;
          border-radius: 6px;
          background: rgba(0,0,0,0.3);
        }

        .score-value {
          font-size: 1.4rem;
          font-weight: bold;
        }

        .score-grade {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .grade-a .score-value { color: #00ff88; }
        .grade-b .score-value { color: #88ff00; }
        .grade-c .score-value { color: #ffcc00; }
        .grade-d .score-value { color: #ff6600; }
        .grade-f .score-value { color: #ff4444; }

        .opportunity-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }

        .detail-item {
          display: flex;
          flex-direction: column;
        }

        .detail-label {
          font-size: 0.7rem;
          color: #666;
          text-transform: uppercase;
        }

        .detail-value {
          font-size: 0.9rem;
          color: #ccc;
        }

        .action-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .action-execute {
          background: rgba(0,255,136,0.2);
          color: #00ff88;
        }

        .action-monitor {
          background: rgba(255,204,0,0.2);
          color: #ffcc00;
        }

        .action-skip {
          background: rgba(255,68,68,0.2);
          color: #ff4444;
        }

        .explanation-list {
          margin-top: 10px;
          padding: 10px;
          background: rgba(0,0,0,0.2);
          border-radius: 6px;
        }

        .explanation-list li {
          font-size: 0.85rem;
          color: #aaa;
          margin: 4px 0;
        }

        .factor-bars {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 10px;
        }

        .factor-bar {
          text-align: center;
        }

        .factor-label {
          font-size: 0.65rem;
          color: #666;
          text-transform: uppercase;
        }

        .factor-value {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          margin-top: 4px;
          overflow: hidden;
        }

        .factor-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4ff, #7b2cbf);
          transition: width 0.5s ease;
        }
      `;
      document.head.appendChild(styles);
    }

    private attachEventListeners(): void {
      const minScoreInput = document.getElementById('filter-min-score') as HTMLInputElement;
      const minScoreValue = document.getElementById('filter-min-score-value')!;
      const minGradeSelect = document.getElementById('filter-min-grade') as HTMLSelectElement;
      const actionSelect = document.getElementById('filter-action') as HTMLSelectElement;

      minScoreInput?.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value);
        minScoreValue.textContent = value.toString();
        this.filters.minScore = value;
        this.updateSubscription();
        this.renderOpportunities();
      });

      minGradeSelect?.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value;
        this.filters.minGrade = value as any || null;
        this.updateSubscription();
        this.renderOpportunities();
      });

      actionSelect?.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value;
        this.filters.action = value as any || null;
        this.updateSubscription();
        this.renderOpportunities();
      });
    }

    private connect(): void {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('Connected to confidence scoring WebSocket');
          this.updateConnectionStatus(true);
          this.updateSubscription();
          
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('Disconnected from confidence scoring WebSocket');
          this.updateConnectionStatus(false);
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.updateConnectionStatus(false);
        };
      } catch (error) {
        console.error('Failed to connect:', error);
        this.scheduleReconnect();
      }
    }

    private scheduleReconnect(): void {
      if (this.reconnectTimer) return;
      
      this.reconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect...');
        this.connect();
      }, this.reconnectInterval);
    }

    private updateConnectionStatus(connected: boolean): void {
      const statusEl = document.getElementById('confidence-connection-status');
      if (statusEl) {
        statusEl.innerHTML = connected
          ? '<span class="status-dot connected"></span> Connected'
          : '<span class="status-dot disconnected"></span> Disconnected';
      }
    }

    private updateSubscription(): void {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'subscribe',
          data: {
            minScore: this.filters.minScore,
            minGrade: this.filters.minGrade,
            action: this.filters.action
          }
        }));
      }
    }

    private handleMessage(message: any): void {
      switch (message.type) {
        case 'opportunityScored':
          this.handleOpportunityScored(message.data);
          break;
        case 'stats':
          this.updateStats(message.data);
          break;
        case 'recentOpportunities':
          message.data.forEach((opp: any) => this.opportunities.set(opp.id, opp));
          this.renderOpportunities();
          break;
        case 'modelData':
          console.log('Received model data:', message.data);
          break;
        case 'bookmakerRanking':
          console.log('Received bookmaker ranking:', message.data);
          break;
      }
    }

    private handleOpportunityScored(opportunity: any): void {
      this.opportunities.set(opportunity.id, opportunity);
      
      // Keep only last 100 opportunities
      if (this.opportunities.size > 100) {
        const firstKey = this.opportunities.keys().next().value;
        this.opportunities.delete(firstKey);
      }
      
      this.renderOpportunities();
      
      // Browser notification for high scores
      if (opportunity.score.score >= 80 && opportunity.score.recommendedAction === 'execute') {
        this.showNotification(opportunity);
      }
    }

    private updateStats(stats: any): void {
      this.stats = stats;
      
      document.getElementById('confidence-total-scored')!.textContent = stats.totalScored.toString();
      document.getElementById('confidence-high-scores')!.textContent = stats.highScoreCount.toString();
      document.getElementById('confidence-avg-score')!.textContent = stats.avgScore.toString();
      document.getElementById('confidence-connected-clients')!.textContent = stats.connectedClients.toString();
      
      // Update grade distribution bars
      const total = Object.values(stats.gradeDistribution).reduce((a: number, b: number) => a + b, 0);
      if (total > 0) {
        (Object.keys(stats.gradeDistribution) as Array<keyof typeof stats.gradeDistribution>).forEach(grade => {
          const bar = document.getElementById(`grade-${grade.toLowerCase()}-bar`);
          if (bar) {
            const percentage = (stats.gradeDistribution[grade] / total) * 100;
            bar.style.width = `${Math.max(percentage, 5)}%`;
          }
        });
      }
    }

    private renderOpportunities(): void {
      const container = document.getElementById('confidence-opportunities-list')!;
      
      const filtered = Array.from(this.opportunities.values())
        .filter(opp => this.matchesFilters(opp))
        .sort((a, b) => b.score.score - a.score.score)
        .slice(0, 50);
      
      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <p>No opportunities match your filters</p>
            <p class="sub">Adjust filters to see more results</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = filtered.map(opp => this.renderOpportunityCard(opp)).join('');
    }

    private matchesFilters(opportunity: any): boolean {
      if (opportunity.score.score < this.filters.minScore) return false;
      
      if (this.filters.minGrade) {
        const gradeOrder = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
        if (gradeOrder[opportunity.score.grade] < gradeOrder[this.filters.minGrade]) return false;
      }
      
      if (this.filters.action && opportunity.score.recommendedAction !== this.filters.action) return false;
      
      return true;
    }

    private renderOpportunityCard(opportunity: any): string {
      const { score, match, sport, league, market, bookmakers, features } = opportunity;
      const gradeClass = `grade-${score.grade.toLowerCase()}`;
      const actionClass = `action-${score.recommendedAction}`;
      
      return `
        <div class="opportunity-card ${gradeClass}">
          <div class="opportunity-header">
            <div>
              <div class="opportunity-title">${match}</div>
              <div class="opportunity-meta">${sport} • ${league} • ${market}</div>
            </div>
            <div class="score-badge">
              <div class="score-value">${score.score}</div>
              <div class="score-grade">Grade ${score.grade}</div>
            </div>
          </div>
          
          <div class="opportunity-details">
            <div class="detail-item">
              <span class="detail-label">Profit</span>
              <span class="detail-value">${features.profitPercent.toFixed(2)}%</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Probability</span>
              <span class="detail-value">${(score.probability * 100).toFixed(1)}%</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Est. Fill Time</span>
              <span class="detail-value">${score.estimatedFillTimeMinutes} min</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Action</span>
              <span class="detail-value"><span class="action-badge ${actionClass}">${score.recommendedAction}</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Bookmakers</span>
              <span class="detail-value">${bookmakers.join(', ')}</span>
            </div>
          </div>
          
          <div class="factor-bars">
            ${this.renderFactorBar('Profit', score.factors.profitFactor)}
            ${this.renderFactorBar('Timing', score.factors.timingFactor)}
            ${this.renderFactorBar('Bookmaker', score.factors.bookmakerFactor)}
            ${this.renderFactorBar('Market', score.factors.marketFactor)}
            ${this.renderFactorBar('History', score.factors.historicalFactor)}
          </div>
          
          ${score.explanation.length > 0 ? `
            <ul class="explanation-list">
              ${score.explanation.map((e: string) => `<li>${e}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      `;
    }

    private renderFactorBar(label: string, value: number): string {
      return `
        <div class="factor-bar">
          <div class="factor-label">${label}</div>
          <div class="factor-value">
            <div class="factor-fill" style="width: ${(value * 100).toFixed(0)}%"></div>
          </div>
        </div>
      `;
    }

    private showNotification(opportunity: any): void {
      if (!('Notification' in window)) return;
      
      if (Notification.permission === 'granted') {
        new Notification('High Confidence Opportunity!', {
          body: `${opportunity.match} - Score: ${opportunity.score.score} (${opportunity.score.grade})`,
          icon: '/icon.png'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('High Confidence Opportunity!', {
              body: `${opportunity.match} - Score: ${opportunity.score.score} (${opportunity.score.grade})`,
              icon: '/icon.png'
            });
          }
        });
      }
    }

    public destroy(): void {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      if (this.ws) {
        this.ws.close();
      }
    }
  }

  // Expose to global scope
  (window as any).ConfidenceScoringWidget = ConfidenceScoringWidget;
})();
