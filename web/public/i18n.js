/**
 * Surebet Detector i18n Integration
 * Connects the dashboard to the i18n microservice
 */

class SurebetI18n {
  constructor() {
    this.currentLanguage = localStorage.getItem('surebet-language') || 'en';
    this.fallbackLanguage = 'en';
    this.translations = {};
    this.loadedNamespaces = new Set();
    this.i18nServiceUrl = '/api/i18n'; // Proxy through main API
    this.cacheExpiry = 3600000; // 1 hour
    this.userPreferences = null;
    
    this.init();
  }

  async init() {
    // Load saved language preference
    await this.loadUserPreferences();
    
    // Set HTML lang attribute
    document.documentElement.lang = this.currentLanguage;
    
    // Load initial translations
    await this.loadNamespace('common');
    
    // Apply translations to the page
    this.applyTranslations();
    
    // Create language switcher UI
    this.createLanguageSwitcher();
    
    console.log(`[i18n] Initialized with language: ${this.currentLanguage}`);
  }

  /**
   * Load user preferences from API or localStorage
   */
  async loadUserPreferences() {
    try {
      const response = await fetch(`${this.i18nServiceUrl}/preferences`, {
        headers: {
          'Accept-Language': this.currentLanguage
        }
      });
      
      if (response.ok) {
        this.userPreferences = await response.json();
        if (this.userPreferences.language) {
          this.currentLanguage = this.userPreferences.language;
          localStorage.setItem('surebet-language', this.currentLanguage);
        }
      }
    } catch (error) {
      console.warn('[i18n] Failed to load user preferences:', error);
      // Fall back to localStorage
      this.currentLanguage = localStorage.getItem('surebet-language') || 'en';
    }
  }

