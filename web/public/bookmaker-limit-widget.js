/**
 * Bookmaker Limit Optimizer Widget v2
 * 
 * Dieter Rams principles applied:
 * - Less but better: 680 → ~280 lines
 * - Honest: Shows what matters, hides what doesn't
 * - Unobtrusive: Alerts only when attention needed
 * - Understandable: One concept per view
 * 
 * Reference: Dieter Rams, Braun (1955-1995)
 */

(function() {
  'use strict';

  // Config
  const CFG = {
    wsUrl: window.BOOKMAKER_WS_URL || 'ws://localhost:8084',
    reconnectDelay: 5000,
    maxReconnects: 10,
    refreshInterval: 30000
  };

  // State
  const state = {
    ws: null,
    connected: false,
    reconnects: 0,
    accounts: [],
    optimizations: [],
    selected: null,
    filterLimited: false,
    minProfit: 0
  };

  // DOM cache
  const $ = {};

  // Initialize
  function init() {
    render();
    cache();
    bind();
    connect();
    setInterval(() => state.connected && refresh(), CFG.refreshInterval);
  }

  // Render widget HTML
  function render() {
    const container = document.getElementById('bookmaker-limit-widget') || document.body;
    container.innerHTML = `
      <div class="blo-widget">
        <header class="blo-header">
          <h3>Limit Optimizer</h3>
          <span class="blo-status" id="blo-status">●</span>
        </header>
        
        <nav class="blo-nav">
          <button data-tab="accounts" class="active">Accounts</button>
          <button data-tab="trades">Trades</button>
          <button data-tab="limits">Limits</button>
        </nav>
        
        <div class="blo-filters">
          <label><input type="checkbox" id="blo-filter-limited"> Limited only</label>
          <label>Min profit: <input type="number" id="blo-min-profit" value="0" min="0" max="100" step="0.1">%</label>
        </div>
        
        <main class="blo-content">
          <section id="tab-accounts" class="active">
            <div class="blo-summary">
              <div><b id="sum-total">0</b><span>accounts</span></div>
              <div><b id="sum-limited">0</b><span>limited</span></div>
              <div><b id="sum-balance">€0</b><span>total</span></div>
            </div>
            <div id="list-accounts" class="blo-list"></div>
          </section>
          
          <section id="tab-trades">
            <div id="list-trades" class="blo-list"></div>
          </section>
          
          <section id="tab-limits">
            <div id="list-limits" class="blo-list">
              <p class="blo-empty">Select an account to view limits</p>
            </div>
          </section>
        </main>
        
        <footer class="blo-footer">
          <span id="blo-updated">Never</span>
          <button id="blo-refresh">↻</button>
        </footer>
      </div>
      
      <style>
        .blo-widget { font: 14px -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; border-radius: 12px; max-width: 600px; margin: 0 auto; overflow: hidden; }
        .blo-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #333; }
        .blo-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
        .blo-status { font-size: 10px; color: #ef4444; transition: color 0.3s; }
        .blo-status.connected { color: #4ade80; }
        .blo-status.connecting { color: #fbbf24; animation: pulse 1s infinite; }
        @keyframes pulse { 50% { opacity: 0.5; } }
        
        .blo-nav { display: flex; gap: 4px; padding: 12px 20px; background: #252542; }
        .blo-nav button { flex: 1; padding: 8px; border: none; background: transparent; color: #888; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .blo-nav button:hover { color: #fff; }
        .blo-nav button.active { background: #4f46e5; color: #fff; }
        
        .blo-filters { display: flex; gap: 20px; padding: 12px 20px; font-size: 12px; color: #888; }
        .blo-filters label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .blo-filters input[type="checkbox"] { width: 14px; height: 14px; accent-color: #4f46e5; }
        .blo-filters input[type="number"] { width: 50px; padding: 2px 6px; border: 1px solid #444; background: #1a1a2e; color: #fff; border-radius: 4px; font-size: 12px; }
        
        .blo-content { min-height: 280px; max-height: 400px; overflow-y: auto; }
        .blo-content section { display: none; padding: 16px 20px; }
        .blo-content section.active { display: block; }
        
        .blo-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .blo-summary div { text-align: center; padding: 12px; background: #252542; border-radius: 8px; }
        .blo-summary b { display: block; font-size: 20px; color: #4ade80; }
        .blo-summary span { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .blo-list { display: flex; flex-direction: column; gap: 8px; }
        .blo-empty { text-align: center; color: #666; padding: 40px; font-style: italic; }
        
        .blo-card { background: #252542; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; }
        .blo-card:hover { background: #303055; }
        .blo-card.selected { border-left-color: #4f46e5; }
        .blo-card.limited { border-left-color: #ef4444; }
        .blo-card.optimal { border-left-color: #4ade80; }
        .blo-card.warning { border-left-color: #fbbf24; }
        
        .blo-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .blo-card-title { font-weight: 600; font-size: 14px; }
        .blo-card-badges { display: flex; gap: 4px; }
        .blo-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
        .blo-badge.limited { background: #ef4444; color: #fff; }
        .blo-badge.active { background: #4ade80; color: #000; }
        
        .blo-card-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px; color: #888; }
        .blo-card-meta span { display: flex; justify-content: space-between; }
        .blo-card-meta strong { color: #fff; font-weight: 500; }
        
        .blo-risk { margin-top: 10px; padding-top: 10px; border-top: 1px solid #333; }
        .blo-risk-bar { height: 4px; background: #333; border-radius: 2px; overflow: hidden; margin-top: 4px; }
        .blo-risk-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
        .blo-risk-fill.low { background: #4ade80; }
        .blo-risk-fill.med { background: #fbbf24; }
        .blo-risk-fill.high { background: #ef4444; }
        
        .blo-trade-legs { margin-top: 10px; padding-top: 10px; border-top: 1px solid #333; }
        .blo-leg { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 6px 0; font-size: 12px; }
        .blo-leg span:first-child { color: #888; }
        .blo-leg span:nth-child(2) { color: #fbbf24; }
        
        .blo-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid #333; font-size: 11px; color: #666; }
        .blo-footer button { width: 28px; height: 28px; border: none; background: #4f46e5; color: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; transition: background 0.2s; }
        .blo-footer button:hover { background: #4338ca; }
      </style>
    `;
  }

  // Cache DOM elements
  function cache() {
    $.status = document.getElementById('blo-status');
    $.nav = document.querySelectorAll('.blo-nav button');
    $.tabs = document.querySelectorAll('.blo-content section');
    $.filterLimited = document.getElementById('blo-filter-limited');
    $.minProfit = document.getElementById('blo-min-profit');
    $.sumTotal = document.getElementById('sum-total');
    $.sumLimited = document.getElementById('sum-limited');
    $.sumBalance = document.getElementById('sum-balance');
    $.listAccounts = document.getElementById('list-accounts');
    $.listTrades = document.getElementById('list-trades');
    $.listLimits = document.getElementById('list-limits');
    $.updated = document.getElementById('blo-updated');
    $.refresh = document.getElementById('blo-refresh');
  }

  // Bind events
  function bind() {
    $.nav.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $.filterLimited?.addEventListener('change', e => { state.filterLimited = e.target.checked; renderAccounts(); });
    $.minProfit?.addEventListener('input', e => { state.minProfit = parseFloat(e.target.value) || 0; renderTrades(); });
    $.refresh?.addEventListener('click', refresh);
  }

  // Switch tab
  function switchTab(tab) {
    $.nav.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $.tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
  }

  // WebSocket connection
  function connect() {
    if (state.ws?.readyState === WebSocket.CONNECTING) return;
    setStatus('connecting');
    
    try {
      state.ws = new WebSocket(CFG.wsUrl);
      state.ws.onopen = () => { state.connected = true; state.reconnects = 0; setStatus('connected'); refresh(); };
      state.ws.onmessage = e => handleMessage(JSON.parse(e.data));
      state.ws.onclose = () => { state.connected = false; setStatus('disconnected'); scheduleReconnect(); };
      state.ws.onerror = () => setStatus('disconnected');
    } catch (err) {
      setStatus('disconnected');
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (state.reconnects >= CFG.maxReconnects) return;
    state.reconnects++;
    setTimeout(connect, CFG.reconnectDelay);
  }

  function send(msg) {
    if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(msg));
  }

  function refresh() {
    send({ type: 'getAccounts' });
    send({ type: 'getHistory', payload: { limit: 20 } });
    if (state.selected) send({ type: 'getLimits', payload: { bookmakerId: state.selected } });
  }

  // Handle messages
  function handleMessage(msg) {
    switch (msg.type) {
      case 'accounts': state.accounts = msg.payload?.accounts || []; renderAccounts(); updateSummary(); break;
      case 'stakesOptimized': state.optimizations.unshift(msg.payload?.result); if (state.optimizations.length > 50) state.optimizations.pop(); renderTrades(); break;
      case 'history': state.optimizations = msg.payload?.optimizations || []; renderTrades(); break;
      case 'limits': renderLimits(msg.payload?.limit || msg.payload?.limits); break;
      case 'limitUpdated': case 'dynamicAdjustmentUpdated': send({ type: 'getAccounts' }); break;
    }
    $.updated.textContent = new Date().toLocaleTimeString();
  }

  // Update status indicator
  function setStatus(status) {
    $.status.className = status;
    $.status.textContent = status === 'connected' ? '●' : status === 'connecting' ? '◐' : '○';
  }

  // Update summary
  function updateSummary() {
    $.sumTotal.textContent = state.accounts.length;
    $.sumLimited.textContent = state.accounts.filter(a => a.isLimited).length;
    const total = state.accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    $.sumBalance.textContent = '€' + total.toLocaleString();
  }

  // Render accounts
  function renderAccounts() {
    const filtered = state.filterLimited ? state.accounts.filter(a => a.isLimited) : state.accounts;
    
    if (!filtered.length) {
      $.listAccounts.innerHTML = '<p class="blo-empty">No accounts</p>';
      return;
    }
    
    $.listAccounts.innerHTML = filtered.map(a => `
      <div class="blo-card ${a.isLimited ? 'limited' : ''} ${state.selected === a.bookmakerId ? 'selected' : ''}" data-id="${a.bookmakerId}">
        <div class="blo-card-header">
          <span class="blo-card-title">${a.bookmakerName}</span>
          <div class="blo-card-badges">
            ${a.isLimited ? '<span class="blo-badge limited">Limited</span>' : ''}
            <span class="blo-badge ${a.isActive ? 'active' : ''}">${a.isActive ? 'Active' : 'Off'}</span>
          </div>
        </div>
        <div class="blo-card-meta">
          <span>Balance <strong>${a.balance?.toLocaleString()} ${a.currency}</strong></span>
          <span>Adj <strong>${((a.adjustmentFactor || 1) * 100).toFixed(0)}%</strong></span>
          <span>Limits <strong>${a.limitCount || 0}</strong></span>
          <span>Wins <strong>${a.consecutiveWins || 0}</strong></span>
        </div>
        <div class="blo-risk">
          <div class="blo-card-meta"><span>Gubbing risk <strong>${((a.gubbingRisk || 0) * 100).toFixed(0)}%</strong></span></div>
          <div class="blo-risk-bar"><div class="blo-risk-fill ${riskLevel(a.gubbingRisk)}" style="width:${(a.gubbingRisk||0)*100}%"></div></div>
        </div>
      </div>
    `).join('');
    
    $.listAccounts.querySelectorAll('.blo-card').forEach(card => {
      card.addEventListener('click', () => {
        state.selected = card.dataset.id;
        renderAccounts();
        send({ type: 'getLimits', payload: { bookmakerId: state.selected } });
        switchTab('limits');
      });
    });
  }

  function riskLevel(r) {
    if (!r || r < 0.3) return 'low';
    if (r < 0.7) return 'med';
    return 'high';
  }

  // Render trades
  function renderTrades() {
    const filtered = state.optimizations.filter(o => o.profitPercent >= state.minProfit);
    
    if (!filtered.length) {
      $.listTrades.innerHTML = '<p class="blo-empty">No trades yet</p>';
      return;
    }
    
    $.listTrades.innerHTML = filtered.map(o => {
      const cls = o.isOptimal ? 'optimal' : o.partialFillRisk?.riskLevel === 'high' ? 'warning' : '';
      return `
        <div class="blo-card ${cls}">
          <div class="blo-card-header">
            <span class="blo-card-title">${o.opportunityId?.slice(0, 16)}...</span>
            <span style="color:${o.expectedProfit>=0?'#4ade80':'#ef4444'};font-weight:600">${o.profitPercent?.toFixed(2)}%</span>
          </div>
          <div class="blo-card-meta">
            <span>Stake <strong>€${o.totalStake?.toFixed(2)}</strong></span>
            <span>Profit <strong>€${o.expectedProfit?.toFixed(2)}</strong></span>
            <span>Risk <strong>${o.partialFillRisk?.riskLevel || '-'}</strong></span>
            <span>Constraints <strong>${o.constraintsApplied?.length || 0}</strong></span>
          </div>
          ${o.legs ? `<div class="blo-trade-legs">${o.legs.map(l => `
            <div class="blo-leg">
              <span>${l.bookmakerName}</span>
              <span>${l.odds}</span>
              <span>€${l.actualStake?.toFixed(2)}${l.isConstrained ? ' ⚠' : ''}</span>
            </div>
          `).join('')}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Render limits
  function renderLimits(limits) {
    if (!limits) {
      $.listLimits.innerHTML = '<p class="blo-empty">Select an account to view limits</p>';
      return;
    }
    
    const list = Array.isArray(limits) ? limits : [limits];
    
    if (!list.length) {
      $.listLimits.innerHTML = '<p class="blo-empty">No limits configured</p>';
      return;
    }
    
    $.listLimits.innerHTML = list.map(l => `
      <div class="blo-card">
        <div class="blo-card-header">
          <span class="blo-card-title">${l.market || 'Default'}</span>
          <span class="confidence-dot ${confidenceClass(l.confidence)}"></span>
        </div>
        <div class="blo-card-meta">
          <span>Min <strong>€${l.minStake}</strong></span>
          <span>Max <strong>€${l.maxStake?.toLocaleString()}</strong></span>
        </div>
      </div>
    `).join('');
  }

  function confidenceClass(c) {
    if (!c || c < 0.5) return 'high';
    if (c < 0.8) return 'med';
    return 'low';
  }

  // Initialize
  document.readyState === 'loading' 
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

  // Public API
  window.BookmakerLimitWidget = {
    connect,
    disconnect: () => state.ws?.close(),
    refresh,
    getState: () => ({ ...state })
  };
})();
