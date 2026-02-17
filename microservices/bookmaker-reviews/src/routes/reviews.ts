/**
 * Review Routes
 */

import { Router } from 'express';
import { Review } from '../models/Review.js';
import { Bookmaker } from '../models/Bookmaker.js';
import { AggregatedRating } from '../models/AggregatedRating.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

const router = Router();

/**
 * GET /api/reviews
 * 
 * Get reviews with filters
 */
router.get('/', async (req, res) => {
  try {
    const {
      bookmakerId,
      userId,
      status = 'approved',
      sortBy = 'recent',
      limit = 20,
      offset = 0
    } = req.query;

    const query: any = {};
    
    if (bookmakerId) query.bookmakerId = bookmakerId;
    if (userId) query.userId = userId;
    if (status) query.status = status;

    let sort: any = {};
    if (sortBy === 'recent') sort = { createdAt: -1 };
    else if (sortBy === 'helpful') sort = { helpfulCount: -1 };
    else if (sortBy === 'rating') sort = { rating: -1 };

    const reviews = await Review.find(query)
      .sort(sort)
      .skip(parseInt(offset as string))
      .limit(parseInt(limit as string))
      .lean();

    const total = await Review.countDocuments(query);

    res.json({
      reviews,
      total,
      filters: { bookmakerId, userId, status },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * GET /api/reviews/:id
 * 
 * Get single review
 */
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).lean();
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(review);
  } catch (error) {
    logger.error('Error fetching review:', error);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

/**
 * POST /api/reviews
 * 
 * Submit a new review
 */
router.post('/', async (req, res) => {
  try {
    const {
      bookmakerId,
      userId,
      userName,
      rating,
      categories,
      title,
      content,
      pros,
      cons,
      withdrawalExperience
    } = req.body;

    // Validate required fields
    if (!bookmakerId || !userId || !rating || !title || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields: bookmakerId, userId, rating, title, content' 
      });
    }

    // Check if bookmaker exists
    const bookmaker = await Bookmaker.findById(bookmakerId);
    if (!bookmaker) {
      return res.status(404).json({ error: 'Bookmaker not found' });
    }

    // Check for existing review
    const existingReview = await Review.findOne({ bookmakerId, userId });
    if (existingReview) {
      return res.status(409).json({ 
        error: 'You have already reviewed this bookmaker',
        reviewId: existingReview._id
      });
    }

    const review = new Review({
      bookmakerId,
      userId,
      userName,
      rating,
      categories,
      title,
      content,
      pros,
      cons,
      withdrawalExperience,
      status: 'pending' // Require approval
    });

    await review.save();
    metrics.reviewSubmissions.inc({ status: 'success' });

    // Update aggregated ratings asynchronously
    updateAggregatedRatings(bookmakerId).catch(err => 
      logger.error('Error updating aggregated ratings:', err)
    );

    res.status(201).json({
      message: 'Review submitted successfully and is pending approval',
      reviewId: review._id
    });
  } catch (error) {
    logger.error('Error creating review:', error);
    metrics.reviewSubmissions.inc({ status: 'error' });
    res.status(500).json({ error: 'Failed to create review' });
  }
});

/**
 * PUT /api/reviews/:id
 * 
 * Update a review
 */
router.put('/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const review = await Review.findOne({
      _id: req.params.id,
      userId
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found or unauthorized' });
    }

    // Only allow updates to certain fields
    const allowedUpdates = ['rating', 'categories', 'title', 'content', 'pros', 'cons'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        (review as any)[field] = req.body[field];
      }
    });

    review.status = 'pending'; // Re-approve after edit
    await review.save();

    // Update aggregated ratings
    updateAggregatedRatings(review.bookmakerId).catch(err => 
      logger.error('Error updating aggregated ratings:', err)
    );

    res.json({
      message: 'Review updated successfully and is pending approval',
      review
    });
  } catch (error) {
    logger.error('Error updating review:', error);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

/**
 * DELETE /api/reviews/:id
 * 
 * Delete a review
 */
router.delete('/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const review = await Review.findOneAndDelete({
      _id: req.params.id,
      userId
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found or unauthorized' });
    }

    // Update aggregated ratings
    updateAggregatedRatings(review.bookmakerId).catch(err => 
      logger.error('Error updating aggregated ratings:', err)
    );

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    logger.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

/**
 * POST /api/reviews/:id/helpful
 * 
 * Mark review as helpful
 */
router.post('/:id/helpful', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // In production, track which users found it helpful to prevent duplicates
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpfulCount: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json({ helpfulCount: review.helpfulCount });
  } catch (error) {
    logger.error('Error marking review helpful:', error);
    res.status(500).json({ error: 'Failed to mark review helpful' });
  }
});

