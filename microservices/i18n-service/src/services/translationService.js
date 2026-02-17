const Translation = require('../models/Translation');
const Language = require('../models/Language');
const NodeCache = require('node-cache');

// Cache for translations (TTL: 1 hour)
const translationCache = new NodeCache({ stdTTL: 3600 });

class TranslationService {
  constructor() {
    this.supportedNamespaces = [
      'common',
      'auth',
      'dashboard',
      'opportunities',
      'betting',
      'bookmakers',
      'analytics',
      'settings',
      'notifications',
      'errors'
    ];
  }

  /**
   * Get a single translation
   */
  async getTranslation(key, language = 'en', namespace = 'common', context = null) {
    const cacheKey = `${language}:${namespace}:${key}:${context || 'default'}`;
    
    // Check cache first
    let translation = translationCache.get(cacheKey);
    if (translation) {
      return translation;
    }

    // Query database
    const query = { key, namespace, language };
    if (context) {
      query.context = context;
    }

    const doc = await Translation.findOne(query);
    
    if (doc) {
      translation = doc.value;
      // Track usage
      doc.trackUsage().catch(() => {});
    } else {
      // Return key as fallback
      translation = key;
    }

    // Cache result
    translationCache.set(cacheKey, translation);
    
    return translation;
  }

  /**
   * Get all translations for a namespace
   */
  async getNamespaceTranslations(namespace, language = 'en') {
    const cacheKey = `${language}:${namespace}:all`;
    
    let translations = translationCache.get(cacheKey);
    if (translations) {
      return translations;
    }

    const docs = await Translation.find({ namespace, language });
    
    translations = {};
    docs.forEach(doc => {
      translations[doc.key] = doc.value;
    });

    translationCache.set(cacheKey, translations);
    
    return translations;
  }

  /**
   * Get multiple namespaces at once
   */
  async getMultipleNamespaces(namespaces, language = 'en') {
    const result = {};
    
    for (const namespace of namespaces) {
      result[namespace] = await this.getNamespaceTranslations(namespace, language);
    }
    
    return result;
  }

  /**
   * Create or update a translation
   */
  async upsertTranslation(data) {
    const { key, namespace, language, value, context, metadata } = data;
    
    const update = {
      value,
      ...(context && { context }),
      ...(metadata && { metadata })
    };

    const translation = await Translation.findOneAndUpdate(
      { key, namespace, language },
      update,
      { upsert: true, new: true }
    );

    // Invalidate cache
    this.invalidateCache(language, namespace, key, context);
    
    return translation;
  }

  /**
   * Bulk import translations
   */
  async bulkImport(translations, language, namespace = 'common') {
    const operations = translations.map(t => ({
      updateOne: {
        filter: { 
          key: t.key, 
          namespace, 
          language 
        },
        update: {
          $set: {
            value: t.value,
            context: t.context || null,
            'metadata.source': 'import'
          }
        },
        upsert: true
      }
    }));

    const result = await Translation.bulkWrite(operations);
    
    // Invalidate namespace cache
    translationCache.del(`${language}:${namespace}:all`);
    
    return result;
  }

  /**
   * Search translations
   */
  async searchTranslations(query, language = null, namespace = null) {
    const searchQuery = {
      $or: [
        { key: { $regex: query, $options: 'i' } },
        { value: { $regex: query, $options: 'i' } }
      ]
    };

    if (language) {
      searchQuery.language = language;
    }
    if (namespace) {
      searchQuery.namespace = namespace;
    }

    return await Translation.find(searchQuery).limit(50);
  }

  /**
   * Get missing translations (keys that exist in default language but not in target)
   */
  async getMissingTranslations(targetLanguage, defaultLanguage = 'en') {
    const defaultKeys = await Translation.find({ language: defaultLanguage })
      .select('key namespace');
    
    const targetKeys = await Translation.find({ language: targetLanguage })
      .select('key namespace');
    
    const targetSet = new Set(targetKeys.map(t => `${t.namespace}:${t.key}`));
    
    return defaultKeys.filter(t => !targetSet.has(`${t.namespace}:${t.key}`));
  }

  /**
   * Get translation statistics
   */
  async getStatistics() {
    const stats = await Translation.aggregate([
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 },
          namespaces: { $addToSet: '$namespace' },
          verified: {
            $sum: { $cond: ['$metadata.verified', 1, 0] }
          }
        }
      }
    ]);

    return stats.map(s => ({
      language: s._id,
      totalTranslations: s.count,
      namespaces: s.namespaces.length,
      verifiedTranslations: s.verified
    }));
  }

  /**
   * Invalidate cache entries
   */
  invalidateCache(language, namespace, key, context) {
    translationCache.del(`${language}:${namespace}:${key}:${context || 'default'}`);
    translationCache.del(`${language}:${namespace}:all`);
  }

  /**
   * Clear all cache
   */
  clearCache() {
    translationCache.flushAll();
  }
}

module.exports = new TranslationService();
