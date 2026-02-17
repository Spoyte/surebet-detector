/**
 * Bookmaker Routes
 */

import { Router } from 'express';
import { Bookmaker } from '../models/Bookmaker.js';
import { AggregatedRating } from '../models/AggregatedRating.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/bookmakers
 * 
 * List all bookmakers with ratings
 */
router.get('/', async (req, res) => {
  try {
    const {
      country,
      sport,
      minRating,
      sortBy = 'rating',
      limit = 50,
      offset = 0
    } = req.query;

    const query: any = { isActive: true };
    
    if (country) query.countries = country;
    if (sport) query.sports = sport;

    const bookmakers = await Bookmaker.find(query)
      .skip(parseInt(offset as string))
      .limit(parseInt(limit as string))
      .lean();

    // Get ratings for these bookmakers
    const bookmakerIds = bookmakers.map(bm => bm._id);
    const ratings = await AggregatedRating.find({
      bookmakerId: { $in: bookmakerIds }
    }).lean();

    const ratingMap = new Map(ratings.map(r => [r.bookmakerId.toString(), r]));

    // Merge bookmakers with ratings
    let results = bookmakers.map(bm => {
      const rating = ratingMap.get(bm._id.toString());
      return {
        ...bm,
        rating: rating?.overall || { average: 0, count: 0 },
        categoryRatings: rating?.categories || {},
        withdrawalStats: rating?.withdrawalStats || {}
      };
    });

    // Filter by minimum rating
    if (minRating) {
      results = results.filter(bm => bm.rating.average >= parseFloat(minRating as string));
    }

    // Sort results
    if (sortBy === 'rating') {
      results.sort((a, b) => b.rating.average - a.rating.average);
    } else if (sortBy === 'reviews') {
      results.sort((a, b) => b.rating.count - a.rating.count);
    } else if (sortBy === 'name') {
      results.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    res.json({
      bookmakers: results,
      total: results.length,
      filters: { country, sport, minRating },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching bookmakers:', error);
    res.status(500).json({ error: 'Failed to fetch bookmakers' });
  }
});

/**
 * GET /api/bookmakers/:id
 * 
 * Get detailed bookmaker info with full ratings
 */
router.get('/:id', async (req, res) => {
  try {
    const bookmaker = await Bookmaker.findById(req.params.id).lean();
    
    if (!bookmaker) {
      return res.status(404).json({ error: 'Bookmaker not found' });
    }

    const rating = await AggregatedRating.findOne({
      bookmakerId: bookmaker._id
    }).lean();

    res.json({
      ...bookmaker,
      rating: rating?.overall || { average: 0, count: 0 },
      categoryRatings: rating?.categories || {},
      withdrawalStats: rating?.withdrawalStats || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching bookmaker:', error);
    res.status(500).json({ error: 'Failed to fetch bookmaker' });
  }
});

/**
 * GET /api/bookmakers/:id/compare
 * 
 * Compare bookmaker with others
 */
router.get('/:id/compare', async (req, res) => {
  try {
    const { ids } = req.query;
    const compareIds = ids ? (ids as string).split(',') : [];
    compareIds.push(req.params.id);

    const bookmakers = await Bookmaker.find({
      _id: { $in: compareIds },
      isActive: true
    }).lean();

    const ratings = await AggregatedRating.find({
      bookmakerId: { $in: bookmakers.map(bm => bm._id) }
    }).lean();

    const ratingMap = new Map(ratings.map(r => [r.bookmakerId.toString(), r]));

    const results = bookmakers.map(bm => ({
      ...bm,
      rating: ratingMap.get(bm._id.toString())?.overall || { average: 0, count: 0 },
      categories: ratingMap.get(bm._id.toString())?.categories || {}
    }));

    // Generate comparison
    const comparison = {
      bookmakers: results,
      rankings: generateRankings(results),
      bestInCategory: findBestInCategory(results),
      timestamp: new Date().toISOString()
    };

    res.json(comparison);
  } catch (error) {
    logger.error('Error comparing bookmakers:', error);
    res.status(500).json({ error: 'Failed to compare bookmakers' });
  }
});

/**
 * POST /api/bookmakers
 * 
 * Add a new bookmaker (admin only)
 */
router.post('/', async (req, res) => {
  try {
    const bookmaker = new Bookmaker(req.body);
    await bookmaker.save();

    // Create empty aggregated rating
    await AggregatedRating.create({ bookmakerId: bookmaker._id });

    res.status(201).json(bookmaker);
  } catch (error) {
    logger.error('Error creating bookmaker:', error);
    res.status(500).json({ error: 'Failed to create bookmaker' });
  }
});

// Helper functions
function generateRankings(bookmakers: any[]): any {
  const categories = ['overall', 'oddsQuality', 'withdrawalSpeed', 'customerService', 'websiteUsability'];
  const rankings: Record<string, any[]> = {};

  categories.forEach(cat => {
    const sorted = [...bookmakers].sort((a, b) => {
      const aVal = cat === 'overall' ? a.rating.average : a.categories?.[cat]?.average || 0;
      const bVal = cat === 'overall' ? b.rating.average : b.categories?.[cat]?.average || 0;
      return bVal - aVal;
    });

    rankings[cat] = sorted.map((bm, idx) => ({
      id: bm._id,
      name: bm.displayName,
      rank: idx + 1,
      score: cat === 'overall' ? bm.rating.average : bm.categories?.[cat]?.average || 0
    }));
  });

  return rankings;
}

function findBestInCategory(bookmakers: any[]): any {
  return {
    overall: bookmakers.reduce((best, curr) => 
      curr.rating.average > best.rating.average ? curr : best, bookmakers[0]),
    oddsQuality: bookmakers.reduce((best, curr) => 
      (curr.categories?.oddsQuality?.average || 0) > (best.categories?.oddsQuality?.average || 0) ? curr : best, bookmakers[0]),
    withdrawalSpeed: bookmakers.reduce((best, curr) => 
      (curr.categories?.withdrawalSpeed?.average || 0) > (best.categories?.withdrawalSpeed?.average || 0) ? curr : best, bookmakers[0]),
    customerService: bookmakers.reduce((best, curr) => 
      (curr.categories?.customerService?.average || 0) > (best.categories?.customerService?.average || 0) ? curr : best, bookmakers[0])
  };
}

export { router as bookmakerRoutes };
