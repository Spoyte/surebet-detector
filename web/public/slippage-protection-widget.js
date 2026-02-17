/**
 * Slippage Protection Dashboard Widget
 * 
 * Real-time slippage monitoring widget for the web dashboard.
 * Shows slippage alerts, statistics, and protection settings.
 */

class SlippageProtectionWidget {
  constructor() {
    this.ws = null;
    this.alerts = [];
    this.stats = {
      totalChecks: 0,
      blockedBets: 0,
      favorableSlippage: 0,
      criticalSlippage: 0
    };
    this.config = {
      maxSlippagePercent: 0.5,
      criticalSlippagePercent: 2.0,
      autoRetry: true
    };
    this.init();
  }

  init() {
    this.createWidgetHTML();
    this.connectWebSocket();
    this.setupEventListeners();
  }

  createWidgetHTML() {
    const container = document.getElementById('slippage-protection-widget');
    if (!container) return;

    container.innerHTML = `
      <div class="slippage-widget">
        <div class="widget-header">
          <h3>🛡️ Slippage Protection</h3>
          <div class="connection-status" id="slippage-connection-status">
            <span class="status-dot disconnected"></span>
            <span class="status-text">Disconnected</span>
          </div>
        </div>
        
        <div class="widget-stats">
          <div class="stat-card">
            <div class="stat-value" id="slippage-total-checks">0</div>
            <div class="stat-label">Checks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="slippage-blocked">0</div>
            <div class="stat-label">Blocked</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="slippage-favorable">0</div>
            <div class="stat-label">Price ↑</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="slippage-critical">0</div>
            <div class="stat-label">Critical</div>
          </div>
        </div>
        
        <div class="widget-controls">
          <div class="control-group">
            <label>Max Slippage (%)</label>
            <input type="number" id="slippage-max" value="0.5" step="0.1" min="0.1" max="5">
          </div>
          <div class="control-group">
            <label>Critical Threshold (%)</label>
            <input type="number" id="slippage-critical-threshold" value="2.0" step="0.1" min="1" max="10">
          </div>
          <div class="control-group checkbox">
            <label>
              <input type="checkbox" id="slippage-auto-retry" checked>
              Auto-retry on slippage
            </label>
          </div>
          <button id="slippage-update-config" class="btn btn-primary">Update Settings</button>
        </div>
        
        <div class="alerts-section">
          <h4>Recent Alerts</h4>
          <div class="alerts-filter">
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="critical">Critical</button>
            <button class="filter-btn" data-filter="acceptable">Acceptable</button>
            <button class="filter-btn" data-filter="favorable">Favorable</button>
          </div>
          <div class="alerts-list" id="slippage-alerts-list">
            <div class="empty-state">No slippage alerts yet</div>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('slippage-widget-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'slippage-widget-styles';
    styles.textContent = `
      .slippage-widget {
        background: var(--card-bg, #1a1a2e);
        border-radius: 12px;
        padding: 20px;
        color: var(--text-primary, #fff);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .widget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      
      .widget-header h3 {
        margin: 0;
        font-size: 18px;
      }
      
      .connection-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-secondary, #888);
      }
      
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      
      .status-dot.connected { background: #4ade80; }
      .status-dot.disconnected { background: #ef4444; }
      .status-dot.connecting { background: #fbbf24; }
      
      .widget-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      
      .stat-card {
        background: var(--bg-secondary, #16213e);
        padding: 12px;
        border-radius: 8px;
        text-align: center;
      }
      
      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--accent, #00d4ff);
      }
      
      .stat-label {
        font-size: 11px;
        color: var(--text-secondary, #888);
        margin-top: 4px;
      }
      
      .widget-controls {
        background: var(--bg-secondary, #16213e);
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      
      .control-group {
        margin-bottom: 12px;
      }
      
      .control-group label {
        display: block;
        font-size: 12px;
        color: var(--text-secondary, #888);
        margin-bottom: 4px;
      }
      
      .control-group input[type="number"] {
        width: 100%;
        padding: 8px 12px;
        background: var(--bg-tertiary, #0f3460);
        border: 1px solid var(--border, #2a2a4a);
        border-radius: 6px;
        color: var(--text-primary, #fff);
        font-size: 14px;
      }
      
      .control-group.checkbox label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      
      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .btn-primary {
        background: var(--accent, #00d4ff);
        color: #000;
        width: 100%;
      }
      
      .btn-primary:hover {
        opacity: 0.9;
      }
      
      .alerts-section h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
      }
      
      .alerts-filter {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      
      .filter-btn {
        padding: 6px 12px;
        background: var(--bg-secondary, #16213e);
        border: 1px solid var(--border, #2a2a4a);
        border-radius: 4px;
        color: var(--text-secondary, #888);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .filter-btn.active,
      .filter-btn:hover {
        background: var(--accent, #00d4ff);
        color: #000;
        border-color: var(--accent, #00d4ff);
      }
      
      .alerts-list {
        max-height: 300px;
        overflow-y: auto;
      }
      
      .alert-item {
        background: var(--bg-secondary, #16213e);
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 8px;
        border-left: 3px solid transparent;
      }
      
      .alert-item.critical { border-left-color: #ef4444; }
      .alert-item.acceptable { border-left-color: #fbbf24; }
      .alert-item.favorable { border-left-color: #4ade80; }
      .alert-item.none { border-left-color: #6b7280; }
      
      .alert-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      
      .alert-type {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: 4px;
      }
      
      .alert-type.critical { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      .alert-type.acceptable { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
      .alert-type.favorable { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
      .alert-type.none { background: rgba(107, 114, 128, 0.2); color: #6b7280; }
      
      .alert-time {
        font-size: 11px;
        color: var(--text-secondary, #888);
      }
      
      .alert-details {
        font-size: 13px;
        line-height: 1.5;
      }
      
      .alert-details .bookmaker {
        font-weight: 600;
        color: var(--accent, #00d4ff);
      }
      
      .alert-details .odds-comparison {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }
      
      .odds-old { text-decoration: line-through; color: var(--text-secondary, #888); }
      .odds-new { font-weight: 600; }
      .odds-change { font-size: 11px; }
      .odds-change.positive { color: #4ade80; }
      .odds-change.negative { color: #ef4444; }
      
      .alert-recommendation {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--border, #2a2a4a);
        font-size: 12px;
      }
      
      .recommendation-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        margin-right: 8px;
      }
      
      .recommendation-badge.proceed { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
      .recommendation-badge.retry { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
      .recommendation-badge.abort { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      
      .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary, #888);
        font-size: 14px;
      }
    `;
    
    document.head.appendChild(styles);
  }

  connectWebSocket() {
    const wsUrl = `ws://${window.location.hostname}:8081`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.updateConnectionStatus('connected');
        
        // Subscribe to slippage alerts
        this.send({
          type: 'subscribe',
          payload: {
            slippageTypes: ['acceptable', 'critical', 'favorable']
          }
        });
        
        // Request history
        this.send({
          type: 'getHistory',
          payload: { limit: 20 }
        });
      };
      
      this.ws.onclose = () => {
        this.updateConnectionStatus('disconnected');
        // Reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(), 5000);
      };
      
      this.ws.onerror = (error) => {
        console.error('Slippage WebSocket error:', error);
        this.updateConnectionStatus('disconnected');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Failed to connect to slippage WebSocket:', error);
      this.updateConnectionStatus('disconnected');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'slippageAlert':
        this.addAlert(message.payload);
        break;
      case 'history':
        this.loadHistory(message.payload.alerts);
        break;
      case 'betPlaced':
        this.handleBetPlaced(message.payload);
        break;
      case 'betAborted':
        this.handleBetAborted(message.payload);
        break;
      case 'config':
        this.updateConfigUI(message.payload.config);
        break;
    }
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(0, 50);
    }
    
    this.updateStats(alert);
    this.renderAlerts();
  }

  loadHistory(alerts) {
    this.alerts = alerts.reverse();
    this.renderAlerts();
  }

  updateStats(alert) {
    this.stats.totalChecks++;
    
    if (alert.result.slippageType === 'critical') {
      this.stats.criticalSlippage++;
    } else if (alert.result.slippageType === 'favorable') {
      this.stats.favorableSlippage++;
    }
    
    if (!alert.result.canProceed) {
      this.stats.blockedBets++;
    }
    
    this.renderStats();
  }

  renderStats() {
    document.getElementById('slippage-total-checks').textContent = this.stats.totalChecks;
    document.getElementById('slippage-blocked').textContent = this.stats.blockedBets;
    document.getElementById('slippage-favorable').textContent = this.stats.favorableSlippage;
    document.getElementById('slippage-critical').textContent = this.stats.criticalSlippage;
  }

  renderAlerts() {
    const container = document.getElementById('slippage-alerts-list');
    if (!container) return;
    
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    
    const filteredAlerts = activeFilter === 'all' 
      ? this.alerts 
      : this.alerts.filter(a => a.result.slippageType === activeFilter);
    
    if (filteredAlerts.length === 0) {
      container.innerHTML = '<div class="empty-state">No slippage alerts</div>';
      return;
    }
    
    container.innerHTML = filteredAlerts.map(alert => this.renderAlertItem(alert)).join('');
  }

  renderAlertItem(alert) {
    const { request, result, timestamp } = alert;
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString();
    
    const oddsChange = result.slippagePercent;
    const oddsChangeClass = oddsChange > 0 ? 'positive' : 'negative';
    const oddsChangeSign = oddsChange > 0 ? '+' : '';
    
    return `
      <div class="alert-item ${result.slippageType}">
        <div class="alert-header">
          <span class="alert-type ${result.slippageType}">${result.slippageType}</span>
          <span class="alert-time">${timeStr}</span>
        </div>
        <div class="alert-details">
          <div><span class="bookmaker">${request.bookmaker}</span> - ${request.market}</div>
          <div class="odds-comparison">
            <span class="odds-old">${request.requestedOdds.toFixed(2)}</span>
            <span>→</span>
            <span class="odds-new">${result.currentOdds.toFixed(2)}</span>
            <span class="odds-change ${oddsChangeClass}">${oddsChangeSign}${oddsChange.toFixed(2)}%</span>
          </div>
        </div>
        <div class="alert-recommendation">
          <span class="recommendation-badge ${result.recommendation}">${result.recommendation}</span>
          ${result.adjustedStake ? `<span>Adjusted stake: $${result.adjustedStake.toFixed(2)}</span>` : ''}
        </div>
      </div>
    `;
  }

  handleBetPlaced(payload) {
    // Could show a success notification
    console.log('Bet placed successfully:', payload);
  }

  handleBetAborted(payload) {
    // Could show an alert notification
    console.log('Bet aborted:', payload);
  }

  updateConnectionStatus(status) {
    const statusEl = document.getElementById('slippage-connection-status');
    if (!statusEl) return;
    
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    
    dot.className = `status-dot ${status}`;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  updateConfigUI(config) {
    document.getElementById('slippage-max').value = config.maxSlippagePercent;
    document.getElementById('slippage-critical-threshold').value = config.criticalSlippagePercent;
    document.getElementById('slippage-auto-retry').checked = config.autoRetry;
  }

  setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderAlerts();
      });
    });
    
    // Update config button
    const updateBtn = document.getElementById('slippage-update-config');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => this.updateConfig());
    }
  }

  updateConfig() {
    const maxSlippage = parseFloat(document.getElementById('slippage-max').value);
    const criticalThreshold = parseFloat(document.getElementById('slippage-critical-threshold').value);
    const autoRetry = document.getElementById('slippage-auto-retry').checked;
    
    this.send({
      type: 'updateConfig',
      payload: {
        maxSlippagePercent: maxSlippage,
        criticalSlippagePercent: criticalThreshold,
        autoRetry: autoRetry
      }
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SlippageProtectionWidget());
} else {
  new SlippageProtectionWidget();
}

export default SlippageProtectionWidget;
