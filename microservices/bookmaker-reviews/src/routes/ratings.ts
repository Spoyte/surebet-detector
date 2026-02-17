/**
 * Rating Routes
 */

import { Router } from 'express';
import { AggregatedRating } from '../models/AggregatedRating.js';
import { Review } from '../models/Review.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/ratings/summary
 * 
 * Get overall rating summary across all bookmakers
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await AggregatedRating.aggregate([
      {
        $group: {
          _id: null,
          totalReviews: { $sum: '$overall.count' },
          averageRating: { $avg: '$overall.average' },
          bookmakerCount: { $sum: 1 }
        }
      }
    ]);

    const topRated = await AggregatedRating.find()
      .sort({ 'overall.average': -1 })
      .limit(5)
      .populate('bookmakerId', 'name displayName')
      .lean();

    const mostReviewed = await AggregatedRating.find()
      .sort({ 'overall.count': -1 })
      .limit(5)
      .populate('bookmakerId', 'name displayName')
      .lean();

    res.json({
      summary: summary[0] || { totalReviews: 0, averageRating: 0, bookmakerCount: 0 },
      topRated,
      mostReviewed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching rating summary:', error);
    res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
});

/**
 * GET /api/ratings/bookmaker/:id
 * 
 * Get detailed ratings for a bookmaker
 */
router.get('/bookmaker/:id', async (req, res) => {
  try {
    const rating = await AggregatedRating.findOne({
      bookmakerId: req.params.id
    }).populate('bookmakerId').lean();

    if (!rating) {
      return res.status(404).json({ error: 'Ratings not found for this bookmaker' });
    }

    // Get recent reviews
    const recentReviews = await Review.find({
      bookmakerId: req.params.id,
      status: 'approved'
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('rating title content createdAt userName')
      .lean();

    res.json({
      ...rating,
      recentReviews,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching bookmaker ratings:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

/**
 * GET /api/ratings/category/:category
 * 
 * Get top bookmakers by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const validCategories = ['oddsQuality', 'withdrawalSpeed', 'customerService', 'websiteUsability', 'bonusOffers', 'mobileExperience'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        error: 'Invalid category',
        validCategories 
      });
    }

    const sortField = `categories.${category}.average`;
    
    const ratings = await AggregatedRating.find({
      [sortField]: { $gt: 0 }
    })
      .sort({ [sortField]: -1 })
      .limit(10)
      .populate('bookmakerId', 'name displayName logoUrl')
      .lean();

    res.json({
      category,
      bookmakers: ratings.map(r => ({
        bookmaker: r.bookmakerId,
        rating: (r.categories as any)[category],
        overall: r.overall
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching category ratings:', error);
    res.status(500).json({ error: 'Failed to fetch category ratings' });
  }
});

/**
 * GET /api/ratings/withdrawal-speed
 * 
 * Get bookmakers ranked by withdrawal speed
 */
router.get('/withdrawal-speed', async (req, res) => {
  try {
    const ratings = await AggregatedRating.find({
      'withdrawalStats.count': { $gt: 0 }
    })
      .sort({ 'withdrawalStats.averageTime': 1 })
      .limit(10)
      .populate('bookmakerId', 'name displayName')
      .lean();

    res.json({
      bookmakers: ratings.map(r => ({
        bookmaker: r.bookmakerId,
        averageTime: r.withdrawalStats.averageTime,
        successRate: r.withdrawalStats.successRate,
        sampleSize: r.withdrawalStats.count
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching withdrawal speed ratings:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal speed ratings' });
  }
});

export { router as ratingRoutes };
