const UserPreference = require('../models/UserPreference');
const languageParser = require('accept-language-parser');

class UserPreferenceService {
  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    let prefs = await UserPreference.findOne({ userId });
    
    if (!prefs) {
      // Create default preferences
      prefs = new UserPreference({ userId });
      await prefs.save();
    }
    
    return prefs;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId, updates) {
    return await UserPreference.findOneAndUpdate(
      { userId },
      updates,
      { upsert: true, new: true }
    );
  }

  /**
   * Detect language from request
   */
  detectLanguage(acceptLanguageHeader, supportedLanguages = ['en']) {
    if (!acceptLanguageHeader) {
      return null;
    }

    const parsed = languageParser.parse(acceptLanguageHeader);
    
    for (const lang of parsed) {
      const code = lang.code;
      // Check exact match
      if (supportedLanguages.includes(code)) {
        return code;
      }
      // Check base language (e.g., 'en' for 'en-US')
      const baseCode = code.split('-')[0];
      if (supportedLanguages.includes(baseCode)) {
        return baseCode;
      }
    }
    
    return null;
  }

  /**
   * Get effective language for user
   */
  async getEffectiveLanguage(userId, acceptLanguageHeader, supportedLanguages) {
    const prefs = await this.getPreferences(userId);
    
    // If auto-detect is enabled and we have a header, try that first
    if (prefs.autoDetect && acceptLanguageHeader) {
      const detected = this.detectLanguage(acceptLanguageHeader, supportedLanguages);
      if (detected) {
        // Update last detected language
        if (detected !== prefs.lastDetectedLanguage) {
          prefs.lastDetectedLanguage = detected;
          await prefs.save();
        }
        return detected;
      }
    }
    
    // Return user's preferred language if supported
    if (supportedLanguages.includes(prefs.language)) {
      return prefs.language;
    }
    
    // Return fallback
    if (supportedLanguages.includes(prefs.fallbackLanguage)) {
      return prefs.fallbackLanguage;
    }
    
    // Default to first supported language
    return supportedLanguages[0];
  }

  /**
   * Set user language
   */
  async setLanguage(userId, language) {
    return await UserPreference.findOneAndUpdate(
      { userId },
      { 
        language,
        autoDetect: false // Disable auto-detect when manually set
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Enable/disable auto-detect
   */
  async setAutoDetect(userId, enabled) {
    return await UserPreference.findOneAndUpdate(
      { userId },
      { autoDetect: enabled },
      { upsert: true, new: true }
    );
  }
}

module.exports = new UserPreferenceService();
