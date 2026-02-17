const express = require('express');
const router = express.Router();
const languageService = require('../services/languageService');

/**
 * @route GET /api/languages
 * @desc Get all supported languages
 */
router.get('/', async (req, res) => {
  try {
    const { includeDisabled } = req.query;
    const languages = await languageService.getAllLanguages(includeDisabled === 'true');
    
    res.json({
      languages,
      count: languages.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/languages/:code
 * @desc Get language by code
 */
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const language = await languageService.getLanguage(code);
    
    if (!language) {
      return res.status(404).json({ error: 'Language not found' });
    }
    
    res.json({ language });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/languages
 * @desc Create a new language
 */
router.post('/', async (req, res) => {
  try {
    const language = await languageService.createLanguage(req.body);
    
    res.status(201).json({
      success: true,
      language
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/languages/:code
 * @desc Update language
 */
router.put('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const language = await languageService.updateLanguage(code, req.body);
    
    if (!language) {
      return res.status(404).json({ error: 'Language not found' });
    }
    
    res.json({
      success: true,
      language
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/languages/:code
 * @desc Delete language
 */
router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await languageService.deleteLanguage(code);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/languages/:code/refresh-stats
 * @desc Refresh language statistics
 */
router.post('/:code/refresh-stats', async (req, res) => {
  try {
    const { code } = req.params;
    const language = await languageService.updateStatistics(code);
    
    res.json({
      success: true,
      language
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/languages/report/completion
 * @desc Get language completion report
 */
router.get('/report/completion', async (req, res) => {
  try {
    const report = await languageService.getCompletionReport();
    
    res.json({
      report
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/languages/initialize
 * @desc Initialize default languages
 */
router.post('/initialize', async (req, res) => {
  try {
    const languages = await languageService.initializeLanguages();
    
    res.json({
      success: true,
      languages,
      count: languages.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
