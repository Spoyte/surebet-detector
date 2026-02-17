const express = require('express');
const router = express.Router();
const userPreferenceService = require('../services/userPreferenceService');

/**
 * @route GET /api/preferences/:userId
 * @desc Get user preferences
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = await userPreferenceService.getPreferences(userId);
    
    res.json({ preferences });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/preferences/:userId
 * @desc Update user preferences
 */
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = await userPreferenceService.updatePreferences(userId, req.body);
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/preferences/:userId/language
 * @desc Set user language
 */
router.post('/:userId/language', async (req, res) => {
  try {
    const { userId } = req.params;
    const { language } = req.body;
    
    if (!language) {
      return res.status(400).json({ error: 'Language is required' });
    }
    
    const preferences = await userPreferenceService.setLanguage(userId, language);
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/preferences/:userId/auto-detect
 * @desc Enable/disable auto-detect
 */
router.post('/:userId/auto-detect', async (req, res) => {
  try {
    const { userId } = req.params;
    const { enabled } = req.body;
    
    if (enabled === undefined) {
      return res.status(400).json({ error: 'Enabled flag is required' });
    }
    
    const preferences = await userPreferenceService.setAutoDetect(userId, enabled);
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/preferences/:userId/effective-language
 * @desc Get effective language for user
 */
router.get('/:userId/effective-language', async (req, res) => {
  try {
    const { userId } = req.params;
    const acceptLanguage = req.headers['accept-language'];
    const supportedLanguages = req.query.supported?.split(',') || ['en'];
    
    const language = await userPreferenceService.getEffectiveLanguage(
      userId,
      acceptLanguage,
      supportedLanguages
    );
    
    res.json({
      language,
      detectedFromHeader: acceptLanguage ? true : false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
