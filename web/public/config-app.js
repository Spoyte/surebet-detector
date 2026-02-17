/** Configuration Management UI */

let currentConfig = null;
let configSchema = null;
let hasUnsavedChanges = false;

// Section definitions with icons and descriptions
const sectionDefinitions = {
    thresholds: {
        icon: '🎯',
        title: 'Profit Thresholds',
        description: 'Configure minimum profit and EV thresholds for opportunities'
    },
    stakes: {
        icon: '💰',
        title: 'Stake & Bankroll',
        description: 'Manage stake sizes, bankroll limits, and betting parameters'
    },
    bookmakers: {
        icon: '📚',
        title: 'Bookmakers',
        description: 'Enable/disable bookmakers and configure API settings'
    },
    sports: {
        icon: '⚽',
        title: 'Sports & Markets',
        description: 'Select which sports and leagues to monitor'
    },
    markets: {
        icon: '📊',
        title: 'Market Types',
        description: 'Configure which betting markets to analyze'
    },
    timing: {
        icon: '⏰',
        title: 'Timing & Scheduling',
        description: 'Set refresh intervals, time ranges, and quiet hours'
    },
    alerts: {
        icon: '🔔',
        title: 'Alerts & Notifications',
        description: 'Configure notification channels and alert thresholds'
    },
    display: {
        icon: '🖥️',
        title: 'Display Settings',
        description: 'Customize dashboard appearance and layout'
    },
    risk: {
        icon: '🛡️',
        title: 'Risk Management',
        description: 'Set loss limits, exposure controls, and safety measures'
    },
    data: {
        icon: '💾',
        title: 'Data & Storage',
        description: 'Configure data retention, backups, and exports'
    },
    circuitBreaker: {
        icon: '⚡',
        title: 'Circuit Breaker',
        description: 'API failure detection and automatic recovery settings'
    },
    advanced: {
        icon: '⚙️',
        title: 'Advanced',
        description: 'Advanced features and experimental settings'
    },
    security: {
        icon: '🔒',
        title: 'Security',
        description: 'Authentication, sessions, and security settings'
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadSchema();
    renderSidebar();
    renderSections();
    setupEventListeners();
    updateStatus('saved');
});

async function loadConfig() {
    try {
        const response = await fetch('/api/config-manager');
        currentConfig = await response.json();
    } catch (error) {
        console.error('Failed to load config:', error);
        showAlert('Failed to load configuration', 'error');
    }
}

async function loadSchema() {
    try {
        const response = await fetch('/api/config-manager/schema');
        configSchema = await response.json();
    } catch (error) {
        console.error('Failed to load schema:', error);
    }
}

function renderSidebar() {
    const nav = document.getElementById('config-nav');
    nav.innerHTML = '';
    
    Object.keys(sectionDefinitions).forEach(key => {
        const section = sectionDefinitions[key];
        const item = document.createElement('a');
        item.className = 'config-nav-item';
        item.href = `#${key}`;
        item.innerHTML = `
            <span class="config-nav-icon">${section.icon}</span>
            <span>${section.title}</span>
        `;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToSection(key);
            setActiveNavItem(key);
        });
        nav.appendChild(item);
    });
}

function renderSections() {
    const container = document.getElementById('config-sections');
    container.innerHTML = '';
    
    Object.keys(sectionDefinitions).forEach(key => {
        const section = sectionDefinitions[key];
        const sectionData = currentConfig[key] || {};
        
        const sectionEl = document.createElement('div');
        sectionEl.className = `config-section section-${key}`;
        sectionEl.id = key;
        
        sectionEl.innerHTML = `
            <h2 class="config-section-title">${section.icon} ${section.title}</h2>
            <p class="config-section-description">${section.description}</p>
            <div class="config-form">${renderSectionFields(key, sectionData)}</div>
        `;
        
        container.appendChild(sectionEl);
    });
    
    // Add change listeners to all inputs
    container.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('change', () => {
            hasUnsavedChanges = true;
            updateStatus('unsaved');
        });
    });
}

function renderSectionFields(sectionKey, data) {
    switch (sectionKey) {
        case 'thresholds':
            return renderThresholds(data);
        case 'stakes':
            return renderStakes(data);
        case 'bookmakers':
            return renderBookmakers(data);
        case 'sports':
            return renderSports(data);
        case 'markets':
            return renderMarkets(data);
        case 'timing':
            return renderTiming(data);
        case 'alerts':
            return renderAlerts(data);
        case 'display':
            return renderDisplay(data);
        case 'risk':
            return renderRisk(data);
        case 'data':
            return renderData(data);
        case 'circuitBreaker':
            return renderCircuitBreaker(data);
        case 'advanced':
            return renderAdvanced(data);
        case 'security':
            return renderSecurity(data);
        default:
            return '';
    }
}