/**
 * POST /api/reviews/:id/report
 * 
 * Report a review
 */
router.post('/:id/report', async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { reportedCount: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // In production, send notification to moderators
    logger.warn(`Review reported`, { reviewId: req.params.id, userId, reason });

    res.json({ message: 'Review reported successfully' });
  } catch (error) {
    logger.error('Error reporting review:', error);
    res.status(500).json({ error: 'Failed to report review' });
  }
});

/**
 * PUT /api/reviews/:id/approve
 * 
 * Approve a review (admin only)
 */
router.put('/:id/approve', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status: 'approved' },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Update aggregated ratings
    updateAggregatedRatings(review.bookmakerId).catch(err => 
      logger.error('Error updating aggregated ratings:', err)
    );

    res.json({ message: 'Review approved', review });
  } catch (error) {
    logger.error('Error approving review:', error);
    res.status(500).json({ error: 'Failed to approve review' });
  }
});

// Helper function to update aggregated ratings
async function updateAggregatedRatings(bookmakerId: any) {
  const reviews = await Review.find({
    bookmakerId,
    status: 'approved'
  }).lean();

  if (reviews.length === 0) {
    await AggregatedRating.findOneAndUpdate(
      { bookmakerId },
      {
        overall: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        categories: {
          oddsQuality: { average: 0, count: 0 },
          withdrawalSpeed: { average: 0, count: 0 },
          customerService: { average: 0, count: 0 },
          websiteUsability: { average: 0, count: 0 },
          bonusOffers: { average: 0, count: 0 },
          mobileExperience: { average: 0, count: 0 }
        },
        withdrawalStats: { averageTime: 0, count: 0, successRate: 0 },
        lastUpdated: new Date()
      },
      { upsert: true }
    );
    return;
  }

  // Calculate overall rating
  const overallSum = reviews.reduce((sum, r) => sum + r.rating, 0);
  const overallAvg = overallSum / reviews.length;
  
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach(r => {
    distribution[r.rating as keyof typeof distribution]++;
  });

  // Calculate category ratings
  const categories: any = {};
  const categoryNames = ['oddsQuality', 'withdrawalSpeed', 'customerService', 'websiteUsability', 'bonusOffers', 'mobileExperience'];
  
  categoryNames.forEach(cat => {
    const catReviews = reviews.filter(r => r.categories?.[cat as keyof typeof r.categories]);
    if (catReviews.length > 0) {
      const sum = catReviews.reduce((s, r) => s + (r.categories as any)[cat], 0);
      categories[cat] = { average: sum / catReviews.length, count: catReviews.length };
    } else {
      categories[cat] = { average: 0, count: 0 };
    }
  });

  // Calculate withdrawal stats
  const withdrawalReviews = reviews.filter(r => r.withdrawalExperience?.receivedAt);
  let withdrawalStats = { averageTime: 0, count: 0, successRate: 0 };
  
  if (withdrawalReviews.length > 0) {
    const times = withdrawalReviews.map(r => {
      const requested = new Date(r.withdrawalExperience!.requestedAt).getTime();
      const received = new Date(r.withdrawalExperience!.receivedAt!).getTime();
      return (received - requested) / (1000 * 60 * 60); // hours
    });
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const successCount = withdrawalReviews.filter(r => r.withdrawalExperience?.status === 'completed').length;
    
    withdrawalStats = {
      averageTime: avgTime,
      count: withdrawalReviews.length,
      successRate: (successCount / withdrawalReviews.length) * 100
    };
  }

  await AggregatedRating.findOneAndUpdate(
    { bookmakerId },
    {
      overall: { average: overallAvg, count: reviews.length, distribution },
      categories,
      withdrawalStats,
      lastUpdated: new Date()
    },
    { upsert: true }
  );
}

export { router as reviewRoutes };
