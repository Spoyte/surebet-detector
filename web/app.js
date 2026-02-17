/**
 * Surebet Detector PWA App
 * Handles service worker registration, push notifications, and mobile UI
 */

class SurebetPWA {
  constructor() {
    this.swRegistration = null;
    this.pushSubscription = null;
    this.isOnline = navigator.onLine;
    this.deferredPrompt = null;
    
    this.init();
  }

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      await this.registerServiceWorker();
    }
    
    // Setup online/offline detection
    this.setupConnectivityListeners();
    
    // Setup install prompt
    this.setupInstallPrompt();
    
    // Setup push notifications
    this.setupPushNotifications();
    
    // Setup mobile UI enhancements
    this.setupMobileUI();
    
    // Setup pull-to-refresh
    this.setupPullToRefresh();
    
    // Request notification permission on first visit
    this.requestNotificationPermission();
    
    console.log('[PWA] Initialized');
  }

  async registerServiceWorker() {
    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registered:', this.swRegistration.scope);
      
      // Handle updates
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            this.showUpdateNotification();
          }
        });
      });
      
      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleSWMessage(event.data);
      });
    } catch (error) {
      console.error('[PWA] Service Worker registration failed:', error);
    }
  }

  setupConnectivityListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.showConnectivityStatus('online');
      this.syncData();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.showConnectivityStatus('offline');
    });
  }

  showConnectivityStatus(status) {
    const indicator = document.getElementById('connectivity-indicator') || this.createConnectivityIndicator();
    indicator.className = `connectivity-indicator ${status}`;
    indicator.textContent = status === 'online' ? '🟢 Online' : '🔴 Offline';
    indicator.style.opacity = '1';
    
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 3000);
  }

  createConnectivityIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'connectivity-indicator';
    indicator.className = 'connectivity-indicator';
    document.body.appendChild(indicator);
    return indicator;
  }

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });
    
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed');
      this.deferredPrompt = null;
      this.hideInstallButton();
    });
  }

  showInstallButton() {
    let btn = document.getElementById('pwa-install-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'pwa-install-btn';
      btn.className = 'btn btn-primary pwa-install-btn';
      btn.innerHTML = '📱 Install App';
      btn.onclick = () => this.installApp();
      
      const nav = document.querySelector('.nav');
      if (nav) {
        nav.appendChild(btn);
      }
    }
    btn.style.display = 'block';
  }

  hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) {
      btn.style.display = 'none';
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      return;
    }
    
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log('[PWA] Install prompt outcome:', outcome);
    
    this.deferredPrompt = null;
    this.hideInstallButton();
  }

  async setupPushNotifications() {
    if (!('PushManager' in window)) {
      console.log('[PWA] Push notifications not supported');
      return;
    }
    
    // Check existing subscription
    try {
      const subscription = await this.swRegistration?.pushManager.getSubscription();
      if (subscription) {
        this.pushSubscription = subscription;
        console.log('[PWA] Already subscribed to push');
      }
    } catch (error) {
      console.error('[PWA] Error checking push subscription:', error);
    }
  }

  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      return;
    }
    
    if (Notification.permission === 'default') {
      // Show permission request after user interaction
      const requestBtn = document.createElement('button');
      requestBtn.className = 'notification-permission-btn';
      requestBtn.innerHTML = '🔔 Enable Alerts';
      requestBtn.onclick = async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await this.subscribeToPush();
        }
        requestBtn.remove();
      };
      
      const hero = document.querySelector('.hero-actions');
      if (hero) {
        hero.appendChild(requestBtn);
      }
    }
  }

  async subscribeToPush() {
    if (!this.swRegistration) {
      return;
    }
    
    try {
      const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY'; // Replace with actual key
      const convertedKey = this.urlBase64ToUint8Array(vapidPublicKey);
      
      this.pushSubscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
      
      // Send to server
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.pushSubscription)
      });
      
      console.log('[PWA] Subscribed to push notifications');
    } catch (error) {
      console.error('[PWA] Push subscription failed:', error);
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }

  setupMobileUI() {
    // Add mobile-specific classes
    if (this.isMobile()) {
      document.body.classList.add('mobile');
    }
    
    // Setup swipe gestures
    this.setupSwipeGestures();
    
    // Setup bottom navigation for mobile
    this.setupBottomNav();
  }

  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
  }

  setupSwipeGestures() {
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      this.handleSwipe(touchStartX, touchEndX);
    }, { passive: true });
  }

  handleSwipe(startX, endX) {
    const threshold = 100;
    const diff = startX - endX;
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next section
        this.navigateSection('next');
      } else {
        // Swipe right - previous section
        this.navigateSection('prev');
      }
    }
  }

  navigateSection(direction) {
    const sections = ['opportunities', 'ev-list', 'movements-section', 'accounts-section'];
    const currentHash = window.location.hash.replace('#', '') || 'opportunities';
    const currentIndex = sections.indexOf(currentHash);
    
    let newIndex;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % sections.length;
    } else {
      newIndex = (currentIndex - 1 + sections.length) % sections.length;
    }
    
    window.location.hash = sections[newIndex];
  }

  setupBottomNav() {
    if (!this.isMobile()) return;
    
    const existingNav = document.querySelector('.bottom-nav');
    if (existingNav) return;
    
    const bottomNav = document.createElement('nav');
    bottomNav.className = 'bottom-nav';
    bottomNav.innerHTML = `
      <a href="#opportunities" class="bottom-nav-item active">
        <span class="icon">🎯</span>
        <span class="label">Arb</span>
      </a>
      <a href="#ev-list" class="bottom-nav-item">
        <span class="icon">💰</span>
        <span class="label">+EV</span>
      </a>
      <a href="#movements-section" class="bottom-nav-item">
        <span class="icon">📊</span>
        <span class="label">Moves</span>
      </a>
      <a href="#accounts-section" class="bottom-nav-item">
        <span class="icon">👤</span>
        <span class="label">Accounts</span>
      </a>
    `;
    
    document.body.appendChild(bottomNav);
    document.body.classList.add('has-bottom-nav');
    
    // Update active state on scroll
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash || '#opportunities';
      bottomNav.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('href') === hash);
      });
    });
  }

  setupPullToRefresh() {
    let touchStartY = 0;
    let touchEndY = 0;
    const threshold = 150;
    
    const ptrElement = document.createElement('div');
    ptrElement.className = 'pull-to-refresh';
    ptrElement.innerHTML = '🔄 Pull to refresh';
    document.body.insertBefore(ptrElement, document.body.firstChild);
    
    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
      if (touchStartY && window.scrollY === 0) {
        touchEndY = e.touches[0].clientY;
        const diff = touchEndY - touchStartY;
        
        if (diff > 0 && diff < threshold * 2) {
          ptrElement.style.transform = `translateY(${Math.min(diff / 2, 80)}px)`;
          ptrElement.classList.toggle('ready', diff > threshold);
        }
      }
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
      if (touchStartY && window.scrollY === 0) {
        const diff = touchEndY - touchStartY;
        
        if (diff > threshold) {
          ptrElement.style.transform = 'translateY(60px)';
          ptrElement.textContent = 'Refreshing...';
          this.refreshData();
        } else {
          ptrElement.style.transform = 'translateY(-100%)';
        }
      }
      
      touchStartY = 0;
      touchEndY = 0;
    });
  }

  async refreshData() {
    if (typeof refreshData === 'function') {
      await refreshData();
    }
    
    const ptrElement = document.querySelector('.pull-to-refresh');
    if (ptrElement) {
      ptrElement.textContent = '✅ Updated';
      setTimeout(() => {
        ptrElement.style.transform = 'translateY(-100%)';
        ptrElement.textContent = '🔄 Pull to refresh';
      }, 1000);
    }
  }

  showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <span>🔄 New version available</span>
      <button onclick="location.reload()">Update</button>
    `;
    document.body.appendChild(notification);
  }

  handleSWMessage(data) {
    switch (data.type) {
      case 'data-updated':
        console.log('[PWA] Data updated:', data.payload);
        break;
      case 'sync-complete':
        this.showConnectivityStatus('online');
        break;
    }
  }

  async syncData() {
    if ('sync' in navigator.serviceWorker) {
      try {
        await navigator.serviceWorker.ready;
        await navigator.serviceWorker.sync.register('sync-opportunities');
      } catch (error) {
        console.error('[PWA] Background sync failed:', error);
      }
    }
  }

  // Public API for sending push notifications from the app
  async sendNotification(title, options = {}) {
    if (!this.swRegistration) {
      return;
    }
    
    await this.swRegistration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      ...options
    });
  }
}

// Initialize PWA when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.surebetPWA = new SurebetPWA();
    window.liveTracker = new LiveTrackerUI();
  });
} else {
  window.surebetPWA = new SurebetPWA();
  window.liveTracker = new LiveTrackerUI();
}

/**
 * Live Tracker UI Controller
 * Handles live match tracking UI updates and interactions
 */
class LiveTrackerUI {
  constructor() {
    this.isTracking = false;
    this.updateInterval = null;
    this.matches = [];
    this.opportunities = [];
    this.updateFrequencyMs = 5000; // 5 seconds
  }

  async toggleTracking() {
    if (this.isTracking) {
      await this.stopTracking();
    } else {
      await this.startTracking();
    }
  }

  async startTracking() {
    try {
      const response = await fetch('/api/live/start', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        this.isTracking = true;
        this.updateUIState();
        this.beginUpdates();
        console.log('[Live] Tracking started');
      }
    } catch (error) {
      console.error('[Live] Failed to start tracking:', error);
      showToast('Failed to start live tracking', 'error');
    }
  }

  async stopTracking() {
    try {
      const response = await fetch('/api/live/stop', { method: 'POST' });
      const data = await response.json();
      
      this.isTracking = false;
      this.updateUIState();
      this.stopUpdates();
      console.log('[Live] Tracking stopped');
    } catch (error) {
      console.error('[Live] Failed to stop tracking:', error);
    }
  }

  beginUpdates() {
    // Immediate first update
    this.updateData();
    
    // Schedule regular updates
    this.updateInterval = setInterval(() => this.updateData(), this.updateFrequencyMs);
  }

  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  async updateData() {
    try {
      // Fetch matches and opportunities in parallel
      const [matchesRes, oppsRes, statsRes] = await Promise.all([
        fetch('/api/live/matches'),
        fetch('/api/live/opportunities'),
        fetch('/api/live/stats')
      ]);

      const matchesData = await matchesRes.json();
      const oppsData = await oppsRes.json();
      const statsData = await statsRes.json();

      this.matches = matchesData.matches || [];
      this.opportunities = oppsData.opportunities || [];

      this.renderMatches();
      this.renderOpportunities();
      this.updateStats(statsData);
    } catch (error) {
      console.error('[Live] Update failed:', error);
    }
  }

  renderMatches() {
    const tbody = document.querySelector('#live-matches-table tbody');
    if (!tbody) return;

    if (this.matches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">No active matches</td></tr>';
      return;
    }

    tbody.innerHTML = this.matches.map(match => {
      const score = match.score ? JSON.stringify(match.score).replace(/[{}"]/g, '') : '-';
      const statusClass = match.status === 'LIVE' ? 'status-live' : 
                         match.status === 'HALFTIME' ? 'status-halftime' : '';
      
      return `
        <tr>
          <td><strong>${match.eventName}</strong></td>
          <td>${match.sport}</td>
          <td class="${statusClass}">${match.status}</td>
          <td class="score-cell">${score}</td>
          <td>${match.elapsedTime || '-'} min</td>
          <td>${match.bookmakers ? match.bookmakers.length : 0}</td>
        </tr>
      `;
    }).join('');
  }

  renderOpportunities() {
    const container = document.getElementById('live-opportunities-list');
    if (!container) return;

    if (this.opportunities.length === 0) {
      container.innerHTML = '<div class="loading">No live arbitrage opportunities detected</div>';
      return;
    }

    // Sort by urgency (HIGH first) then by profit
    const sorted = [...this.opportunities].sort((a, b) => {
      if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
      if (b.urgency === 'HIGH' && a.urgency !== 'HIGH') return -1;
      return b.profitPercent - a.profitPercent;
    });

    container.innerHTML = sorted.map(opp => this.renderOpportunityCard(opp)).join('');
  }

  renderOpportunityCard(opp) {
    const scoreDisplay = opp.score && Object.keys(opp.score).length > 0 
      ? `<div class="score-display">${JSON.stringify(opp.score).replace(/[{}"]/g, '')}</div>` 
      : '';
    
    const legsHtml = opp.legs.map(leg => `
      <div class="leg">
        <span class="bookmaker">${leg.bookmaker}</span>
        <span class="outcome">${leg.outcome}</span>
        <span class="odds">${leg.odds}</span>
      </div>
    `).join('');

    return `
      <div class="opportunity-card live-arbitrage">
        <div class="card-header">
          <div class="card-title">
            <span class="live-badge">🔴 LIVE</span>
            <span class="urgency-badge urgency-${opp.urgency.toLowerCase()}">${opp.urgency}</span>
            <h3>${opp.eventName}</h3>
            ${scoreDisplay}
          </div>
          <div class="card-profit">
            <span class="profit-value">${opp.profitPercent}%</span>
            <span class="profit-label">profit</span>
          </div>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="info-item">
              <span class="info-label">Sport:</span> ${opp.sport}
            </span>
            <span class="info-item">
              <span class="info-label">Status:</span> ${opp.status}
            </span>
            <span class="info-item">
              <span class="info-label">Period:</span> ${opp.period}
            </span>
          </div>
          <div class="time-remaining">
            ⏱️ ~${opp.timeRemaining} minutes remaining
          </div>
          <div class="legs">
            ${legsHtml}
          </div>
          <div class="card-actions">
            <button class="btn btn-primary btn-small" onclick="showStakeCalculator('${opp.id}')">
              💰 Stake Calculator
            </button>
          </div>
        </div>
      </div>
    `;
  }

  updateStats(stats) {
    // Update summary cards
    const matchCountEl = document.getElementById('live-match-count');
    const oppCountEl = document.getElementById('live-opp-count');
    const urgentCountEl = document.getElementById('live-urgent-count');
    const statsBadge = document.getElementById('live-stats');

    if (matchCountEl) matchCountEl.textContent = stats.activeMatches || 0;
    if (oppCountEl) oppCountEl.textContent = stats.activeOpportunities || 0;
    
    const urgentCount = this.opportunities.filter(o => o.urgency === 'HIGH').length;
    if (urgentCountEl) urgentCountEl.textContent = urgentCount;

    if (statsBadge) {
      if (this.isTracking) {
        statsBadge.textContent = '● Tracking';
        statsBadge.classList.add('active');
      } else {
        statsBadge.textContent = '○ Stopped';
        statsBadge.classList.remove('active');
      }
    }
  }

  updateUIState() {
    const btn = document.getElementById('live-toggle-btn');
    if (btn) {
      btn.textContent = this.isTracking ? 'Stop Tracking' : 'Start Tracking';
      btn.classList.toggle('btn-danger', this.isTracking);
      btn.classList.toggle('btn-primary', !this.isTracking);
    }
  }
}

// Global function for toggle button
function toggleLiveTracking() {
  if (window.liveTracker) {
    window.liveTracker.toggleTracking();
  }
}

export default SurebetPWA;