function renderThresholds(data) {
    return `
        <div class="form-grid form-grid-2">
            ${renderNumberInput('minArbitrageProfit', data.minArbitrageProfit, 'Min Arbitrage Profit %', 'Minimum profit percentage to show arbitrage opportunities', 0, 100, 0.1)}
            ${renderNumberInput('minEVPercent', data.minEVPercent, 'Min EV %', 'Minimum expected value percentage', 0, 1000, 1)}
            ${renderNumberInput('maxEVPercent', data.maxEVPercent, 'Max EV %', 'Maximum EV cap to filter outliers', 0, 1000, 1)}
            ${renderNumberInput('minQualityScore', data.minQualityScore, 'Min Quality Score', 'Minimum opportunity quality (0-100)', 0, 100, 1)}
        </div>
    `;
}

function renderStakes(data) {
    return `
        <div class="form-grid form-grid-3">
            ${renderNumberInput('defaultTotalStake', data.defaultTotalStake, 'Default Total Stake', 'Default stake for arbitrage calculations', 1, 100000, 1)}
            ${renderNumberInput('maxStakePerBet', data.maxStakePerBet, 'Max Per Bet', 'Maximum stake for a single bet', 1, 100000, 1)}
            ${renderNumberInput('maxStakePerDay', data.maxStakePerDay, 'Max Per Day', 'Maximum total daily stakes', 1, 1000000, 1)}
            ${renderNumberInput('maxStakePerBookmaker', data.maxStakePerBookmaker, 'Max Per Bookmaker/Day', 'Maximum per bookmaker per day', 1, 1000000, 1)}
            ${renderNumberInput('minStake', data.minStake, 'Min Stake', 'Minimum stake per bookmaker', 1, 1000, 1)}
            ${renderNumberInput('bankrollPercentPerBet', data.bankrollPercentPerBet, 'Bankroll % Per Bet', 'Maximum % of bankroll per bet', 1, 100, 1)}
            ${renderNumberInput('kellyFraction', data.kellyFraction, 'Kelly Fraction', 'Kelly Criterion fraction (0.25 = quarter Kelly)', 0.01, 1, 0.01)}
        </div>
        <div class="form-group inline">
            <label class="toggle-switch">
                <input type="checkbox" id="enableSmartSizing" ${data.enableSmartSizing ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            <label class="form-label">Enable Smart Bet Sizing</label>
        </div>
    `;
}

function renderBookmakers(data) {
    const allBookmakers = ['Pinnacle', 'Unibet', 'Betclic', 'Winamax', 'FDJ', 'ParionsSport', 'ZEbet', 'Betfair', 'Smarkets'];
    
    return `
        <div class="form-group">
            <label class="form-label">Enabled Bookmakers</label>
            <div class="bookmaker-grid">
                ${allBookmakers.map(bm => `
                    <label class="bookmaker-card ${!data.enabled?.includes(bm) ? 'disabled' : ''}">
                        <input type="checkbox" name="bookmakers" value="${bm}" 
                            ${data.enabled?.includes(bm) ? 'checked' : ''}
                            onchange="toggleBookmaker(this)">
                        <span>${bm}</span>
                    </label>
                `).join('')}
            </div>
        </div>
        <div class="form-group inline">
            <label class="toggle-switch">
                <input type="checkbox" id="requirePinnacle" ${data.requirePinnacle ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            <label class="form-label">Require Pinnacle for EV Calculation</label>
        </div>
        <div class="form-group">
            ${renderNumberInput('maxBookmakersPerOpportunity', data.maxBookmakersPerOpportunity, 'Max Bookmakers Shown', 'Limit bookmakers displayed per opportunity', 2, 10, 1)}
        </div>
    `;
}

