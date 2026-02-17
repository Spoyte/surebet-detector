import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

const LANGUAGE_STORAGE_KEY = '@surebet_language';
const LANGUAGE_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const useLanguageStore = create((set, get) => ({
  // State
  currentLanguage: 'en',
  availableLanguages: [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  ],
  translations: {},
  loadedNamespaces: new Set(),
  isLoading: false,
  lastSync: null,

  // Actions
  initialize: async () => {
    try {
      // Load saved language from storage
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      
      if (savedLanguage) {
        set({ currentLanguage: savedLanguage });
      } else {
        // Try to get from server
        await get().syncFromServer();
      }

      // Load initial translations
      await get().loadNamespace('common');
      
      // Set up periodic sync
      setInterval(() => {
        get().syncToServer();
      }, LANGUAGE_SYNC_INTERVAL);
      
    } catch (error) {
      console.error('[LanguageStore] Initialization error:', error);
    }
  },

  setLanguage: async (languageCode) => {
    const { availableLanguages } = get();
    const language = availableLanguages.find(l => l.code === languageCode);
    
    if (!language) {
      console.error(`[LanguageStore] Invalid language code: ${languageCode}`);
      return;
    }

    set({ 
      currentLanguage: languageCode,
      translations: {},
      loadedNamespaces: new Set()
    });

    try {
      // Save to local storage
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
      
      // Reload common namespace
      await get().loadNamespace('common');
      
      // Sync to server
      await get().syncToServer();
      
      console.log(`[LanguageStore] Language changed to: ${languageCode}`);
    } catch (error) {
      console.error('[LanguageStore] Error setting language:', error);
    }
  },

  loadNamespace: async (namespace) => {
    const { currentLanguage, loadedNamespaces, translations } = get();
    
    if (loadedNamespaces.has(namespace)) {
      return translations[namespace];
    }

    set({ isLoading: true });

    try {
      const response = await apiClient.get(`/i18n/translations/${currentLanguage}/${namespace}`);
      const data = response.data;

      set(state => ({
        translations: {
          ...state.translations,
          [namespace]: data.translations || {}
        },
        loadedNamespaces: new Set([...state.loadedNamespaces, namespace]),
        isLoading: false
      }));

      return data.translations || {};
    } catch (error) {
      console.error(`[LanguageStore] Error loading namespace ${namespace}:`, error);
      set({ isLoading: false });
      return {};
    }
  },

  t: (key, namespace = 'common', params = {}) => {
    const { translations, currentLanguage } = get();
    
    // Ensure namespace is loaded
    if (!get().loadedNamespaces.has(namespace)) {
      get().loadNamespace(namespace);
    }

    const nsTranslations = translations[namespace] || {};
    let text = nsTranslations[key];

    // Fallback to common namespace
    if (!text && namespace !== 'common') {
      text = translations['common']?.[key];
    }

    // Fallback to key name
    if (!text) {
      text = key;
    }

    // Replace parameters
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
    });

    return text;
  },

  syncToServer: async () => {
    try {
      const { currentLanguage, lastSync } = get();
      
      // Don't sync too frequently
      if (lastSync && Date.now() - lastSync < 30000) {
        return;
      }

      await apiClient.post('/i18n/preferences', {
        language: currentLanguage,
        updatedAt: new Date().toISOString()
      });

      set({ lastSync: Date.now() });
      console.log('[LanguageStore] Synced language to server');
    } catch (error) {
      console.error('[LanguageStore] Error syncing to server:', error);
    }
  },

  syncFromServer: async () => {
    try {
      const response = await apiClient.get('/i18n/preferences');
      const preferences = response.data;

      if (preferences.language) {
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        
        // Only update if server has different value and is newer
        if (preferences.language !== savedLanguage && preferences.updatedAt) {
          const serverTime = new Date(preferences.updatedAt).getTime();
          const localTime = Date.now(); // Approximate
          
          // Simple conflict resolution: server wins if different
          set({ currentLanguage: preferences.language });
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preferences.language);
          
          console.log('[LanguageStore] Synced language from server:', preferences.language);
        }
      }

      set({ lastSync: Date.now() });
    } catch (error) {
      console.error('[LanguageStore] Error syncing from server:', error);
    }
  },

  // Format helpers
  formatNumber: (number, options = {}) => {
    const { currentLanguage } = get();
    return new Intl.NumberFormat(currentLanguage, options).format(number);
  },

  formatCurrency: (amount, currency = 'EUR') => {
    const { currentLanguage } = get();
    return new Intl.NumberFormat(currentLanguage, {
      style: 'currency',
      currency: currency
    }).format(amount);
  },

  formatDate: (date, options = {}) => {
    const { currentLanguage } = get();
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(currentLanguage, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options
    }).format(d);
  },

  formatRelativeTime: (date) => {
    const { currentLanguage } = get();
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now - d;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const rtf = new Intl.RelativeTimeFormat(currentLanguage, { numeric: 'auto' });

    if (diffSecs < 60) return rtf.format(-diffSecs, 'second');
    if (diffMins < 60) return rtf.format(-diffMins, 'minute');
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');
    return rtf.format(-diffDays, 'day');
  }
}));
