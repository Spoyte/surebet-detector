const Translation = require('../models/Translation');
const axios = require('axios');

/**
 * AI Translation Service
 * Integrates with DeepL and Google Translate APIs for automatic translations
 * with human review workflow
 */
class AITranslationService {
  constructor() {
    this.deeplApiKey = process.env.DEEPL_API_KEY;
    this.googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    this.deeplBaseUrl = 'https://api-free.deepl.com/v2';
    this.googleBaseUrl = 'https://translation.googleapis.com/language/translate/v2';
    
    // Language code mappings
    this.deeplLanguageMap = {
      'en': 'EN-US',
      'fr': 'FR',
      'es': 'ES',
      'de': 'DE',
      'it': 'IT',
      'pt': 'PT-PT',
      'nl': 'NL',
      'pl': 'PL',
      'ru': 'RU',
      'ja': 'JA',
      'zh': 'ZH',
      'ar': 'AR'
    };
    
    this.googleLanguageMap = {
      'en': 'en',
      'fr': 'fr',
      'es': 'es',
      'de': 'de',
      'it': 'it',
      'pt': 'pt',
      'nl': 'nl',
      'pl': 'pl',
      'ru': 'ru',
      'ja': 'ja',
      'zh': 'zh',
      'ar': 'ar',
      'hi': 'hi',
      'ko': 'ko',
      'tr': 'tr',
      'vi': 'vi'
    };
  }