function renderSports(data) {
    const sports = [
        { key: 'tennis', icon: '🎾', name: 'Tennis' },
        { key: 'soccer', icon: '⚽', name: 'Soccer' },
        { key: 'basketball', icon: '🏀', name: 'Basketball' },
        { key: 'esports', icon: '🎮', name: 'Esports' },
        { key: 'horse_racing', icon: '🏇', name: 'Horse Racing' }
    ];
    
    return `
        <div class="form-group">
            <label class="form-label">Enabled Sports</label>
            <div class="sport-grid">
                ${sports.map(sport => {
                    const sportData = data[sport.key] || {};
                    return `
                        <label class="sport-card ${!sportData.enabled ? 'disabled' : ''}">
                            <input type="checkbox" name="sports" value="${sport.key}" 
                                data-sport="${sport.key}"
                                ${sportData.enabled ? 'checked' : ''}
                                onchange="toggleSport(this)">
                            <span>${sport.icon} ${sport.name}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        </div>
        <div id="sport-details">
            ${sports.map(sport => {
                const sportData = data[sport.key] || {};
                if (!sportData.enabled) return '';
                return renderSportDetails(sport, sportData);
            }).join('')}
        </div>
    `;
}

function renderSportDetails(sport, data) {
    return `
        <div class="form-group-object" id="sport-${sport.key}-details">
            <div class="form-group-object-title">${sport.icon} ${sport.name} Settings</div>
            <div class="form-grid form-grid-2">
                ${renderNumberInput(`${sport.key}_minOdds`, data.minOdds, 'Min Odds', '', 1.01, 1000, 0.01)}
                ${renderNumberInput(`${sport.key}_maxOdds`, data.maxOdds, 'Max Odds', '', 1.01, 1000, 0.01)}
            </div>
        </div>
    `;
}

function renderMarkets(data) {
    const markets = [
        { key: '1x2', name: '1X2 (Match Result)', desc: 'Home / Draw / Away' },
        { key: 'h2h', name: 'Head to Head', desc: 'Two-way betting (no draw)' },
        { key: 'asian_handicap', name: 'Asian Handicap', desc: 'Handicap with push option' },
        { key: 'over_under', name: 'Over/Under', desc: 'Total goals/points betting' },
        { key: 'btts', name: 'Both Teams to Score', desc: 'Yes/No market' },
        { key: 'double_chance', name: 'Double Chance', desc: '1X, X2, or 12' }
    ];
    
    return `
        <div class="form-group">
            <label class="form-label">Enabled Markets</label>
            <div class="bookmaker-grid">
                ${markets.map(market => {
                    const marketData = data[market.key] || {};
                    return `
                        <label class="bookmaker-card ${!marketData.enabled ? 'disabled' : ''}">
                            <input type="checkbox" name="markets" value="${market.key}" 
                                ${marketData.enabled ? 'checked' : ''}>
                            <div>
                                <div>${market.name}</div>
                                <div style="font-size: 11px; color: var(--text-secondary);">${market.desc}</div>
                            </div>
                        </label>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderTiming(data) {
    return `
        <div class="form-grid form-grid-2">
            ${renderNumberInput('minTimeToEvent', data.minTimeToEvent, 'Min Time to Event (min)', 'Minimum minutes before event starts', 0, 10080, 1)}
            ${renderNumberInput('maxTimeToEvent', data.maxTimeToEvent, 'Max Time to Event (min)', 'Maximum minutes before event (7 days = 10080)', 0, 43200, 60)}
            ${renderNumberInput('refreshInterval', data.refreshInterval, 'Refresh Interval (min)', 'How often to fetch new odds', 1, 120, 1)}
            ${renderNumberInput('liveRefreshInterval', data.liveRefreshInterval, 'Live Refresh (min)', 'Refresh interval for live matches', 1, 60, 1)}
            ${renderNumberInput('staleOddsThreshold', data.staleOddsThreshold, 'Stale Odds Threshold (min)', 'Minutes before odds considered stale', 1, 60, 1)}
        </div>
        
        <div class="form-group-object">
            <div class="form-group-object-title">🔕 Quiet Hours</div>
            <div class="form-group inline">
                <label class="toggle-switch">
                    <input type="checkbox" id="quietHours_enabled" ${data.quietHours?.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <label class="form-label">Enable Quiet Hours</label>
            </div>
            <div class="form-grid form-grid-3" style="margin-top: 15px;">
                ${renderTextInput('quietHours_start', data.quietHours?.start, 'Start Time', '', 'time')}
                ${renderTextInput('quietHours_end', data.quietHours?.end, 'End Time', '', 'time')}
                ${renderTextInput('quietHours_timezone', data.quietHours?.timezone, 'Timezone')}
            </div>
            <div style="margin-top: 10px;">
                <label class="form-checkbox">
                    <input type="checkbox" id="quietHours_disableAlerts" ${data.quietHours?.disableAlerts ? 'checked' : ''}>
                    Disable alerts during quiet hours
                </label>
            </div>
        </div>
    `;
}

function renderAlerts(data) {
    const telegram = data.telegram || {};
    
    return `
        <div class="form-group-object">
            <div class="form-group-object-title">📱 Telegram</div>
            <div class="form-group inline">
                <label class="toggle-switch">
                    <input type="checkbox" id="telegram_enabled" ${telegram.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <label class="form-label">Enable Telegram Alerts</label>
            </div>
            <div class="form-grid form-grid-2" style="margin-top: 15px;">
                ${renderNumberInput('telegram_minArbitrageForAlert', telegram.minArbitrageForAlert, 'Min Arbitrage %', 'Min profit % to trigger alert', 0.1, 50, 0.1)}
                ${renderNumberInput('telegram_minEVForAlert', telegram.minEVForAlert, 'Min EV %', 'Min EV % to trigger alert', 1, 100, 1)}
                ${renderNumberInput('telegram_minQualityScore', telegram.minQualityScore, 'Min Quality Score', 'Min quality to alert', 0, 100, 1)}
                ${renderTextInput('telegram_summaryTime', telegram.summaryTime, 'Daily Summary Time', '', 'time')}
            </div>
            <div style="margin-top: 10px;">
                <label class="form-checkbox">
                    <input type="checkbox" id="telegram_dailySummary" ${telegram.dailySummary ? 'checked' : ''}>
                    Send daily summary
                </label>
            </div>
        </div>
        
        <div class="form-group-object" style="margin-top: 20px;">
            <div class="form-group-object-title">🔗 Webhook</div>
            <div class="form-group inline">
                <label class="toggle-switch">
                    <input type="checkbox" id="webhook_enabled" ${data.webhook?.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <label class="form-label">Enable Webhook</label>
            </div>
            <div class="form-group" style="margin-top: 10px;">
                ${renderTextInput('webhook_url', data.webhook?.url, 'Webhook URL', 'URL to send alerts to')}
            </div>
        </div>
    `;
}

function renderDisplay(data) {
    const dashboard = data.dashboard || {};
    const sorting = data.sorting || {};
    const columns = data.columns || {};
    
    return `
        <div class="form-grid form-grid-2">
            <div class="form-group">
                <label class="form-label">Theme</label>
                <select class="form-select" id="theme">
                    <option value="dark" ${data.theme === 'dark' ? 'selected' : ''}>🌙 Dark</option>
                    <option value="light" ${data.theme === 'light' ? 'selected' : ''}>☀️ Light</option>
                    <option value="auto" ${data.theme === 'auto' ? 'selected' : ''}>🔄 Auto</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Currency</label>
                <select class="form-select" id="currency">
                    <option value="EUR" ${data.currency === 'EUR' ? 'selected' : ''}>🇪🇺 EUR</option>
                    <option value="GBP" ${data.currency === 'GBP' ? 'selected' : ''}>🇬🇧 GBP</option>
                    <option value="USD" ${data.currency === 'USD' ? 'selected' : ''}>🇺🇸 USD</option>
                </select>
            </div>
            ${renderTextInput('timezone', data.timezone, 'Timezone')}
            ${renderNumberInput('maxResultsPerCategory', dashboard.maxResultsPerCategory, 'Max Results', 'Maximum opportunities shown per category', 10, 200, 1)}
        </div>
        
        <div class="form-group-object">
            <div class="form-group-object-title">📊 Dashboard Columns</div>
            <div class="bookmaker-grid">
                ${Object.entries(columns).map(([key, value]) => `
                    <label class="form-checkbox">
                        <input type="checkbox" id="column_${key}" ${value ? 'checked' : ''}>
                        ${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function renderRisk(data) {
    return `
        <div class="form-grid form-grid-2">
            ${renderNumberInput('maxDailyLoss', data.maxDailyLoss, 'Max Daily Loss (€)', 'Stop betting after this loss amount', 0, 10000, 10)}
            ${renderNumberInput('maxConsecutiveLosses', data.maxConsecutiveLosses, 'Max Consecutive Losses', 'Alert after N consecutive losses', 1, 20, 1)}
            ${renderNumberInput('maxExposurePerEvent', data.maxExposurePerEvent, 'Max Exposure Per Event (€)', 'Maximum total stake per event', 10, 5000, 10)}
            ${renderNumberInput('maxExposurePerBookmaker', data.maxExposurePerBookmaker, 'Max Exposure Per Bookmaker (€)', 'Maximum per bookmaker', 10, 10000, 10)}
            ${renderNumberInput('palpableErrorThreshold', data.palpableErrorThreshold, 'Palpable Error Threshold %', 'Flag suspicious opportunities above this %', 5, 50, 0.5)}
        </div>
        <div style="margin-top: 15px;">
            <label class="form-checkbox">
                <input type="checkbox" id="enableAutoStop" ${data.enableAutoStop ? 'checked' : ''}>
                Auto-stop after max daily loss
            </label>
        </div>
    `;
}

function renderData(data) {
    return `
        <div class="form-grid form-grid-2">
            ${renderNumberInput('retentionDays', data.retentionDays, 'Data Retention (days)', 'Keep data for N days', 30, 3650, 1)}
            ${renderNumberInput('archiveAfterDays', data.archiveAfterDays, 'Archive After (days)', 'Archive data older than N days', 7, 365, 1)}
            <div class="form-group">
                <label class="form-label">Backup Interval</label>
                <select class="form-select" id="backupInterval">
                    <option value="hourly" ${data.backupInterval === 'hourly' ? 'selected' : ''}>Hourly</option>
                    <option value="daily" ${data.backupInterval === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${data.backupInterval === 'weekly' ? 'selected' : ''}>Weekly</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Export Format</label>
                <select class="form-select" id="exportFormat">
                    <option value="json" ${data.exportFormat === 'json' ? 'selected' : ''}>JSON</option>
                    <option value="csv" ${data.exportFormat === 'csv' ? 'selected' : ''}>CSV</option>
                    <option value="both" ${data.exportFormat === 'both' ? 'selected' : ''}>Both</option>
                </select>
            </div>
        </div>
        <div style="margin-top: 15px;">
            <label class="form-checkbox">
                <input type="checkbox" id="compressionEnabled" ${data.compressionEnabled ? 'checked' : ''}>
                Enable data compression
            </label>
            <label class="form-checkbox" style="margin-left: 20px;">
                <input type="checkbox" id="backupEnabled" ${data.backupEnabled ? 'checked' : ''}>
                Enable automatic backups
            </label>
        </div>
    `;
}

function renderCircuitBreaker(data) {
    return `
        <div class="form-group inline">
            <label class="toggle-switch">
                <input type="checkbox" id="circuitBreaker_enabled" ${data.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            <label class="form-label">Enable Circuit Breaker</label>
        </div>
        
        <div class="form-grid form-grid-3" style="margin-top: 15px;">
            ${renderNumberInput('failureThreshold', data.failureThreshold, 'Failure Threshold', 'Failures before opening circuit', 1, 20, 1)}
            ${renderNumberInput('failureWindowMs', data.failureWindowMs, 'Failure Window (ms)', 'Time window for counting failures', 1000, 300000, 1000)}
            ${renderNumberInput('resetTimeoutMs', data.resetTimeoutMs, 'Reset Timeout (ms)', 'Time before recovery attempt', 5000, 300000, 1000)}
            ${renderNumberInput('successThreshold', data.successThreshold, 'Success Threshold', 'Successes needed to close', 1, 10, 1)}
            ${renderNumberInput('maxConsecutiveFailures', data.maxConsecutiveFailures, 'Max Consecutive', 'Hard failure limit', 1, 50, 1)}
        </div>
    `;
}

function renderAdvanced(data) {
    return `
        <div class="form-group">
            <label class="form-label">Log Level</label>
            <select class="form-select" id="logLevel">
                <option value="debug" ${data.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                <option value="info" ${data.logLevel === 'info' ? 'selected' : ''}>Info</option>
                <option value="warn" ${data.logLevel === 'warn' ? 'selected' : ''}>Warning</option>
                <option value="error" ${data.logLevel === 'error' ? 'selected' : ''}>Error</option>
            </select>
        </div>
        
        <div style="margin-top: 15px;">
            <label class="form-checkbox">
                <input type="checkbox" id="enableCrossMarketArbitrage" ${data.enableCrossMarketArbitrage ? 'checked' : ''}>
                Enable cross-market arbitrage detection
            </label>
            <label class="form-checkbox" style="margin-left: 20px;">
                <input type="checkbox" id="enableLiveArbitrage" ${data.enableLiveArbitrage ? 'checked' : ''}>
                Enable live match arbitrage
            </label>
            <label class="form-checkbox" style="margin-left: 20px;">
                <input type="checkbox" id="enablePaperTrading" ${data.enablePaperTrading ? 'checked' : ''}>
                Enable paper trading mode
            </label>
            <label class="form-checkbox" style="margin-left: 20px;">
                <input type="checkbox" id="enableMLPrediction" ${data.enableMLPrediction ? 'checked' : ''}>
                Enable ML odds prediction (experimental)
            </label>
        </div>
    `;
}

function renderSecurity(data) {
    return `
        <div class="form-group inline">
            <label class="toggle-switch">
                <input type="checkbox" id="enable2FA" ${data.enable2FA ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            <label class="form-label">Enable Two-Factor Authentication</label>
        </div>
        
        <div class="form-grid form-grid-2" style="margin-top: 15px;">
            ${renderNumberInput('sessionTimeout', data.sessionTimeout, 'Session Timeout (sec)', 'Auto-logout after inactivity', 60, 86400, 60)}
            ${renderNumberInput('maxLoginAttempts', data.maxLoginAttempts, 'Max Login Attempts', 'Before account lockout', 1, 10, 1)}
            ${renderNumberInput('lockoutDuration', data.lockoutDuration, 'Lockout Duration (sec)', 'Account lockout time', 60, 3600, 60)}
            ${renderNumberInput('apiKeyRotation', data.apiKeyRotation, 'API Key Rotation (days)', 'Days between key rotation', 1, 365, 1)}
        </div>
        
        <div style="margin-top: 10px;">
            <label class="form-checkbox">
                <input type="checkbox" id="requireStrongPassword" ${data.requireStrongPassword ? 'checked' : ''}>
                Require strong passwords
            </label>
        </div>
    `;
}

// Helper functions
function renderNumberInput(id, value, label, hint = '', min = null, max = null, step = null) {
    const minAttr = min !== null ? `min="${min}"` : '';
    const maxAttr = max !== null ? `max="${max}"` : '';
    const stepAttr = step !== null ? `step="${step}"` : '';
    
    return `
        <div class="form-group">
            <label class="form-label" for="${id}">${label}</label>
            <input type="number" class="form-input" id="${id}" value="${value}" ${minAttr} ${maxAttr} ${stepAttr}>
            ${hint ? `<span class="form-hint">${hint}</span>` : ''}
        </div>
    `;
}

function renderTextInput(id, value, label, hint = '', type = 'text') {
    return `
        <div class="form-group">
            <label class="form-label" for="${id}">${label}</label>
            <input type="${type}" class="form-input" id="${id}" value="${value || ''}">
            ${hint ? `<span class="form-hint">${hint}</span>` : ''}
        </div>
    `;
}

// Event handlers
function setupEventListeners() {
    // Save button
    document.getElementById('save-config').addEventListener('click', saveConfig);
    
    // Reset button
    document.getElementById('reset-config').addEventListener('click', () => {
        showModal('Reset Configuration', 'Are you sure you want to reset all settings to defaults?', resetConfig);
    });
    
    // Export button
    document.getElementById('export-config').addEventListener('click', exportConfig);
    
    // Import button
    document.getElementById('import-config').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file').addEventListener('change', importConfig);
    
    // Modal
    document.getElementById('modal-cancel').addEventListener('click', hideModal);
    document.getElementById('modal-confirm').addEventListener('click', () => {
        if (window.modalCallback) {
            window.modalCallback();
            window.modalCallback = null;
        }
        hideModal();
    });
    
    // Close modal on outside click
    document.getElementById('confirm-modal').addEventListener('click', (e) => {
        if (e.target.id === 'confirm-modal') {
            hideModal();
        }
    });
}

async function saveConfig() {
    const config = collectFormData();
    
    try {
        const response = await fetch('/api/config-manager', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            hasUnsavedChanges = false;
            updateStatus('saved');
            showValidationResults(result.validation);
            showAlert('Configuration saved successfully', 'success');
        } else {
            updateStatus('error');
            showAlert('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        updateStatus('error');
        showAlert('Failed to save configuration: ' + error.message, 'error');
    }
}

async function resetConfig() {
    try {
        const response = await fetch('/api/config-manager/reset', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentConfig = result.config;
            renderSections();
            hasUnsavedChanges = false;
            updateStatus('saved');
            showAlert('Configuration reset to defaults', 'success');
        }
    } catch (error) {
        showAlert('Failed to reset configuration', 'error');
    }
}

async function exportConfig() {
    try {
        const response = await fetch('/api/config-manager/export?format=json');
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `surebet-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showAlert('Configuration exported', 'success');
    } catch (error) {
        showAlert('Failed to export configuration', 'error');
    }
}

async function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const config = JSON.parse(text);
        
        const response = await fetch('/api/config-manager/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentConfig = result.config;
            renderSections();
            hasUnsavedChanges = false;
            updateStatus('saved');
            showValidationResults(result.validation);
            showAlert('Configuration imported successfully', 'success');
        }
    } catch (error) {
        showAlert('Failed to import configuration: ' + error.message, 'error');
    }
    
    // Reset file input
    e.target.value = '';
}

function collectFormData() {
    const config = JSON.parse(JSON.stringify(currentConfig));
    
    // Thresholds
    config.thresholds.minArbitrageProfit = parseFloat(document.getElementById('minArbitrageProfit')?.value) || 0.5;
    config.thresholds.minEVPercent = parseFloat(document.getElementById('minEVPercent')?.value) || 5;
    config.thresholds.maxEVPercent = parseFloat(document.getElementById('maxEVPercent')?.value) || 100;
    config.thresholds.minQualityScore = parseFloat(document.getElementById('minQualityScore')?.value) || 60;
    
    // Stakes
    config.stakes.defaultTotalStake = parseFloat(document.getElementById('defaultTotalStake')?.value) || 100;
    config.stakes.maxStakePerBet = parseFloat(document.getElementById('maxStakePerBet')?.value) || 500;
    config.stakes.maxStakePerDay = parseFloat(document.getElementById('maxStakePerDay')?.value) || 2000;
    config.stakes.maxStakePerBookmaker = parseFloat(document.getElementById('maxStakePerBookmaker')?.value) || 1000;
    config.stakes.minStake = parseFloat(document.getElementById('minStake')?.value) || 5;
    config.stakes.bankrollPercentPerBet = parseFloat(document.getElementById('bankrollPercentPerBet')?.value) || 10;
    config.stakes.kellyFraction = parseFloat(document.getElementById('kellyFraction')?.value) || 0.25;
    config.stakes.enableSmartSizing = document.getElementById('enableSmartSizing')?.checked ?? true;
    
    // Bookmakers
    const bmCheckboxes = document.querySelectorAll('input[name="bookmakers"]:checked');
    config.bookmakers.enabled = Array.from(bmCheckboxes).map(cb => cb.value);
    config.bookmakers.requirePinnacle = document.getElementById('requirePinnacle')?.checked ?? true;
    config.bookmakers.maxBookmakersPerOpportunity = parseInt(document.getElementById('maxBookmakersPerOpportunity')?.value) || 5;
    
    // Sports
    const sportCheckboxes = document.querySelectorAll('input[name="sports"]:checked');
    sportCheckboxes.forEach(cb => {
        const sport = cb.value;
        if (config.sports[sport]) {
            config.sports[sport].enabled = true;
            config.sports[sport].minOdds = parseFloat(document.getElementById(`${sport}_minOdds`)?.value) || 1.1;
            config.sports[sport].maxOdds = parseFloat(document.getElementById(`${sport}_maxOdds`)?.value) || 10;
        }
    });
    document.querySelectorAll('input[name="sports"]:not(:checked)').forEach(cb => {
        if (config.sports[cb.value]) {
            config.sports[cb.value].enabled = false;
        }
    });
    
    // Markets
    const marketCheckboxes = document.querySelectorAll('input[name="markets"]:checked');
    marketCheckboxes.forEach(cb => {
        if (!config.markets[cb.value]) config.markets[cb.value] = {};
        config.markets[cb.value].enabled = true;
    });
    document.querySelectorAll('input[name="markets"]:not(:checked)').forEach(cb => {
        if (config.markets[cb.value]) config.markets[cb.value].enabled = false;
    });
    
    // Timing
    config.timing.minTimeToEvent = parseInt(document.getElementById('minTimeToEvent')?.value) || 0;
    config.timing.maxTimeToEvent = parseInt(document.getElementById('maxTimeToEvent')?.value) || 10080;
    config.timing.refreshInterval = parseInt(document.getElementById('refreshInterval')?.value) || 30;
    config.timing.liveRefreshInterval = parseInt(document.getElementById('liveRefreshInterval')?.value) || 5;
    config.timing.staleOddsThreshold = parseInt(document.getElementById('staleOddsThreshold')?.value) || 10;
    config.timing.quietHours.enabled = document.getElementById('quietHours_enabled')?.checked ?? false;
    config.timing.quietHours.start = document.getElementById('quietHours_start')?.value || '23:00';
    config.timing.quietHours.end = document.getElementById('quietHours_end')?.value || '08:00';
    config.timing.quietHours.timezone = document.getElementById('quietHours_timezone')?.value || 'Europe/Paris';
    config.timing.quietHours.disableAlerts = document.getElementById('quietHours_disableAlerts')?.checked ?? true;
    
    // Alerts
    config.alerts.telegram.enabled = document.getElementById('telegram_enabled')?.checked ?? true;
    config.alerts.telegram.minArbitrageForAlert = parseFloat(document.getElementById('telegram_minArbitrageForAlert')?.value) || 1.0;
    config.alerts.telegram.minEVForAlert = parseFloat(document.getElementById('telegram_minEVForAlert')?.value) || 8;
    config.alerts.telegram.minQualityScore = parseFloat(document.getElementById('telegram_minQualityScore')?.value) || 70;
    config.alerts.telegram.dailySummary = document.getElementById('telegram_dailySummary')?.checked ?? true;
    config.alerts.telegram.summaryTime = document.getElementById('telegram_summaryTime')?.value || '09:00';
    config.alerts.webhook.enabled = document.getElementById('webhook_enabled')?.checked ?? false;
    config.alerts.webhook.url = document.getElementById('webhook_url')?.value || '';
    
    // Display
    config.display.theme = document.getElementById('theme')?.value || 'dark';
    config.display.currency = document.getElementById('currency')?.value || 'EUR';
    config.display.timezone = document.getElementById('timezone')?.value || 'Europe/Paris';
    config.display.dashboard.maxResultsPerCategory = parseInt(document.getElementById('maxResultsPerCategory')?.value) || 50;
    
    // Columns
    Object.keys(config.display.columns).forEach(key => {
        const cb = document.getElementById(`column_${key}`);
        if (cb) config.display.columns[key] = cb.checked;
    });
    
    // Risk
    config.risk.maxDailyLoss = parseFloat(document.getElementById('maxDailyLoss')?.value) || 500;
    config.risk.maxConsecutiveLosses = parseInt(document.getElementById('maxConsecutiveLosses')?.value) || 5;
    config.risk.maxExposurePerEvent = parseFloat(document.getElementById('maxExposurePerEvent')?.value) || 300;
    config.risk.maxExposurePerBookmaker = parseFloat(document.getElementById('maxExposurePerBookmaker')?.value) || 1000;
    config.risk.palpableErrorThreshold = parseFloat(document.getElementById('palpableErrorThreshold')?.value) || 10;
    config.risk.enableAutoStop = document.getElementById('enableAutoStop')?.checked ?? false;
    
    // Data
    config.data.retentionDays = parseInt(document.getElementById('retentionDays')?.value) || 365;
    config.data.archiveAfterDays = parseInt(document.getElementById('archiveAfterDays')?.value) || 90;
    config.data.backupInterval = document.getElementById('backupInterval')?.value || 'daily';
    config.data.exportFormat = document.getElementById('exportFormat')?.value || 'json';
    config.data.compressionEnabled = document.getElementById('compressionEnabled')?.checked ?? true;
    config.data.backupEnabled = document.getElementById('backupEnabled')?.checked ?? true;
    
    // Circuit Breaker
    config.circuitBreaker.enabled = document.getElementById('circuitBreaker_enabled')?.checked ?? true;
    config.circuitBreaker.failureThreshold = parseInt(document.getElementById('failureThreshold')?.value) || 5;
    config.circuitBreaker.failureWindowMs = parseInt(document.getElementById('failureWindowMs')?.value) || 60000;
    config.circuitBreaker.resetTimeoutMs = parseInt(document.getElementById('resetTimeoutMs')?.value) || 30000;
    config.circuitBreaker.successThreshold = parseInt(document.getElementById('successThreshold')?.value) || 3;
    config.circuitBreaker.maxConsecutiveFailures = parseInt(document.getElementById('maxConsecutiveFailures')?.value) || 10;
    
    // Advanced
    config.advanced.logLevel = document.getElementById('logLevel')?.value || 'info';
    config.advanced.enableCrossMarketArbitrage = document.getElementById('enableCrossMarketArbitrage')?.checked ?? true;
    config.advanced.enableLiveArbitrage = document.getElementById('enableLiveArbitrage')?.checked ?? true;
    config.advanced.enablePaperTrading = document.getElementById('enablePaperTrading')?.checked ?? true;
    config.advanced.enableMLPrediction = document.getElementById('enableMLPrediction')?.checked ?? false;
    
    // Security
    config.security.enable2FA = document.getElementById('enable2FA')?.checked ?? false;
    config.security.sessionTimeout = parseInt(document.getElementById('sessionTimeout')?.value) || 3600;
    config.security.maxLoginAttempts = parseInt(document.getElementById('maxLoginAttempts')?.value) || 5;
    config.security.lockoutDuration = parseInt(document.getElementById('lockoutDuration')?.value) || 900;
    config.security.apiKeyRotation = parseInt(document.getElementById('apiKeyRotation')?.value) || 30;
    config.security.requireStrongPassword = document.getElementById('requireStrongPassword')?.checked ?? true;
    
    return config;
}

// UI Helpers
function toggleBookmaker(checkbox) {
    const card = checkbox.closest('.bookmaker-card');
    card.classList.toggle('disabled', !checkbox.checked);
    hasUnsavedChanges = true;
    updateStatus('unsaved');
}

function toggleSport(checkbox) {
    const card = checkbox.closest('.sport-card');
    card.classList.toggle('disabled', !checkbox.checked);
    
    const sport = checkbox.dataset.sport;
    const detailsContainer = document.getElementById('sport-details');
    
    if (checkbox.checked) {
        // Add details section
        const sportData = currentConfig.sports[sport] || {};
        const sportDef = { tennis: { icon: '🎾' }, soccer: { icon: '⚽' }, basketball: { icon: '🏀' }, esports: { icon: '🎮' }, horse_racing: { icon: '🏇' } }[sport];
        const detailsHTML = renderSportDetails({ key: sport, ...sportDef }, sportData);
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = detailsHTML;
        detailsContainer.appendChild(wrapper.firstElementChild);
    } else {
        // Remove details section
        const details = document.getElementById(`sport-${sport}-details`);
        if (details) details.remove();
    }
    
    hasUnsavedChanges = true;
    updateStatus('unsaved');
}

function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function setActiveNavItem(sectionId) {
    document.querySelectorAll('.config-nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('href') === `#${sectionId}`);
    });
}

function updateStatus(status) {
    const statusEl = document.getElementById('config-status');
    const statusMap = {
        saved: { text: '✓ All changes saved', class: 'saved' },
        unsaved: { text: '● Unsaved changes', class: 'unsaved' },
        error: { text: '✗ Save failed', class: 'error' }
    };
    
    const info = statusMap[status];
    statusEl.textContent = info.text;
    statusEl.className = `config-status ${info.class}`;
}

function showAlert(message, type) {
    const container = document.getElementById('validation-alerts');
    const alert = document.createElement('div');
    alert.className = `validation-alert ${type}`;
    alert.innerHTML = `
        <span>${type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ️'}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

function showValidationResults(validation) {
    const container = document.getElementById('validation-alerts');
    container.innerHTML = '';
    
    if (!validation || validation.valid) return;
    
    validation.errors.forEach(error => {
        const alert = document.createElement('div');
        alert.className = 'validation-alert error';
        alert.innerHTML = `
            <span>⚠️</span>
            <span>${error}</span>
        `;
        container.appendChild(alert);
    });
}

function showModal(title, message, callback) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('confirm-modal').classList.add('show');
    window.modalCallback = callback;
}

function hideModal() {
    document.getElementById('confirm-modal').classList.remove('show');
    window.modalCallback = null;
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});
