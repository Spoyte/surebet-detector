// Surebet Detector Dashboard App

let currentConfig = null;

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

async function fetchMovements() {
    try {
        const response = await fetch('/api/movements');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch movements:', error);
        return null;
    }
}

async function fetchMovementStats() {
    try {
        const response = await fetch('/api/movements/stats');
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch movement stats:', error);
        return null;
    }
}

async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        currentConfig = await response.json();
        return currentConfig;
    } catch (error) {
        console.error('Failed to fetch config:', error);
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
    document.getElementById('suspicious-count').textContent = data.suspicious?.length || 0;
    
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
    
    // Render suspicious odds
    renderSuspiciousList(data.suspicious || []);
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
    
    container.innerHTML = arbitrage.map(arb => {
        const qualityBadge = arb.qualityScore ? getQualityBadge(arb.quality, arb.qualityScore) : '';
        const recommendation = arb.qualityDetails?.recommendation;
        
        return `
        <div class="opportunity-card arbitrage ${arb.quality || ''}">
            <div class="opportunity-header">
                <div>
                    <div class="opportunity-title">${escapeHtml(arb.event)}</div>
                    <div class="opportunity-sport">${escapeHtml(arb.sport)} · ${formatTime(arb.commenceTime)} ${qualityBadge}</div>
                </div>
                <div class="opportunity-profit">
                    <div class="profit-value">+${arb.profitPercent}%</div>
                    <div class="profit-label">Guaranteed</div>
                </div>
            </div>            
            ${recommendation ? `<div class="quality-recommendation ${recommendation.action}">
                <span class="rec-icon">${getActionIcon(recommendation.action)}</span>
                <span class="rec-text">${escapeHtml(recommendation.message)}</span>
            </div>` : ''}
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
    `}).join('');
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

// Settings Modal Functions
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('active');
    
    if (modal.classList.contains('active')) {
        loadSettingsIntoForm();
    }
}

async function loadSettingsIntoForm() {
    const config = await fetchConfig();
    if (!config) return;
    
    // Set threshold values
    setInputValue('evThresholds.minEVPercent', config.evThresholds?.minEVPercent);
    setInputValue('evThresholds.maxEVPercent', config.evThresholds?.maxEVPercent);
    setInputValue('evThresholds.minArbitrageProfit', config.evThresholds?.minArbitrageProfit);
    
    // Set sports checkboxes
    setCheckboxValues('sports.enabled', config.sports?.enabled);
    
    // Set bookmakers checkboxes
    setCheckboxValues('bookmakers.enabled', config.bookmakers?.enabled);
    setCheckboxValue('bookmakers.requirePinnacle', config.bookmakers?.requirePinnacle);
    
    // Set timing values
    const minHours = Math.floor((config.timing?.minTimeToEvent || 0) / 60);
    const maxHours = Math.floor((config.timing?.maxTimeToEvent || 10080) / 60);
    setInputValue('timing.minTimeToEvent', minHours);
    setInputValue('timing.maxTimeToEvent', maxHours);
    
    setCheckboxValue('timing.quietHours.enabled', config.timing?.quietHours?.enabled);
    setInputValue('timing.quietHours.start', config.timing?.quietHours?.start);
    setInputValue('timing.quietHours.end', config.timing?.quietHours?.end);
    
    // Toggle quiet hours row visibility
    const quietHoursRow = document.querySelector('.quiet-hours-row');
    if (quietHoursRow) {
        quietHoursRow.style.display = config.timing?.quietHours?.enabled ? 'grid' : 'none';
    }
    
    // Set alert values
    setCheckboxValue('alerts.telegram.enabled', config.alerts?.telegram?.enabled);
    setInputValue('alerts.telegram.minEVForAlert', config.alerts?.telegram?.minEVForAlert);
    setInputValue('alerts.telegram.minArbitrageForAlert', config.alerts?.telegram?.minArbitrageForAlert);
    setCheckboxValue('alerts.telegram.quietHoursRespected', config.alerts?.telegram?.quietHoursRespected);
}

