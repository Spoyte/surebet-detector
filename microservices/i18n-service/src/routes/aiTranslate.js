const express = require('express');
const router = express.Router();
const aiTranslationService = require('../services/aiTranslationService');

/**
 * @route POST /api/ai-translate/translate
 * @desc Translate a single text
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang, sourceLang = 'en', provider = 'auto' } = req.body;
    
    if (!text || !targetLang) {
      return res.status(400).json({ 
        error: 'Text and targetLang are required' 
      });
    }

    const result = await aiTranslationService.translate(
      text, 
      targetLang, 
      sourceLang, 
      provider === 'auto' ? 'deepl' : provider
    );
    
    res.json({
      success: true,
      original: text,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/ai-translate/batch
 * @desc Batch translate multiple texts
 */
router.post('/batch', async (req, res) => {
  try {
    const { texts, targetLang, sourceLang = 'en' } = req.body;
    
    if (!texts || !Array.isArray(texts) || !targetLang) {
      return res.status(400).json({ 
        error: 'Texts array and targetLang are required' 
      });
    }

    const results = await aiTranslationService.batchTranslate(
      texts, 
      targetLang, 
      sourceLang
    );
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      total: texts.length,
      translated: successful.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/ai-translate/auto-translate
 * @desc Auto-translate all missing keys for a language
 */
router.post('/auto-translate', async (req, res) => {
  try {
    const { 
      targetLang, 
      defaultLanguage = 'en',
      namespace = null,
      dryRun = false,
      reviewRequired = true
    } = req.body;
    
    if (!targetLang) {
      return res.status(400).json({ 
        error: 'targetLang is required' 
      });
    }

    const result = await aiTranslationService.autoTranslateMissing(
      targetLang,
      { defaultLanguage, namespace, dryRun, reviewRequired }
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/ai-translate/pending-review
 * @desc Get translations pending human review
 */
router.get('/pending-review', async (req, res) => {
  try {
    const { language, namespace, limit = 50 } = req.query;
    
    const pending = await aiTranslationService.getPendingReviews(
      language, 
      namespace, 
      parseInt(limit)
    );
    
    res.json({
      count: pending.length,
      translations: pending.map(t => ({
        id: t._id,
        key: t.key,
        namespace: t.namespace,
        language: t.language,
        value: t.value,
        originalText: t.metadata?.originalText,
        provider: t.metadata?.provider,
        translatedAt: t.metadata?.translatedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/ai-translate/review/:id
 * @desc Approve or reject a translation
 */
router.post('/review/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reviewerId, notes = '' } = req.body;
    
    if (!action || !reviewerId) {
      return res.status(400).json({ 
        error: 'action and reviewerId are required' 
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        error: 'action must be "approve" or "reject"' 
      });
    }

    const result = await aiTranslationService.reviewTranslation(
      id,
      action,
      reviewerId,
      notes
    );
    
    res.json({
      success: true,
      translation: {
        id: result._id,
        key: result.key,
        namespace: result.namespace,
        reviewStatus: result.metadata.reviewStatus,
        reviewedAt: result.metadata.reviewedAt,
        reviewedBy: result.metadata.reviewedBy
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/ai-translate/bulk-review
 * @desc Bulk approve or reject translations
 */
router.post('/bulk-review', async (req, res) => {
  try {
    const { translationIds, action, reviewerId } = req.body;
    
    if (!translationIds || !Array.isArray(translationIds) || !action || !reviewerId) {
      return res.status(400).json({ 
        error: 'translationIds array, action, and reviewerId are required' 
      });
    }

    const results = await aiTranslationService.bulkReview(
      translationIds,
      action,
      reviewerId
    );
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      total: translationIds.length,
      processed: successful.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/ai-translate/stats/quality
 * @desc Get translation quality statistics
 */
router.get('/stats/quality', async (req, res) => {
  try {
    const { language } = req.query;
    
    const stats = await aiTranslationService.getQualityStats(language);
    
    res.json({
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/ai-translate/suggest/:id
 * @desc Get AI suggestion for improving a translation
 */
router.get('/suggest/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const suggestion = await aiTranslationService.suggestImprovement(id);
    
    res.json({
      success: true,
      ...suggestion
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/ai-translate/providers
 * @desc Get available translation providers and their status
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = [];
    
    // Check DeepL
    if (process.env.DEEPL_API_KEY) {
      providers.push({
        name: 'deepl',
        available: true,
        type: 'primary'
      });
    } else {
      providers.push({
        name: 'deepl',
        available: false,
        type: 'primary',
        reason: 'DEEPL_API_KEY not configured'
      });
    }
    
    // Check Google
    if (process.env.GOOGLE_TRANSLATE_API_KEY) {
      providers.push({
        name: 'google',
        available: true,
        type: 'fallback'
      });
    } else {
      providers.push({
        name: 'google',
        available: false,
        type: 'fallback',
        reason: 'GOOGLE_TRANSLATE_API_KEY not configured'
      });
    }
    
    res.json({
      providers,
      configured: providers.filter(p => p.available).length > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
