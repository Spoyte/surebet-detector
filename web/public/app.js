// Surebet Detector Dashboard App

async function fetchOpportunities() {
    try {
        const response = await fetch('/api/opportunities');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch opportunities:', error);
        return null;
    }
}

async function fetchHistory() {
    try {
        const response = await fetch('/api/history');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch history:', error);
        return [];
    }
}

async function fetchForex() {
    try {
        const response = await fetch('/api/forex');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch forex:', error);
        return null;
    }
}

async function refreshData() {
    const btn = document.querySelector('.btn-primary');
    btn.disabled = true;
    btn.textContent = '🔄 Refreshing...';
    
    try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            renderDashboard(data.opportunities);
        }
    } catch (error) {
        console.error('Refresh failed:', error);
        alert('Refresh failed. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Refresh Now';
    }
}

function renderDashboard(data) {
    if (!data) return;
    
    // Update summary counts
    document.getElementById('arb-count').textContent = data.arbitrage?.length || 0;
    document.getElementById('ev-count').textContent = data.positiveEV?.length || 0;
    document.getElementById('promo-count').textContent = data.promotions?.length || 0;
    
    // Update last update time
    if (data.timestamp) {
        const date = new Date(data.timestamp);
        document.getElementById('last-update').textContent = 
            `Last update: ${date.toLocaleTimeString()}`;
    }
    
    // Render arbitrage opportunities
    renderArbitrageList(data.arbitrage || []);
    
    // Render EV opportunities
    renderEVList(data.positiveEV || []);
}

function renderArbitrageList(arbitrage) {
    const container = document.getElementById('arbitrage-list');
    
    if (arbitrage.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p>No arbitrage opportunities found</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Try refreshing or check back later</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = arbitrage.map(arb => `
        <div class="opportunity-card arbitrage">
            <div class="opportunity-header">
                <div>
                    <div class="opportunity-title">${escapeHtml(arb.event)}</div>
                    <div class="opportunity-sport">${escapeHtml(arb.sport)} · ${formatTime(arb.commenceTime)}</div>
                </div>
                <div class="opportunity-profit">
                    <div class="profit-value">+${arb.profitPercent}%</div>
                    <div class="profit-label">Guaranteed</div>
                </div>
            </div>
            <div class="opportunity-legs">
                ${arb.legs.map(leg => `
                    <div class="leg">
                        <div class="leg-info">
                            <span class="leg-outcome">${escapeHtml(leg.outcome)}</span>
                            <span class="leg-bookmaker">${escapeHtml(leg.bookmaker)}${leg.currency ? ` · ${leg.currency}` : ''}</span>
                        </div>
                        <span class="leg-odds">${leg.odds}</span>
                    </div>
                `).join('')}
            </div>
            ${arb.note ? `<div class="opportunity-note">${escapeHtml(arb.note)}</div>` : ''}
        </div>
    `).join('');
}

function renderEVList(evOpportunities) {
    const container = document.getElementById('ev-list');
    
    if (evOpportunities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <p>No +EV opportunities found</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Try adjusting your minimum EV threshold</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = evOpportunities.map(ev => `
        <div class="opportunity-card ev">
            <div class="opportunity-header">
                <div>
                    <div class="opportunity-title">${escapeHtml(ev.outcome)}</div>
                    <div class="opportunity-sport">${escapeHtml(ev.event)} · ${escapeHtml(ev.bookmaker)}</div>
                </div>
                <div class="opportunity-profit">
                    <div class="profit-value" style="color: #818cf8;">+${ev.evPercent}%</div>
                    <div class="profit-label">Expected Value</div>
                </div>
            </div>
            <div class="opportunity-legs">
                <div class="leg">
                    <div class="leg-info">
                        <span class="leg-outcome">Current odds</span>
                        <span class="leg-bookmaker">True probability: ${ev.trueProbability}%</span>
                    </div>
                    <span class="leg-odds" style="color: #818cf8;">${ev.odds}</span>
                </div>
                <div class="leg">
                    <div class="leg-info">
                        <span class="leg-outcome">Pinnacle (sharp)</span>
                        <span class="leg-bookmaker">Baseline for true odds</span>
                    </div>
                    <span class="leg-odds" style="color: var(--text-secondary);">${ev.pinnacleOdds}</span>
                </div>
            </div>
            ${ev.note ? `<div class="opportunity-note">${escapeHtml(ev.note)}</div>` : ''}
        </div>
    `).join('');
}

function renderHistory(history) {
    const tbody = document.querySelector('#history-table tbody');
    
    if (history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="empty-state">No history available yet</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = history.map(h => `
        <tr>
            <td>${formatTime(h.timestamp)}</td>
            <td>${h.arbitrageCount}</td>
            <td>${h.evCount}</td>
        </tr>
    `).join('');
}

function updateForexDisplay(forex) {
    if (forex && forex.USD_EUR) {
        document.getElementById('forex-rate').textContent = 
            `EUR/USD: ${forex.USD_EUR.toFixed(4)}`;
    }
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load initial data
    const opportunities = await fetchOpportunities();
    renderDashboard(opportunities);
    
    const history = await fetchHistory();
    renderHistory(history);
    
    const forex = await fetchForex();
    updateForexDisplay(forex);
    
    // Auto-refresh every 5 minutes
    setInterval(async () => {
        const newData = await fetchOpportunities();
        renderDashboard(newData);
    }, 5 * 60 * 1000);
});