function setInputValue(name, value) {
    const input = document.querySelector(`[name="${name}"]`);
    if (input && value !== undefined) {
        input.value = value;
    }
}

function setCheckboxValue(name, checked) {
    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
        input.checked = !!checked;
    }
}

function setCheckboxValues(name, values) {
    if (!Array.isArray(values)) return;
    const inputs = document.querySelectorAll(`[name="${name}"]`);
    inputs.forEach(input => {
        input.checked = values.includes(input.value);
    });
}

function getCheckboxValues(name) {
    const inputs = document.querySelectorAll(`[name="${name}"]:checked`);
    return Array.from(inputs).map(input => input.value);
}

async function saveSettings() {
    const form = document.getElementById('settings-form');
    const formData = new FormData(form);
    
    // Build config object from form
    const config = {
        evThresholds: {
            minEVPercent: parseFloat(formData.get('evThresholds.minEVPercent')),
            maxEVPercent: parseFloat(formData.get('evThresholds.maxEVPercent')),
            minArbitrageProfit: parseFloat(formData.get('evThresholds.minArbitrageProfit'))
        },
        sports: {
            enabled: getCheckboxValues('sports.enabled')
        },
        bookmakers: {
            enabled: getCheckboxValues('bookmakers.enabled'),
            requirePinnacle: document.querySelector('[name="bookmakers.requirePinnacle"]').checked
        },
        timing: {
            minTimeToEvent: parseInt(formData.get('timing.minTimeToEvent')) * 60,
            maxTimeToEvent: parseInt(formData.get('timing.maxTimeToEvent')) * 60,
            quietHours: {
                enabled: document.querySelector('[name="timing.quietHours.enabled"]').checked,
                start: formData.get('timing.quietHours.start'),
                end: formData.get('timing.quietHours.end')
            }
        },
        alerts: {
            telegram: {
                enabled: document.querySelector('[name="alerts.telegram.enabled"]').checked,
                minEVForAlert: parseFloat(formData.get('alerts.telegram.minEVForAlert')),
                minArbitrageForAlert: parseFloat(formData.get('alerts.telegram.minArbitrageForAlert')),
                quietHoursRespected: document.querySelector('[name="alerts.telegram.quietHoursRespected"]').checked
            }
        }
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            toggleSettings();
            // Refresh data with new filters
            const opportunities = await fetchOpportunities();
            renderDashboard(opportunities);
        } else {
            alert('Failed to save settings');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings');
    }
}

async function resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    
    try {
        const response = await fetch('/api/config/reset', { method: 'POST' });
        if (response.ok) {
            loadSettingsIntoForm();
            const opportunities = await fetchOpportunities();
            renderDashboard(opportunities);
        }
    } catch (error) {
        console.error('Failed to reset settings:', error);
    }
}

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Quiet hours toggle
function setupQuietHoursToggle() {
    const checkbox = document.querySelector('[name="timing.quietHours.enabled"]');
    if (checkbox) {
        checkbox.addEventListener('change', (e) => {
            const row = document.querySelector('.quiet-hours-row');
            if (row) {
                row.style.display = e.target.checked ? 'grid' : 'none';
            }
        });
    }
}

// Report dates setup
function setupReportDates() {
    const endDate = document.getElementById('report-end-date');
    const startDate = document.getElementById('report-start-date');
    
    if (endDate && startDate) {
        // Set default dates (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        endDate.value = today.toISOString().split('T')[0];
        startDate.value = thirtyDaysAgo.toISOString().split('T')[0];
    }
}