  /**
   * Translate text using DeepL API
   */
  async translateWithDeepL(text, targetLang, sourceLang = 'en') {
    if (!this.deeplApiKey) {
      throw new Error('DeepL API key not configured');
    }

    const targetCode = this.deeplLanguageMap[targetLang] || targetLang.toUpperCase();
    const sourceCode = this.deeplLanguageMap[sourceLang] || sourceLang.toUpperCase();

    try {
      const response = await axios.post(
        `${this.deeplBaseUrl}/translate`,
        new URLSearchParams({
          text: text,
          target_lang: targetCode,
          source_lang: sourceCode,
          formality: 'default'
        }),
        {
          headers: {
            'Authorization': `DeepL-Auth-Key ${this.deeplApiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        translatedText: response.data.translations[0].text,
        detectedSourceLanguage: response.data.translations[0].detected_source_language,
        provider: 'deepl',
        confidence: null
      };
    } catch (error) {
      console.error('DeepL translation error:', error.response?.data || error.message);
      throw new Error(`DeepL translation failed: ${error.message}`);
    }
  }

  /**
   * Translate text using Google Translate API
   */
  async translateWithGoogle(text, targetLang, sourceLang = 'en') {
    if (!this.googleApiKey) {
      throw new Error('Google Translate API key not configured');
    }

    const targetCode = this.googleLanguageMap[targetLang] || targetLang;
    const sourceCode = this.googleLanguageMap[sourceLang] || sourceLang;

    try {
      const response = await axios.post(
        `${this.googleBaseUrl}?key=${this.googleApiKey}`,
        {
          q: text,
          target: targetCode,
          source: sourceCode,
          format: 'text'
        }
      );

      const translation = response.data.data.translations[0];
      return {
        translatedText: translation.translatedText,
        detectedSourceLanguage: translation.detectedSourceLanguage,
        provider: 'google',
        confidence: translation.confidence || null
      };
    } catch (error) {
      console.error('Google translation error:', error.response?.data || error.message);
      throw new Error(`Google translation failed: ${error.message}`);
    }
  }

  /**
   * Translate with fallback - try DeepL first, then Google
   */
  async translate(text, targetLang, sourceLang = 'en', preferredProvider = 'deepl') {
    const providers = preferredProvider === 'deepl' 
      ? ['deepl', 'google'] 
      : ['google', 'deepl'];

    for (const provider of providers) {
      try {
        if (provider === 'deepl' && this.deeplApiKey) {
          return await this.translateWithDeepL(text, targetLang, sourceLang);
        } else if (provider === 'google' && this.googleApiKey) {
          return await this.translateWithGoogle(text, targetLang, sourceLang);
        }
      } catch (error) {
        console.warn(`${provider} translation failed, trying fallback...`);
        continue;
      }
    }

    throw new Error('All translation providers failed');
  }

  /**
   * Batch translate multiple texts
   */
  async batchTranslate(texts, targetLang, sourceLang = 'en') {
    const results = [];
    
    // Process in chunks to avoid rate limits
    const chunkSize = 50;
    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      
      const chunkResults = await Promise.all(
        chunk.map(async (text) => {
          try {
            const result = await this.translate(text, targetLang, sourceLang);
            return {
              original: text,
              ...result,
              success: true
            };
          } catch (error) {
            return {
              original: text,
              translatedText: null,
              error: error.message,
              success: false
            };
          }
        })
      );
      
      results.push(...chunkResults);
      
      // Rate limiting delay
      if (i + chunkSize < texts.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Auto-translate missing keys for a language
   */
  async autoTranslateMissing(targetLang, options = {}) {
    const { 
      defaultLanguage = 'en', 
      namespace = null,
      dryRun = false,
      reviewRequired = true 
    } = options;

    // Build query for missing translations
    const defaultQuery = { language: defaultLanguage };
    if (namespace) defaultQuery.namespace = namespace;

    const defaultTranslations = await Translation.find(defaultQuery);
    
    // Get existing target translations
    const targetQuery = { language: targetLang };
    if (namespace) targetQuery.namespace = namespace;
    
    const existingTargets = await Translation.find(targetQuery);
    const existingKeys = new Set(existingTargets.map(t => `${t.namespace}:${t.key}`));

    // Filter to missing only
    const missingTranslations = defaultTranslations.filter(
      t => !existingKeys.has(`${t.namespace}:${t.key}`)
    );

    if (missingTranslations.length === 0) {
      return {
        message: 'No missing translations found',
        translated: 0,
        failed: 0,
        results: []
      };
    }

    const results = [];
    const translated = [];
    const failed = [];

    // Process translations
    for (const source of missingTranslations) {
      try {
        const result = await this.translate(source.value, targetLang, defaultLanguage);
        
        const translationData = {
          key: source.key,
          namespace: source.namespace,
          language: targetLang,
          value: result.translatedText,
          context: source.context,
          metadata: {
            source: 'ai-translation',
            provider: result.provider,
            autoTranslated: true,
            reviewRequired: reviewRequired,
            reviewStatus: reviewRequired ? 'pending' : 'approved',
            originalText: source.value,
            translatedAt: new Date(),
            sourceLanguage: defaultLanguage
          }
        };

        if (!dryRun) {
          await Translation.findOneAndUpdate(
            { key: source.key, namespace: source.namespace, language: targetLang },
            translationData,
            { upsert: true, new: true }
          );
        }

        results.push({
          key: source.key,
          namespace: source.namespace,
          success: true,
          translatedText: result.translatedText,
          provider: result.provider,
          dryRun
        });
        translated.push(source);

      } catch (error) {
        results.push({
          key: source.key,
          namespace: source.namespace,
          success: false,
          error: error.message
        });
        failed.push(source);
      }
    }

    return {
      message: `Translated ${translated.length} keys, ${failed.length} failed`,
      translated: translated.length,
      failed: failed.length,
      dryRun,
      results
    };
  }

  /**
   * Get translations pending review
   */
  async getPendingReviews(language = null, namespace = null, limit = 50) {
    const query = {
      'metadata.autoTranslated': true,
      'metadata.reviewRequired': true,
      'metadata.reviewStatus': 'pending'
    };

    if (language) query.language = language;
    if (namespace) query.namespace = namespace;

    return await Translation.find(query)
      .sort({ 'metadata.translatedAt': -1 })
      .limit(limit);
  }

  /**
   * Approve or reject a translation
   */
  async reviewTranslation(translationId, action, reviewerId, notes = '') {
    const translation = await Translation.findById(translationId);
    
    if (!translation) {
      throw new Error('Translation not found');
    }

    if (action === 'approve') {
      translation.metadata.reviewStatus = 'approved';
      translation.metadata.reviewedAt = new Date();
      translation.metadata.reviewedBy = reviewerId;
      translation.metadata.reviewNotes = notes;
      translation.metadata.verified = true;
    } else if (action === 'reject') {
      translation.metadata.reviewStatus = 'rejected';
      translation.metadata.reviewedAt = new Date();
      translation.metadata.reviewedBy = reviewerId;
      translation.metadata.reviewNotes = notes;
    } else {
      throw new Error('Invalid action. Use "approve" or "reject"');
    }

    await translation.save();
    return translation;
  }

  /**
   * Bulk review translations
   */
  async bulkReview(translationIds, action, reviewerId) {
    const results = [];
    
    for (const id of translationIds) {
      try {
        const result = await this.reviewTranslation(id, action, reviewerId);
        results.push({ id, success: true, status: result.metadata.reviewStatus });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get translation quality statistics
   */
  async getQualityStats(language = null) {
    const matchStage = language ? { language } : {};
    
    const stats = await Translation.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$language',
          total: { $sum: 1 },
          autoTranslated: {
            $sum: { $cond: ['$metadata.autoTranslated', 1, 0] }
          },
          pendingReview: {
            $sum: {
              $cond: [
                { $eq: ['$metadata.reviewStatus', 'pending'] },
                1,
                0
              ]
            }
          },
          approved: {
            $sum: {
              $cond: [
                { $eq: ['$metadata.reviewStatus', 'approved'] },
                1,
                0
              ]
            }
          },
          rejected: {
              $sum: {
                $cond: [
                  { $eq: ['$metadata.reviewStatus', 'rejected'] },
                  1,
                  0
                ]
              }
          },
          byProvider: {
            $push: '$metadata.provider'
          }
        }
      }
    ]);

    return stats.map(s => ({
      language: s._id,
      total: s.total,
      autoTranslated: s.autoTranslated,
      pendingReview: s.pendingReview,
      approved: s.approved,
      rejected: s.rejected,
      manualTranslations: s.total - s.autoTranslated,
      providers: s.byProvider.filter(p => p).reduce((acc, p) => {
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {})
    }));
  }

  /**
   * Suggest improvements for a translation using AI
   */
  async suggestImprovement(translationId) {
    const translation = await Translation.findById(translationId);
    
    if (!translation) {
      throw new Error('Translation not found');
    }

    // Get original text
    const original = await Translation.findOne({
      key: translation.key,
      namespace: translation.namespace,
      language: translation.metadata?.sourceLanguage || 'en'
    });

    if (!original) {
      throw new Error('Original translation not found');
    }

    // Re-translate for comparison
    const newTranslation = await this.translate(
      original.value,
      translation.language,
      original.language
    );

    return {
      current: translation.value,
      suggested: newTranslation.translatedText,
      original: original.value,
      provider: newTranslation.provider,
      different: translation.value !== newTranslation.translatedText
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AITranslationService();
