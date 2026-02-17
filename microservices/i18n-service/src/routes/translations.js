const express = require('express');
const router = express.Router();
const translationService = require('../services/translationService');

/**
 * @route GET /api/translations/:language/:namespace
 * @desc Get all translations for a namespace
 */
router.get('/:language/:namespace', async (req, res) => {
  try {
    const { language, namespace } = req.params;
    const translations = await translationService.getNamespaceTranslations(namespace, language);
    
    res.json({
      language,
      namespace,
      translations,
      count: Object.keys(translations).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/translations/:language
 * @desc Get translations for multiple namespaces
 */
router.get('/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const { namespaces } = req.query;
    
    let nsArray;
    if (namespaces) {
      nsArray = namespaces.split(',');
    } else {
      nsArray = ['common'];
    }
    
    const translations = await translationService.getMultipleNamespaces(nsArray, language);
    
    res.json({
      language,
      namespaces: nsArray,
      translations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/translations/single
 * @desc Get a single translation
 */
router.get('/single/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const { key, namespace = 'common', context } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }
    
    const translation = await translationService.getTranslation(key, language, namespace, context);
    
    res.json({
      language,
      namespace,
      key,
      value: translation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/translations
 * @desc Create or update a translation
 */
router.post('/', async (req, res) => {
  try {
    const { key, namespace, language, value, context, metadata } = req.body;
    
    if (!key || !language || !value) {
      return res.status(400).json({ 
        error: 'Key, language, and value are required' 
      });
    }
    
    const translation = await translationService.upsertTranslation({
      key,
      namespace: namespace || 'common',
      language,
      value,
      context,
      metadata
    });
    
    res.json({
      success: true,
      translation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/translations/bulk
 * @desc Bulk import translations
 */
router.post('/bulk', async (req, res) => {
  try {
    const { translations, language, namespace = 'common' } = req.body;
    
    if (!translations || !Array.isArray(translations) || !language) {
      return res.status(400).json({ 
        error: 'Translations array and language are required' 
      });
    }
    
    const result = await translationService.bulkImport(translations, language, namespace);
    
    res.json({
      success: true,
      inserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/translations/search
 * @desc Search translations
 */
router.get('/search/all', async (req, res) => {
  try {
    const { q, language, namespace } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    
    const results = await translationService.searchTranslations(q, language, namespace);
    
    res.json({
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/translations/missing/:language
 * @desc Get missing translations for a language
 */
router.get('/missing/:language', async (req, res) => {
  try {
    const { language } = req.params;
    const { defaultLanguage = 'en' } = req.query;
    
    const missing = await translationService.getMissingTranslations(language, defaultLanguage);
    
    res.json({
      language,
      defaultLanguage,
      missing: missing.map(m => ({
        key: m.key,
        namespace: m.namespace
      })),
      count: missing.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/translations/stats/overview
 * @desc Get translation statistics
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const stats = await translationService.getStatistics();
    
    res.json({
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
