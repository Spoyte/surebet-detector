/**
 * Dynamic Stake Sizing Widget
 * 
 * Real-time dashboard widget for viewing stake recommendations,
 * bankroll status, and stake sizing history.
 */

(function() {
  'use strict';

  // Configuration
  const WS_URL = window.DYNAMIC_STAKE_WS_URL || 'ws://localhost:8085';
  const RECONNECT_DELAY = 5000;
  const MAX_RECONNECT_ATTEMPTS = 10;

  // State
  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let isConnected = false;
  let clientId = null;
  let bankroll = null;
  let recommendations = [];
  let calculations = [];
  let stats = null;
  let filters = {
    minGrade: null,
    minConfidence: 0
  };

  // DOM Elements cache
  const elements = {};

  /**
   * Initialize the widget
   */
  function init() {
    createWidgetHTML();
    cacheElements();
    bindEvents();
    connect();
    startRefreshInterval();
  }

  /**
   * Create widget HTML structure
   */
  function createWidgetHTML() {
    const container = document.getElementById('dynamic-stake-widget') || document.body;
    
    container.innerHTML = `
      <div class="dynamic-stake-widget">
        <div class="widget-header">
          <h3>💰 Dynamic Stake Sizing</h3>
          <div class="connection-status" id="stake-connection-status">
            <span class="status-dot disconnected"></span>
            <span class="status-text">Disconnected</span>
          </div>
        </div>
        
        <div class="widget-tabs">
          <button class="tab-btn active" data-tab="bankroll">Bankroll</button>
          <button class="tab-btn" data-tab="recommendations">Recommendations</button>
          <button class="tab-btn" data-tab="calculations">History</button>
        </div>
        
        <div class="widget-content">
          <!-- Bankroll Tab -->
          <div class="tab-content active" id="bankroll-tab">
            <div class="bankroll-display" id="bankroll-display">
              <div class="bankroll-main">
                <span class="bankroll-label">Total Bankroll</span>
                <span class="bankroll-value" id="total-bankroll">€0</span>
              </div>
              <div class="bankroll-grid">
                <div class="bankroll-card">
                  <span class="card-label">Available</span>
                  <span class="card-value" id="available-bankroll">€0</span>
                </div>
                <div class="bankroll-card">
                  <span class="card-label">Daily Loss</span>
                  <span class="card-value loss" id="daily-loss">€0</span>
                </div>
                <div class="bankroll-card">
                  <span class="card-label">Daily Limit</span>
                  <span class="card-value" id="daily-limit">€0</span>
                </div>
                <div class="bankroll-card">
                  <span class="card-label">Streak</span>
                  <span class="card-value" id="current-streak">0</span>
                </div>
              </div>
              <div class="daily-loss-bar">
                <div class="loss-label">Daily Loss Progress</div>
                <div class="loss-bar-container">
                  <div class="loss-bar" id="loss-bar" style="width: 0%"></div>
                </div>
                <div class="loss-percent" id="loss-percent">0%</div>
              </div>
            </div>
            
            <div class="stats-section">
              <h4>Performance Stats</h4>
              <div class="stats-grid" id="stats-grid">
                <div class="stat-item">
                  <span class="stat-value" id="total-bets">0</span>
                  <span class="stat-label">Total Bets</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value" id="win-rate">0%</span>
                  <span class="stat-label">Win Rate</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value" id="total-staked">€0</span>
                  <span class="stat-label">Total Staked</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value" id="roi">0%</span>
                  <span class="stat-label">ROI</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Recommendations Tab -->
          <div class="tab-content" id="recommendations-tab">
            <div class="recommendations-list" id="recommendations-list">
              <div class="empty-state">Loading recommendations...</div>
            </div>
          </div>
          
          <!-- Calculations Tab -->
          <div class="tab-content" id="calculations-tab">
            <div class="calculations-list" id="calculations-list">
              <div class="empty-state">No calculations yet</div>
            </div>
          </div>
        </div>
        
        <div class="widget-footer">
          <span id="last-update">Last update: Never</span>
          <button class="btn-refresh" id="refresh-btn">🔄 Refresh</button>
        </div>
      </div>
      
      <style>
        .dynamic-stake-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1a1a2e;
          border-radius: 12px;
          padding: 20px;
          color: #eee;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #333;
        }
        
        .widget-header h3 {
          margin: 0;
          font-size: 1.3em;
          color: #fff;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85em;
        }
        
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        
        .status-dot.connected { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
        .status-dot.disconnected { background: #ef4444; }
        .status-dot.connecting { background: #fbbf24; animation: pulse 1s infinite; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .widget-tabs {
          display: flex;
          gap: 5px;
          margin-bottom: 15px;
        }
        
        .tab-btn {
          padding: 8px 16px;
          border: none;
          background: #252542;
          color: #aaa;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .tab-btn:hover { background: #303055; }
        .tab-btn.active { background: #4f46e5; color: #fff; }
        
        .widget-content {
          min-height: 300px;
          max-height: 500px;
          overflow-y: auto;
        }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
          font-style: italic;
        }
        
        /* Bankroll Tab */
        .bankroll-display {
          background: #252542;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .bankroll-main {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #333;
        }
        
        .bankroll-label {
          display: block;
          font-size: 0.9em;
          color: #888;
          margin-bottom: 5px;
        }
        
        .bankroll-value {
          display: block;
          font-size: 2.5em;
          font-weight: bold;
          color: #4ade80;
        }
        
        .bankroll-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
        }
        
        .bankroll-card {
          text-align: center;
          padding: 10px;
          background: #1a1a2e;
          border-radius: 8px;
        }
        
        .card-label {
          display: block;
          font-size: 0.8em;
          color: #666;
          margin-bottom: 5px;
        }
        
        .card-value {
          display: block;
          font-size: 1.2em;
          font-weight: 600;
          color: #fff;
        }
        
        .card-value.loss { color: #ef4444; }
        
        .daily-loss-bar {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #333;
        }
        
        .loss-label {
          font-size: 0.85em;
          color: #888;
          margin-bottom: 8px;
        }
        
        .loss-bar-container {
          height: 8px;
          background: #333;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .loss-bar {
          height: 100%;
          background: linear-gradient(90deg, #fbbf24, #ef4444);
          border-radius: 4px;
          transition: width 0.3s;
        }
        
        .loss-percent {
          text-align: right;
          font-size: 0.85em;
          color: #888;
          margin-top: 5px;
        }
        
        .stats-section {
          background: #252542;
          border-radius: 12px;
          padding: 20px;
        }
        
        .stats-section h4 {
          margin: 0 0 15px 0;
          color: #fff;
          font-size: 1em;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
        }
        
        .stat-item {
          text-align: center;
          padding: 15px;
          background: #1a1a2e;
          border-radius: 8px;
        }
        
        .stat-value {
          display: block;
          font-size: 1.5em;
          font-weight: bold;
          color: #4ade80;
        }
        
        .stat-label {
          display: block;
          font-size: 0.8em;
          color: #666;
          margin-top: 5px;
        }
        
        /* Recommendations Tab */
        .recommendation-card {
          background: #252542;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
          border-left: 4px solid;
        }
        
        .recommendation-card.grade-A { border-left-color: #4ade80; }
        .recommendation-card.grade-B { border-left-color: #60a5fa; }
        .recommendation-card.grade-C { border-left-color: #fbbf24; }
        .recommendation-card.grade-D { border-left-color: #f97316; }
        .recommendation-card.grade-F { border-left-color: #ef4444; }
        
        .rec-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .rec-grade {
          font-size: 1.5em;
          font-weight: bold;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #1a1a2e;
        }
        
        .rec-grade.grade-A { color: #4ade80; }
        .rec-grade.grade-B { color: #60a5fa; }
        .rec-grade.grade-C { color: #fbbf24; }
        .rec-grade.grade-D { color: #f97316; }
        .rec-grade.grade-F { color: #ef4444; }
        
        .rec-stake {
          text-align: right;
        }
        
        .rec-stake-value {
          display: block;
          font-size: 1.3em;
          font-weight: bold;
          color: #fff;
        }
        
        .rec-stake-percent {
          font-size: 0.85em;
          color: #888;
        }
        
        .rec-details {
          font-size: 0.9em;
          color: #aaa;
        }
        
        /* Calculations Tab */
        .calculation-card {
          background: #252542;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
        }
        
        .calculation-card.proceed { border-left: 4px solid #4ade80; }
        .calculation-card.caution { border-left: 4px solid #fbbf24; }
        .calculation-card.skip { border-left: 4px solid #ef4444; }
        
        .calc-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .calc-match {
          font-weight: 600;
          color: #fff;
        }
        
        .calc-grade {
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.85em;
          font-weight: 600;
          background: #1a1a2e;
        }
        
        .calc-grade.grade-A { color: #4ade80; }
        .calc-grade.grade-B { color: #60a5fa; }
        .calc-grade.grade-C { color: #fbbf24; }
        .calc-grade.grade-D { color: #f97316; }
        .calc-grade.grade-F { color: #ef4444; }
        
        .calc-details {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          font-size: 0.9em;
          margin-bottom: 10px;
        }
        
        .calc-detail {
          text-align: center;
          padding: 8px;
          background: #1a1a2e;
          border-radius: 4px;
        }
        
        .calc-detail-label {
          display: block;
          font-size: 0.75em;
          color: #666;
          margin-bottom: 3px;
        }
        
        .calc-detail-value {
          display: block;
          font-weight: 600;
          color: #fff;
        }
        
        .calc-recommendation {
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 0.85em;
          text-align: center;
          font-weight: 500;
        }
        
        .calc-recommendation.proceed { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
        .calc-recommendation.caution { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
        .calc-recommendation.skip { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        
        .widget-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #333;
          font-size: 0.85em;
          color: #666;
        }
        
        .btn-refresh {
          padding: 6px 12px;
          border: none;
          background: #4f46e5;
          color: #fff;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .btn-refresh:hover { background: #4338ca; }
      </style>
    `;
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    elements.connectionStatus = document.getElementById('stake-connection-status');
    elements.totalBankroll = document.getElementById('total-bankroll');
    elements.availableBankroll = document.getElementById('available-bankroll');
    elements.dailyLoss = document.getElementById('daily-loss');
    elements.dailyLimit = document.getElementById('daily-limit');
    elements.currentStreak = document.getElementById('current-streak');
    elements.lossBar = document.getElementById('loss-bar');
    elements.lossPercent = document.getElementById('loss-percent');
    elements.totalBets = document.getElementById('total-bets');
    elements.winRate = document.getElementById('win-rate');
    elements.totalStaked = document.getElementById('total-staked');
    elements.roi = document.getElementById('roi');
    elements.recommendationsList = document.getElementById('recommendations-list');
    elements.calculationsList = document.getElementById('calculations-list');
    elements.lastUpdate = document.getElementById('last-update');
    elements.refreshBtn = document.getElementById('refresh-btn');
    elements.tabBtns = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');
  }

  /**
   * Bind event handlers
   */
  function bindEvents() {
    // Tab switching
    elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    // Refresh
    elements.refreshBtn?.addEventListener('click', () => {
      requestRefresh();
    });
  }

  /**
   * Switch active tab
   */
  function switchTab(tabName) {
    elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
  }

  /**
   * Connect to WebSocket
   */
  function connect() {
    if (ws?.readyState === WebSocket.CONNECTING) return;

    updateConnectionStatus('connecting');

    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        isConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus('connected');
        
        // Subscribe to updates
        send({
          type: 'subscribe',
          payload: filters
        });
        
        // Request initial data
        requestRefresh();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        isConnected = false;
        updateConnectionStatus('disconnected');
        scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection
   */
  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      return;
    }

    reconnectAttempts++;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  }

  /**
   * Send message to server
   */
  function send(message) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Request data refresh
   */
  function requestRefresh() {
    send({ type: 'getBankroll' });
    send({ type: 'getRecommendations' });
    send({ type: 'getHistory', payload: { limit: 20 } });
    send({ type: 'getStats' });
  }

  /**
   * Handle incoming message
   */
  function handleMessage(message) {
    switch (message.type) {
      case 'connected':
        clientId = message.payload?.clientId;
        recommendations = message.payload?.recommendations || [];
        renderRecommendations();
        break;
        
      case 'bankroll':
        bankroll = message.payload?.bankroll;
        renderBankroll();
        break;
        
      case 'recommendations':
        recommendations = message.payload?.recommendations || [];
        renderRecommendations();
        break;
        
      case 'stakeCalculated':
        const calc = message.payload;
        if (calc) {
          calculations.unshift(calc);
          if (calculations.length > 50) calculations.pop();
          renderCalculations();
        }
        break;
        
      case 'history':
        calculations = message.payload?.calculations || [];
        renderCalculations();
        break;
        
      case 'stats':
        stats = message.payload;
        renderStats();
        break;
        
      case 'outcomeRecorded':
      case 'bankrollUpdated':
      case 'dailyReset':
        // Refresh bankroll on changes
        send({ type: 'getBankroll' });
        send({ type: 'getStats' });
        break;
        
      case 'ping':
        send({ type: 'pong' });
        break;
    }
    
    updateLastUpdateTime();
  }

  /**
   * Update connection status UI
   */
  function updateConnectionStatus(status) {
    if (!elements.connectionStatus) return;
    
    const dot = elements.connectionStatus.querySelector('.status-dot');
    const text = elements.connectionStatus.querySelector('.status-text');
    
    dot.className = 'status-dot ' + status;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  /**
   * Update last update time
   */
  function updateLastUpdateTime() {
    if (elements.lastUpdate) {
      elements.lastUpdate.textContent = 'Last update: ' + new Date().toLocaleTimeString();
    }
  }

  /**
   * Render bankroll display
   */
  function renderBankroll() {
    if (!bankroll) return;
    
    if (elements.totalBankroll) {
      elements.totalBankroll.textContent = '€' + bankroll.totalBankroll?.toLocaleString();
    }
    if (elements.availableBankroll) {
      elements.availableBankroll.textContent = '€' + bankroll.availableBankroll?.toLocaleString();
    }
    if (elements.dailyLoss) {
      elements.dailyLoss.textContent = '€' + (bankroll.dailyLoss || 0).toLocaleString();
    }
    if (elements.dailyLimit) {
      elements.dailyLimit.textContent = '€' + (bankroll.dailyLossLimit || 0).toLocaleString();
    }
    if (elements.currentStreak) {
      const streak = bankroll.consecutiveWins > 0 
        ? `+${bankroll.consecutiveWins}` 
        : `-${bankroll.consecutiveLosses}`;
      elements.currentStreak.textContent = streak;
      elements.currentStreak.style.color = bankroll.consecutiveWins > 0 ? '#4ade80' : '#ef4444';
    }
    
    // Update loss bar
    if (elements.lossBar && elements.lossPercent && bankroll.dailyLossLimit > 0) {
      const percent = Math.min((bankroll.dailyLoss / bankroll.dailyLossLimit) * 100, 100);
      elements.lossBar.style.width = percent + '%';
      elements.lossPercent.textContent = percent.toFixed(1) + '%';
    }
  }

  /**
   * Render stats
   */
  function renderStats() {
    if (!stats) return;
    
    if (elements.totalBets) {
      elements.totalBets.textContent = stats.totalBets || 0;
    }
    if (elements.winRate) {
      elements.winRate.textContent = (stats.winRate || 0).toFixed(1) + '%';
    }
    if (elements.totalStaked) {
      elements.totalStaked.textContent = '€' + (stats.totalStaked || 0).toLocaleString();
    }
    if (elements.roi) {
      const roi = stats.roi || 0;
      elements.roi.textContent = roi.toFixed(2) + '%';
      elements.roi.style.color = roi >= 0 ? '#4ade80' : '#ef4444';
    }
  }

  /**
   * Render recommendations
   */
  function renderRecommendations() {
    if (!elements.recommendationsList) return;
    
    if (recommendations.length === 0) {
      elements.recommendationsList.innerHTML = '<div class="empty-state">No recommendations available</div>';
      return;
    }
    
    elements.recommendationsList.innerHTML = recommendations.map(rec => `
      <div class="recommendation-card grade-${rec.grade}">
        <div class="rec-header">
          <span class="rec-grade grade-${rec.grade}">${rec.grade}</span>
          <div class="rec-stake">
            <span class="rec-stake-value">€${rec.recommendedStake?.toFixed(2)}</span>
            <span class="rec-stake-percent">${rec.stakePercent?.toFixed(2)}% of bankroll</span>
          </div>
        </div>
        <div class="rec-details">
          Min Confidence: ${rec.minConfidence}% • ${rec.description}
        </div>
      </div>
    `).join('');
  }

  /**
   * Render calculations
   */
  function renderCalculations() {
    if (!elements.calculationsList) return;
    
    if (calculations.length === 0) {
      elements.calculationsList.innerHTML = '<div class="empty-state">No calculations yet</div>';
      return;
    }
    
    elements.calculationsList.innerHTML = calculations.map(calc => {
      const grade = calc.stakes?.[0]?.grade || 'F';
      return `
        <div class="calculation-card ${calc.recommendation}">
          <div class="calc-header">
            <span class="calc-match">${calc.match}</span>
            <span class="calc-grade grade-${grade}">${grade}</span>
          </div>
          <div class="calc-details">
            <div class="calc-detail">
              <span class="calc-detail-label">Total Stake</span>
              <span class="calc-detail-value">€${calc.totalStake?.toFixed(2)}</span>
            </div>
            <div class="calc-detail">
              <span class="calc-detail-label">Profit</span>
              <span class="calc-detail-value">€${calc.profitPotential?.toFixed(2)}</span>
            </div>
            <div class="calc-detail">
              <span class="calc-detail-label">Confidence</span>
              <span class="calc-detail-value">${calc.stakes?.[0]?.confidenceScore?.toFixed(0) || 0}%</span>
            </div>
          </div>
          <div class="calc-recommendation ${calc.recommendation}">
            ${calc.recommendation.toUpperCase()}: ${calc.reasoning?.[0] || ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Start refresh interval
   */
  function startRefreshInterval() {
    setInterval(() => {
      if (isConnected) {
        requestRefresh();
      }
    }, 30000); // Every 30 seconds
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.DynamicStakeWidget = {
    connect,
    disconnect: () => ws?.close(),
    requestRefresh,
    getState: () => ({
      isConnected,
      bankroll,
      recommendations,
      calculations,
      stats
    })
  };
})();
