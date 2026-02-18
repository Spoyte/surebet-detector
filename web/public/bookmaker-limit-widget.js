/**
 * Bookmaker Limit Optimizer Widget
 * 
 * Real-time dashboard widget for viewing stake optimization,
 * bookmaker limits, and partial fill protection status.
 */

(function() {
  'use strict';

  // Configuration
  const WS_URL = window.BOOKMAKER_LIMIT_WS_URL || 'ws://localhost:8084';
  const RECONNECT_DELAY = 5000;
  const MAX_RECONNECT_ATTEMPTS = 10;

  // State
  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let isConnected = false;
  let clientId = null;
  let accounts = [];
  let optimizations = [];
  let selectedAccount = null;
  let filters = {
    showLimitedOnly: false,
    minProfitPercent: 0
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
    const container = document.getElementById('bookmaker-limit-widget') || document.body;
    
    container.innerHTML = `
      <div class="limit-optimizer-widget">
        <div class="widget-header">
          <h3>📊 Bookmaker Limit Optimizer</h3>
          <div class="connection-status" id="limit-connection-status">
            <span class="status-dot disconnected"></span>
            <span class="status-text">Disconnected</span>
          </div>
        </div>
        
        <div class="widget-tabs">
          <button class="tab-btn active" data-tab="accounts">Accounts</button>
          <button class="tab-btn" data-tab="optimizations">Optimizations</button>
          <button class="tab-btn" data-tab="limits">Limits</button>
        </div>
        
        <div class="widget-filters">
          <label class="filter-checkbox">
            <input type="checkbox" id="show-limited-only">
            <span>Show limited only</span>
          </label>
          <label class="filter-input">
            <span>Min Profit %:</span>
            <input type="number" id="min-profit-filter" min="0" max="100" step="0.1" value="0">
          </label>
        </div>
        
        <div class="widget-content">
          <!-- Accounts Tab -->
          <div class="tab-content active" id="accounts-tab">
            <div class="accounts-summary" id="accounts-summary">
              <div class="summary-card">
                <span class="summary-value" id="total-accounts">0</span>
                <span class="summary-label">Total Accounts</span>
              </div>
              <div class="summary-card">
                <span class="summary-value" id="limited-accounts">0</span>
                <span class="summary-label">Limited</span>
              </div>
              <div class="summary-card">
                <span class="summary-value" id="total-balance">€0</span>
                <span class="summary-label">Total Balance</span>
              </div>
            </div>
            <div class="accounts-list" id="accounts-list">
              <div class="empty-state">No accounts registered</div>
            </div>
          </div>
          
          <!-- Optimizations Tab -->
          <div class="tab-content" id="optimizations-tab">
            <div class="optimizations-list" id="optimizations-list">
              <div class="empty-state">No optimizations yet</div>
            </div>
          </div>
          
          <!-- Limits Tab -->
          <div class="tab-content" id="limits-tab">
            <div class="limits-list" id="limits-list">
              <div class="empty-state">Select an account to view limits</div>
            </div>
          </div>
        </div>
        
        <div class="widget-footer">
          <span id="last-update">Last update: Never</span>
          <button class="btn-refresh" id="refresh-btn">🔄 Refresh</button>
        </div>
      </div>
      
      <style>
        .limit-optimizer-widget {
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
        
        .widget-filters {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
          padding: 10px;
          background: #252542;
          border-radius: 8px;
          font-size: 0.9em;
        }
        
        .filter-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        
        .filter-checkbox input {
          width: 18px;
          height: 18px;
          accent-color: #4f46e5;
        }
        
        .filter-input {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .filter-input input {
          width: 60px;
          padding: 4px 8px;
          border: 1px solid #444;
          background: #1a1a2e;
          color: #fff;
          border-radius: 4px;
        }
        
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
        
        .accounts-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .summary-card {
          background: #252542;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        
        .summary-value {
          display: block;
          font-size: 1.8em;
          font-weight: bold;
          color: #4ade80;
        }
        
        .summary-label {
          display: block;
          font-size: 0.85em;
          color: #888;
          margin-top: 5px;
        }
        
        .account-card {
          background: #252542;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
          border-left: 4px solid transparent;
        }
        
        .account-card:hover { background: #303055; }
        .account-card.selected { border-left-color: #4f46e5; }
        .account-card.limited { border-left-color: #ef4444; }
        
        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .account-name {
          font-weight: 600;
          font-size: 1.1em;
        }
        
        .account-badges {
          display: flex;
          gap: 5px;
        }
        
        .badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.75em;
          font-weight: 600;
        }
        
        .badge-limited { background: #ef4444; color: #fff; }
        .badge-active { background: #4ade80; color: #000; }
        .badge-inactive { background: #666; color: #fff; }
        
        .account-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          font-size: 0.9em;
          color: #aaa;
        }
        
        .detail-row {
          display: flex;
          justify-content: space-between;
        }
        
        .detail-label { color: #666; }
        .detail-value { color: #fff; font-weight: 500; }
        
        .gubbing-risk {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #333;
        }
        
        .risk-bar {
          height: 6px;
          background: #333;
          border-radius: 3px;
          overflow: hidden;
          margin-top: 5px;
        }
        
        .risk-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s;
        }
        
        .risk-fill.low { background: #4ade80; }
        .risk-fill.medium { background: #fbbf24; }
        .risk-fill.high { background: #ef4444; }
        
        .optimization-card {
          background: #252542;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 10px;
        }
        
        .optimization-card.optimal { border-left: 4px solid #4ade80; }
        .optimization-card.constrained { border-left: 4px solid #fbbf24; }
        .optimization-card.high-risk { border-left: 4px solid #ef4444; }
        
        .opt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .opt-id {
          font-family: monospace;
          font-size: 0.85em;
          color: #888;
        }
        
        .opt-profit {
          font-size: 1.2em;
          font-weight: bold;
        }
        
        .opt-profit.positive { color: #4ade80; }
        .opt-profit.negative { color: #ef4444; }
        
        .opt-status {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .status-item {
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.8em;
          background: #1a1a2e;
        }
        
        .opt-legs {
          margin-top: 10px;
        }
        
        .leg-row {
          display: grid;
          grid-template-columns: 1fr 80px 80px 60px;
          gap: 10px;
          padding: 8px;
          background: #1a1a2e;
          border-radius: 4px;
          margin-bottom: 5px;
          font-size: 0.85em;
          align-items: center;
        }
        
        .leg-bookmaker { font-weight: 500; }
        .leg-odds { color: #fbbf24; text-align: center; }
        .leg-stake { text-align: right; }
        .leg-constrained { color: #ef4444; font-size: 0.75em; }
        
        .limit-row {
          display: grid;
          grid-template-columns: 1fr 100px 100px 80px;
          gap: 10px;
          padding: 10px;
          background: #252542;
          border-radius: 4px;
          margin-bottom: 5px;
          align-items: center;
        }
        
        .limit-market { font-weight: 500; }
        .limit-min { color: #888; text-align: right; }
        .limit-max { color: #4ade80; text-align: right; font-weight: 600; }
        .limit-confidence { text-align: center; }
        
        .confidence-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        
        .confidence-high { background: #4ade80; }
        .confidence-medium { background: #fbbf24; }
        .confidence-low { background: #ef4444; }
        
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
    elements.connectionStatus = document.getElementById('limit-connection-status');
    elements.accountsList = document.getElementById('accounts-list');
    elements.accountsSummary = document.getElementById('accounts-summary');
    elements.totalAccounts = document.getElementById('total-accounts');
    elements.limitedAccounts = document.getElementById('limited-accounts');
    elements.totalBalance = document.getElementById('total-balance');
    elements.optimizationsList = document.getElementById('optimizations-list');
    elements.limitsList = document.getElementById('limits-list');
    elements.lastUpdate = document.getElementById('last-update');
    elements.showLimitedOnly = document.getElementById('show-limited-only');
    elements.minProfitFilter = document.getElementById('min-profit-filter');
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

    // Filters
    elements.showLimitedOnly?.addEventListener('change', (e) => {
      filters.showLimitedOnly = e.target.checked;
      renderAccounts();
    });

    elements.minProfitFilter?.addEventListener('input', (e) => {
      filters.minProfitPercent = parseFloat(e.target.value) || 0;
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
    send({ type: 'getAccounts' });
    send({ type: 'getStats' });
    send({ type: 'getHistory', payload: { limit: 20 } });
    if (selectedAccount) {
      send({ type: 'getLimits', payload: { bookmakerId: selectedAccount } });
    }
  }

  /**
   * Handle incoming message
   */
  function handleMessage(message) {
    switch (message.type) {
      case 'connected':
        clientId = message.payload?.clientId;
        break;
        
      case 'accounts':
        accounts = message.payload?.accounts || [];
        renderAccounts();
        updateSummary();
        break;
        
      case 'stakesOptimized':
        const opt = message.payload?.result;
        if (opt) {
          optimizations.unshift(opt);
          if (optimizations.length > 50) optimizations.pop();
          renderOptimizations();
        }
        break;
        
      case 'history':
        optimizations = message.payload?.optimizations || [];
        renderOptimizations();
        break;
        
      case 'limits':
        renderLimits(message.payload?.limit || message.payload?.limits);
        break;
        
      case 'limitedAccounts':
        // Handle limited accounts update
        break;
        
      case 'stats':
        // Handle stats update
        break;
        
      case 'limitUpdated':
      case 'dynamicAdjustmentUpdated':
        // Refresh accounts on limit changes
        send({ type: 'getAccounts' });
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
   * Update summary cards
   */
  function updateSummary() {
    if (elements.totalAccounts) {
      elements.totalAccounts.textContent = accounts.length;
    }
    
    if (elements.limitedAccounts) {
      const limited = accounts.filter(a => a.isLimited).length;
      elements.limitedAccounts.textContent = limited;
    }
    
    if (elements.totalBalance) {
      const total = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
      elements.totalBalance.textContent = '€' + total.toLocaleString();
    }
  }

  /**
   * Render accounts list
   */
  function renderAccounts() {
    if (!elements.accountsList) return;
    
    let filteredAccounts = accounts;
    if (filters.showLimitedOnly) {
      filteredAccounts = accounts.filter(a => a.isLimited);
    }
    
    if (filteredAccounts.length === 0) {
      elements.accountsList.innerHTML = '<div class="empty-state">No accounts found</div>';
      return;
    }
    
    elements.accountsList.innerHTML = filteredAccounts.map(account => `
      <div class="account-card ${account.isLimited ? 'limited' : ''} ${selectedAccount === account.bookmakerId ? 'selected' : ''}" 
           data-id="${account.bookmakerId}">
        <div class="account-header">
          <span class="account-name">${account.bookmakerName}</span>
          <div class="account-badges">
            ${account.isLimited ? '<span class="badge badge-limited">LIMITED</span>' : ''}
            <span class="badge ${account.isActive ? 'badge-active' : 'badge-inactive'}">
              ${account.isActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
        </div>
        <div class="account-details">
          <div class="detail-row">
            <span class="detail-label">Balance:</span>
            <span class="detail-value">${account.balance?.toLocaleString()} ${account.currency}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Adjustment:</span>
            <span class="detail-value">${((account.adjustmentFactor || 1) * 100).toFixed(0)}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Limits:</span>
            <span class="detail-value">${account.limitCount || 0}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Wins:</span>
            <span class="detail-value">${account.consecutiveWins || 0}</span>
          </div>
        </div>
        <div class="gubbing-risk">
          <div class="detail-row">
            <span class="detail-label">Gubbing Risk:</span>
            <span class="detail-value">${((account.gubbingRisk || 0) * 100).toFixed(0)}%</span>
          </div>
          <div class="risk-bar">
            <div class="risk-fill ${getRiskLevel(account.gubbingRisk)}" 
                 style="width: ${(account.gubbingRisk || 0) * 100}%"></div>
          </div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    elements.accountsList.querySelectorAll('.account-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedAccount = card.dataset.id;
        renderAccounts();
        send({ type: 'getLimits', payload: { bookmakerId: selectedAccount } });
        switchTab('limits');
      });
    });
  }

  /**
   * Get risk level class
   */
  function getRiskLevel(risk) {
    if (!risk || risk < 0.3) return 'low';
    if (risk < 0.7) return 'medium';
    return 'high';
  }

  /**
   * Render optimizations list
   */
  function renderOptimizations() {
    if (!elements.optimizationsList) return;
    
    const filteredOpts = optimizations.filter(opt => 
      opt.profitPercent >= filters.minProfitPercent
    );
    
    if (filteredOpts.length === 0) {
      elements.optimizationsList.innerHTML = '<div class="empty-state">No optimizations yet</div>';
      return;
    }
    
    elements.optimizationsList.innerHTML = filteredOpts.map(opt => {
      const isOptimal = opt.isOptimal;
      const isHighRisk = opt.partialFillRisk?.riskLevel === 'high';
      const cardClass = isOptimal ? 'optimal' : (isHighRisk ? 'high-risk' : 'constrained');
      
      return `
        <div class="optimization-card ${cardClass}">
          <div class="opt-header">
            <span class="opt-id">${opt.opportunityId?.substring(0, 20)}...</span>
            <span class="opt-profit ${opt.expectedProfit >= 0 ? 'positive' : 'negative'}">
              ${opt.profitPercent?.toFixed(2)}%
            </span>
          </div>
          <div class="opt-status">
            <span class="status-item">Total: €${opt.totalStake?.toFixed(2)}</span>
            <span class="status-item">Profit: €${opt.expectedProfit?.toFixed(2)}</span>
            <span class="status-item">Risk: ${opt.partialFillRisk?.riskLevel || 'unknown'}</span>
            ${opt.constraintsApplied?.length > 0 ? `<span class="status-item">Constraints: ${opt.constraintsApplied.length}</span>` : ''}
          </div>
          ${opt.legs ? `
            <div class="opt-legs">
              ${opt.legs.map(leg => `
                <div class="leg-row">
                  <span class="leg-bookmaker">${leg.bookmakerName}</span>
                  <span class="leg-odds">${leg.odds}</span>
                  <span class="leg-stake">€${leg.actualStake?.toFixed(2)}</span>
                  ${leg.isConstrained ? '<span class="leg-constrained">⚠️ Limited</span>' : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Render limits
   */
  function renderLimits(limits) {
    if (!elements.limitsList) return;
    
    if (!limits) {
      elements.limitsList.innerHTML = '<div class="empty-state">Select an account to view limits</div>';
      return;
    }
    
    if (Array.isArray(limits)) {
      if (limits.length === 0) {
        elements.limitsList.innerHTML = '<div class="empty-state">No limits configured</div>';
        return;
      }
      
      elements.limitsList.innerHTML = limits.map(limit => `
        <div class="limit-row">
          <span class="limit-market">${limit.market}</span>
          <span class="limit-min">Min: €${limit.minStake}</span>
          <span class="limit-max">Max: €${limit.maxStake?.toLocaleString()}</span>
          <span class="limit-confidence">
            <span class="confidence-dot ${getConfidenceClass(limit.confidence)}"></span>
          </span>
        </div>
      `).join('');
    } else {
      // Single limit object
      elements.limitsList.innerHTML = `
        <div class="limit-row">
          <span class="limit-market">${limits.market || 'default'}</span>
          <span class="limit-min">Min: €${limits.minStake}</span>
          <span class="limit-max">Max: €${limits.maxStake?.toLocaleString()}</span>
          <span class="limit-confidence">
            <span class="confidence-dot ${getConfidenceClass(limits.confidence)}"></span>
          </span>
        </div>
      `;
    }
  }

  /**
   * Get confidence class
   */
  function getConfidenceClass(confidence) {
    if (!confidence || confidence < 0.5) return 'confidence-low';
    if (confidence < 0.8) return 'confidence-medium';
    return 'confidence-high';
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
  window.BookmakerLimitWidget = {
    connect,
    disconnect: () => ws?.close(),
    requestRefresh,
    getState: () => ({
      isConnected,
      accounts,
      optimizations,
      selectedAccount,
      filters
    })
  };
})();