// Generate report
async function generateReport() {
    const startDate = document.getElementById('report-start-date')?.value;
    const endDate = document.getElementById('report-end-date')?.value;
    const format = document.getElementById('report-format')?.value || 'csv';
    
    const btn = document.querySelector('.report-controls .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '📥 Generating...';
    
    try {
        const response = await fetch('/api/reports/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, format })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Download the file
            window.location.href = `/api/reports/download/${data.filename}`;
            // Refresh the reports list
            setTimeout(loadReportsList, 1000);
        } else {
            alert('Failed to generate report');
        }
    } catch (error) {
        console.error('Failed to generate report:', error);
        alert('Failed to generate report');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Load reports list
async function loadReportsList() {
    try {
        const response = await fetch('/api/reports');
        const reports = await response.json();
        
        const tbody = document.querySelector('#reports-table tbody');
        if (!tbody) return;
        
        if (reports.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="empty-state">No reports generated yet</td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = reports.map(r => `
            <tr>
                <td>${escapeHtml(r.filename)}</td>
                <td>${formatTime(r.created)}</td>
                <td>
                    <a href="/api/reports/download/${encodeURIComponent(r.filename)}" class="btn btn-secondary" style="padding: 0.5rem 1rem;">
                        Download
                    </a>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Failed to load reports:', error);
    }
}

// Render suspicious odds list
function renderSuspiciousList(suspicious) {
    const container = document.getElementById('suspicious-list');
    if (!container) return;
    
    if (suspicious.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">✅</div>
                <p>No suspicious odds detected</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">All odds look normal</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = suspicious.slice(0, 10).map(item => `
        <div class="opportunity-card suspicious">
            <div class="opportunity-header">
                <span class="sport-tag">${escapeHtml(item.sport)}</span>
                <span class="ev-badge">${item.ratio?.toFixed(2)}x</span>
            </div>
            <h4 class="opportunity-title">${escapeHtml(item.event)}</h4>
            <p class="opportunity-outcome">${escapeHtml(item.outcome)} @ ${escapeHtml(item.bookmaker)}</p>
            <div class="opportunity-odds">
                <span>Odds: ${item.odds}</span>
                ${item.pinnacleOdds ? `<span class="pinnacle-odds">Pinnacle: ${item.pinnacleOdds}</span>` : ''}
                ${item.consensusOdds ? `<span class="consensus-odds">Consensus: ${item.consensusOdds}</span>` : ''}
            </div>
            <p class="opportunity-note" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">
                ${escapeHtml(item.note || '')}
            </p>
        </div>
    `).join('');
}

// Quality scoring helper functions
function getQualityBadge(quality, score) {
    const badges = {
        'excellent': { icon: '⭐', class: 'quality-excellent', label: 'Excellent' },
        'good': { icon: '✓', class: 'quality-good', label: 'Good' },
        'fair': { icon: '~', class: 'quality-fair', label: 'Fair' },
        'poor': { icon: '⚠', class: 'quality-poor', label: 'Poor' },
        'very-poor': { icon: '✗', class: 'quality-very-poor', label: 'Very Poor' }
    };
    
    const badge = badges[quality] || badges.fair;
    return `<span class="quality-badge ${badge.class}" title="Quality Score: ${score}/100">${badge.icon} ${badge.label} (${score})</span>`;
}

function getActionIcon(action) {
    const icons = {
        'take-immediately': '🚀',
        'take': '✓',
        'take-caution': '⚠',
        'skip-or-minimal': '⊘',
        'skip': '✗'
    };
    return icons[action] || '•';
}

// Render odds movement data
function renderMovements(data) {
    if (!data) return;
    
    // Update summary counts
    const movementCount = document.getElementById('movement-count');
    const arbCount = document.getElementById('movement-arb-count');
    const evCount = document.getElementById('movement-ev-count');
    const stats = document.getElementById('movement-stats');
    
    if (movementCount) movementCount.textContent = data.summary?.significantMovements || 0;
    if (arbCount) arbCount.textContent = data.summary?.newArbitrage || 0;
    if (evCount) evCount.textContent = data.summary?.newEV || 0;
    if (stats) {
        const lastUpdate = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A';
        stats.textContent = `Last update: ${lastUpdate}`;
    }
    
    // Render movement alerts (arbitrage and EV from movements)
    renderMovementAlerts(data);
    
    // Render movements table
    renderMovementsTable(data.movements || []);
}

function renderMovementAlerts(data) {
    const container = document.getElementById('movement-alerts-list');
    if (!container) return;
    
    const alerts = [];
    
    // Add arbitrage opportunities from movements
    if (data.arbitrageFromMovements) {
        alerts.push(...data.arbitrageFromMovements.map(arb => ({
            type: 'arbitrage',
            ...arb
        })));
    }
    
    // Add EV opportunities from movements
    if (data.evFromMovements) {
        alerts.push(...data.evFromMovements.map(ev => ({
            type: 'ev',
            ...ev
        })));
    }
    
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <p>No new opportunities from recent movements</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Odds are stable</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = alerts.slice(0, 6).map(alert => {
        if (alert.type === 'arbitrage') {
            return `
                <div class="opportunity-card arbitrage movement-alert">
                    <div class="alert-badge">🚨 From Movement</div>
                    <div class="opportunity-header">
                        <span class="sport-tag">${escapeHtml(alert.sport)}</span>
                        <span class="profit-badge">${alert.profitPercent.toFixed(2)}%</span>
                    </div>
                    <h4 class="opportunity-title">${escapeHtml(alert.eventName)}</h4>
                    <div class="opportunity-legs">
                        ${alert.legs.map(leg => `
                            <div class="leg">
                                <span class="bookmaker">${escapeHtml(leg.bookmaker)}</span>
                                <span class="outcome">${escapeHtml(leg.outcome)}</span>
                                <span class="odds">${leg.odds}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="opportunity-card ev movement-alert">
                    <div class="alert-badge">📈 From Movement</div>
                    <div class="opportunity-header">
                        <span class="sport-tag">${escapeHtml(alert.sport)}</span>
                        <span class="ev-badge">+${alert.evPercent.toFixed(2)}%</span>
                    </div>
                    <h4 class="opportunity-title">${escapeHtml(alert.eventName)}</h4>
                    <p class="opportunity-outcome">${escapeHtml(alert.outcome)} @ ${escapeHtml(alert.bookmaker)}</p>
                    <div class="opportunity-odds">
                        <span>Odds: ${alert.odds}</span>
                        ${alert.sharpOdds ? `<span class="pinnacle-odds">Sharp: ${alert.sharpOdds}</span>` : ''}
                    </div>
                    <div class="movement-info" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        Was: ${alert.previousOdds} → Now: ${alert.odds} (${alert.movementChange > 0 ? '+' : ''}${alert.movementChange}%)
                    </div>
                </div>
            `;
        }
    }).join('');
}

function renderMovementsTable(movements) {
    const tbody = document.querySelector('#movements-table tbody');
    if (!tbody) return;
    
    if (movements.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">No significant movements detected</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = movements.slice(0, 20).map(m => {
        const changeClass = m.direction === 'up' ? 'positive' : 'negative';
        const changeSymbol = m.direction === 'up' ? '↑' : '↓';
        return `
            <tr>
                <td>${escapeHtml(m.eventName)}</td>
                <td>${escapeHtml(m.bookmaker)}</td>
                <td>${escapeHtml(m.outcome)}</td>
                <td class="${changeClass}">
                    ${changeSymbol} ${Math.abs(parseFloat(m.changePercent)).toFixed(1)}%
                    <small>(${m.previousOdds} → ${m.currentOdds})</small>
                </td>
                <td>${formatTime(m.timestamp)}</td>
            </tr>
        `;
    }).join('');
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
    
    // Load movement data
    const movements = await fetchMovements();
    renderMovements(movements);
    
    // Setup UI
    setupTabs();
    setupQuietHoursToggle();
    setupReportDates();
    
    // Load reports list
    loadReportsList();
    
    // Auto-refresh every 5 minutes
    setInterval(async () => {
        const newData = await fetchOpportunities();
        renderDashboard(newData);
        
        const newMovements = await fetchMovements();
        renderMovements(newMovements);
    }, 5 * 60 * 1000);
});