  /**
   * Save user preferences to API
   */
  async saveUserPreferences(preferences) {
    try {
      const response = await fetch(`${this.i18nServiceUrl}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });
      
      if (response.ok) {
        this.userPreferences = await response.json();
      }
    } catch (error) {
      console.error('[i18n] Failed to save preferences:', error);
    }
  }

  /**
   * Load translations for a namespace
   */
  async loadNamespace(namespace) {
    if (this.loadedNamespaces.has(namespace)) {
      return this.translations[namespace];
    }

    // Check cache first
    const cached = this.getCachedTranslations(namespace);
    if (cached) {
      this.translations[namespace] = cached;
      this.loadedNamespaces.add(namespace);
      return cached;
    }

    try {
      const response = await fetch(
        `${this.i18nServiceUrl}/translations/${this.currentLanguage}/${namespace}`
      );
      
      if (!response.ok) {
        // Try fallback language
        if (this.currentLanguage !== this.fallbackLanguage) {
          const fallbackResponse = await fetch(
            `${this.i18nServiceUrl}/translations/${this.fallbackLanguage}/${namespace}`
          );
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            this.translations[namespace] = data.translations || {};
            this.cacheTranslations(namespace, data.translations);
          }
        }
      } else {
        const data = await response.json();
        this.translations[namespace] = data.translations || {};
        this.cacheTranslations(namespace, data.translations);
      }
      
      this.loadedNamespaces.add(namespace);
      return this.translations[namespace];
    } catch (error) {
      console.error(`[i18n] Failed to load namespace ${namespace}:`, error);
      this.translations[namespace] = {};
      return {};
    }
  }

  /**
   * Get cached translations from localStorage
   */
  getCachedTranslations(namespace) {
    try {
      const cacheKey = `i18n_${this.currentLanguage}_${namespace}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this.cacheExpiry) {
          return data;
        }
      }
    } catch (error) {
      console.warn('[i18n] Cache read error:', error);
    }
    return null;
  }

  /**
   * Cache translations to localStorage
   */
  cacheTranslations(namespace, data) {
    try {
      const cacheKey = `i18n_${this.currentLanguage}_${namespace}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('[i18n] Cache write error:', error);
    }
  }

  /**
   * Get a translation by key
   */
  t(key, namespace = 'common', params = {}) {
    // Load namespace if not loaded
    if (!this.loadedNamespaces.has(namespace)) {
      this.loadNamespace(namespace);
    }

    const translations = this.translations[namespace] || {};
    let text = translations[key];

    // Fallback to common namespace if not found
    if (!text && namespace !== 'common') {
      text = this.translations['common']?.[key];
    }

    // Fallback to key name if not found
    if (!text) {
      text = key;
    }

    // Replace parameters
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
    });

    return text;
  }

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  applyTranslations() {
    // Text content translations
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const namespace = element.getAttribute('data-i18n-ns') || 'common';
      const text = this.t(key, namespace);
      
      if (element.hasAttribute('data-i18n-attr')) {
        const attr = element.getAttribute('data-i18n-attr');
        element.setAttribute(attr, text);
      } else {
        element.textContent = text;
      }
    });

    // Placeholder translations
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const namespace = element.getAttribute('data-i18n-ns') || 'common';
      element.placeholder = this.t(key, namespace);
    });

    // Title translations
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      const namespace = element.getAttribute('data-i18n-ns') || 'common';
      element.title = this.t(key, namespace);
    });
  }

  /**
   * Change the current language
   */
  async setLanguage(language) {
    if (language === this.currentLanguage) return;

    this.currentLanguage = language;
    localStorage.setItem('surebet-language', language);
    document.documentElement.lang = language;

    // Clear loaded namespaces to reload in new language
    this.loadedNamespaces.clear();
    this.translations = {};

    // Reload common namespace
    await this.loadNamespace('common');

    // Save preference
    await this.saveUserPreferences({ language });

    // Re-apply translations
    this.applyTranslations();

    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language } 
    }));

    console.log(`[i18n] Language changed to: ${language}`);
  }

  /**
   * Create language switcher UI
   */
  createLanguageSwitcher() {
    // Check if switcher already exists
    if (document.getElementById('language-switcher')) return;

    const switcher = document.createElement('div');
    switcher.id = 'language-switcher';
    switcher.className = 'language-switcher';
    switcher.innerHTML = `
      <button class="language-btn" onclick="surebetI18n.toggleLanguageMenu()">
        <span class="language-flag">${this.getLanguageFlag(this.currentLanguage)}</span>
        <span class="language-code">${this.currentLanguage.toUpperCase()}</span>
        <span class="language-arrow">▼</span>
      </button>
      <div class="language-menu" id="language-menu">
        ${this.getAvailableLanguages().map(lang => `
          <button class="language-option ${lang.code === this.currentLanguage ? 'active' : ''}" 
                  onclick="surebetI18n.setLanguage('${lang.code}')">
            <span class="language-flag">${lang.flag}</span>
            <span class="language-name">${lang.name}</span>
          </button>
        `).join('')}
      </div>
    `;

    // Insert into nav
    const navStats = document.querySelector('.nav-stats');
    if (navStats) {
      navStats.insertBefore(switcher, navStats.firstChild);
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!switcher.contains(e.target)) {
        document.getElementById('language-menu')?.classList.remove('open');
      }
    });
  }

  /**
   * Toggle language menu visibility
   */
  toggleLanguageMenu() {
    const menu = document.getElementById('language-menu');
    if (menu) {
      menu.classList.toggle('open');
    }
  }

  /**
   * Get available languages
   */
  getAvailableLanguages() {
    return [
      { code: 'en', name: 'English', flag: '🇬🇧' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' },
      { code: 'pt', name: 'Português', flag: '🇵🇹' },
      { code: 'nl', name: 'Nederlands', flag: '🇳🇱' }
    ];
  }

  /**
   * Get flag emoji for language code
   */
  getLanguageFlag(code) {
    const lang = this.getAvailableLanguages().find(l => l.code === code);
    return lang?.flag || '🌐';
  }

  /**
   * Format number according to locale
   */
  formatNumber(number, options = {}) {
    return new Intl.NumberFormat(this.currentLanguage, options).format(number);
  }

  /**
   * Format currency according to locale
   */
  formatCurrency(amount, currency = 'EUR') {
    return new Intl.NumberFormat(this.currentLanguage, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format date according to locale
   */
  formatDate(date, options = {}) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.currentLanguage, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options
    }).format(d);
  }

  /**
   * Format relative time (e.g., "2 hours ago")
   */
  formatRelativeTime(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now - d;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const rtf = new Intl.RelativeTimeFormat(this.currentLanguage, { numeric: 'auto' });

    if (diffSecs < 60) return rtf.format(-diffSecs, 'second');
    if (diffMins < 60) return rtf.format(-diffMins, 'minute');
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');
    return rtf.format(-diffDays, 'day');
  }
}

// Initialize i18n when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.surebetI18n = new SurebetI18n();
});
