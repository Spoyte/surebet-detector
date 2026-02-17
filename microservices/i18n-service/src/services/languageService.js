const Language = require('../models/Language');
const Translation = require('../models/Translation');

class LanguageService {
  /**
   * Get all supported languages
   */
  async getAllLanguages(includeDisabled = false) {
    const query = includeDisabled ? {} : { enabled: true };
    return await Language.find(query).sort({ name: 1 });
  }

  /**
   * Get language by code
   */
  async getLanguage(code) {
    return await Language.findOne({ code });
  }

  /**
   * Create a new language
   */
  async createLanguage(data) {
    const language = new Language(data);
    await language.save();
    return language;
  }

  /**
   * Update language
   */
  async updateLanguage(code, updates) {
    return await Language.findOneAndUpdate(
      { code },
      updates,
      { new: true }
    );
  }

  /**
   * Delete language
   */
  async deleteLanguage(code) {
    // Don't allow deleting default language
    if (code === 'en') {
      throw new Error('Cannot delete default language');
    }
    
    await Language.deleteOne({ code });
    await Translation.deleteMany({ language: code });
    
    return { deleted: true };
  }

  /**
   * Update language statistics
   */
  async updateStatistics(code) {
    const totalKeys = await Translation.countDocuments({ language: 'en' });
    const translatedKeys = await Translation.countDocuments({ language: code });
    const verifiedKeys = await Translation.countDocuments({ 
      language: code, 
      'metadata.verified': true 
    });

    return await Language.findOneAndUpdate(
      { code },
      {
        'statistics.totalKeys': totalKeys,
        'statistics.translatedKeys': translatedKeys,
        'statistics.verifiedKeys': verifiedKeys
      },
      { new: true }
    );
  }

  /**
   * Get language completion report
   */
  async getCompletionReport() {
    const languages = await Language.find({ enabled: true });
    const defaultKeys = await Translation.countDocuments({ language: 'en' });

    return languages.map(lang => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName,
      completionPercentage: lang.completionPercentage,
      translatedKeys: lang.statistics.translatedKeys,
      totalKeys: defaultKeys,
      missingKeys: defaultKeys - lang.statistics.translatedKeys,
      verifiedKeys: lang.statistics.verifiedKeys
    }));
  }

  /**
   * Initialize default languages
   */
  async initializeLanguages() {
    const defaultLanguages = [
      {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇬🇧',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'en-US',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: 'h:mm A',
          currency: 'USD',
          numberFormat: {
            decimalSeparator: '.',
            thousandSeparator: ','
          }
        }
      },
      {
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
        flag: '🇫🇷',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'fr-FR',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: ' '
          }
        }
      },
      {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        flag: '🇪🇸',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'es-ES',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: '.'
          }
        }
      },
      {
        code: 'de',
        name: 'German',
        nativeName: 'Deutsch',
        flag: '🇩🇪',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'de-DE',
          dateFormat: 'DD.MM.YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: '.'
          }
        }
      },
      {
        code: 'it',
        name: 'Italian',
        nativeName: 'Italiano',
        flag: '🇮🇹',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'it-IT',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: '.'
          }
        }
      },
      {
        code: 'pt',
        name: 'Portuguese',
        nativeName: 'Português',
        flag: '🇵🇹',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'pt-PT',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: '.'
          }
        }
      },
      {
        code: 'nl',
        name: 'Dutch',
        nativeName: 'Nederlands',
        flag: '🇳🇱',
        rtl: false,
        enabled: true,
        metadata: {
          locale: 'nl-NL',
          dateFormat: 'DD-MM-YYYY',
          timeFormat: 'HH:mm',
          currency: 'EUR',
          numberFormat: {
            decimalSeparator: ',',
            thousandSeparator: '.'
          }
        }
      }
    ];

    for (const lang of defaultLanguages) {
      await Language.findOneAndUpdate(
        { code: lang.code },
        lang,
        { upsert: true, new: true }
      );
    }

    return await Language.find();
  }
}

module.exports = new LanguageService();
