/**
 * Stats Routes
 */

import { Router } from 'express';
import { Review } from '../models/Review.js';
import { AggregatedRating } from '../models/AggregatedRating.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/stats/overview
 * 
 * Get review system statistics
 */
router.get('/overview', async (req, res) => {
  try {
    const [
      totalReviews,
      pendingReviews,
      approvedReviews,
      recentReviews,
      avgRating
    ] = await Promise.all([
      Review.countDocuments(),
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }),
      Review.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ])
    ]);

    res.json({
      totalReviews,
      pendingReviews,
      approvedReviews,
      recentReviews,
      averageRating: avgRating[0]?.avg || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching stats overview:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/stats/trends
 * 
 * Get review trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trends = await Review.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'approved'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } }
    ]);

    res.json({
      trends: trends.map(t => ({
        date: `${t._id.year}-${String(t._id.month).padStart(2, '0')}-${String(t._id.day).padStart(2, '0')}`,
        count: t.count,
        averageRating: t.avgRating
      })),
      period: `${days} days`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/**
 * GET /api/stats/bookmaker/:id
 * 
 * Get detailed stats for a bookmaker
 */
router.get('/bookmaker/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [
      totalReviews,
      ratingDistribution,
      categoryAverages,
      recentActivity
    ] = await Promise.all([
      Review.countDocuments({ bookmakerId: id, status: 'approved' }),
      Review.aggregate([
        { $match: { bookmakerId: id, status: 'approved' } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Review.aggregate([
        { $match: { bookmakerId: id, status: 'approved' } },
        {
          $group: {
            _id: null,
            oddsQuality: { $avg: '$categories.oddsQuality' },
            withdrawalSpeed: { $avg: '$categories.withdrawalSpeed' },
            customerService: { $avg: '$categories.customerService' },
            websiteUsability: { $avg: '$categories.websiteUsability' },
            bonusOffers: { $avg: '$categories.bonusOffers' },
            mobileExperience: { $avg: '$categories.mobileExperience' }
          }
        }
      ]),
      Review.find({ bookmakerId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('rating status createdAt')
        .lean()
    ]);

    res.json({
      bookmakerId: id,
      totalReviews,
      ratingDistribution: ratingDistribution.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {} as Record<number, number>),
      categoryAverages: categoryAverages[0] || {},
      recentActivity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching bookmaker stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export { router as statsRoutes };
