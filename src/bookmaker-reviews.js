/**
 * Bookmaker Reviews and Ratings Module for Surebet Detector
 * Tracks withdrawal speeds, customer service, odds quality, reliability scores
 */

const fs = require('fs');
const path = require('path');

class BookmakerReviews {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.reviewsFile = path.join(this.dataDir, 'bookmaker-reviews.json');
    this.ratingsFile = path.join(this.dataDir, 'bookmaker-ratings.json');
    
    // Initialize data structures
    this.reviews = this.loadReviews();
    this.ratings = this.loadRatings();
    
    // Review categories and their weights
    this.categories = {
      withdrawalSpeed: { weight: 0.25, label: 'Withdrawal Speed' },
      customerService: { weight: 0.20, label: 'Customer Service' },
      oddsQuality: { weight: 0.25, label: 'Odds Quality' },
      reliability: { weight: 0.20, label: 'Reliability' },
      userExperience: { weight: 0.10, label: 'User Experience' }
    };
    
    // Rating scale descriptions
    this.ratingDescriptions = {
      5: 'Excellent',
      4: 'Good',
      3: 'Average',
      2: 'Below Average',
      1: 'Poor'
    };
  }
  
  /**
   * Load reviews from file
   */
  loadReviews() {
    try {
      if (fs.existsSync(this.reviewsFile)) {
        return JSON.parse(fs.readFileSync(this.reviewsFile, 'utf8'));
      }
    } catch (err) {
      console.warn('Could not load reviews:', err.message);
    }
    return {};
  }
  
  /**
   * Load ratings from file
   */
  loadRatings() {
    try {
      if (fs.existsSync(this.ratingsFile)) {
        return JSON.parse(fs.readFileSync(this.ratingsFile, 'utf8'));
      }
    } catch (err) {
      console.warn('Could not load ratings:', err.message);
    }
    return {};
  }
  
  /**
   * Save reviews to file
   */
  saveReviews() {
    try {
      fs.writeFileSync(this.reviewsFile, JSON.stringify(this.reviews, null, 2));
    } catch (err) {
      console.warn('Could not save reviews:', err.message);
    }
  }
  
  /**
   * Save ratings to file
   */
  saveRatings() {
    try {
      fs.writeFileSync(this.ratingsFile, JSON.stringify(this.ratings, null, 2));
    } catch (err) {
      console.warn('Could not save ratings:', err.message);
    }
  }
  
  /**
   * Add or update a bookmaker review
   */
  addReview(bookmaker, review) {
    if (!this.reviews[bookmaker]) {
      this.reviews[bookmaker] = {
        name: bookmaker,
        reviews: [],
        stats: {
          totalReviews: 0,
          averageRating: 0,
          verifiedReviews: 0
        }
      };
    }
    
    const reviewEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      rating: review.rating,
      categories: review.categories || {},
      title: review.title || '',
      content: review.content || '',
      author: review.author || 'Anonymous',
      verified: review.verified || false,
      withdrawalExperience: review.withdrawalExperience || null,
      helpful: 0,
      reported: 0
    };
    
    this.reviews[bookmaker].reviews.push(reviewEntry);
    this.updateBookmakerStats(bookmaker);
    this.saveReviews();
    
    // Update ratings based on this review
    this.updateRatingsFromReview(bookmaker, reviewEntry);
    
    return reviewEntry;
  }
  
  /**
   * Update bookmaker statistics
   */
  updateBookmakerStats(bookmaker) {
    const data = this.reviews[bookmaker];
    if (!data) return;
    
    const reviews = data.reviews;
    data.stats.totalReviews = reviews.length;
    data.stats.verifiedReviews = reviews.filter(r => r.verified).length;
    
    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      data.stats.averageRating = Math.round((totalRating / reviews.length) * 100) / 100;
    }
  }
  
  /**
   * Update ratings based on a review
   */
  updateRatingsFromReview(bookmaker, review) {
    if (!this.ratings[bookmaker]) {
      this.ratings[bookmaker] = this.initializeRatings(bookmaker);
    }
    
    const ratings = this.ratings[bookmaker];
    
    // Update category ratings if provided
    Object.entries(review.categories).forEach(([category, rating]) => {
      if (ratings.categories[category]) {
        ratings.categories[category].total += rating;
        ratings.categories[category].count += 1;
        ratings.categories[category].average = Math.round(
          (ratings.categories[category].total / ratings.categories[category].count) * 100
        ) / 100;
      }
    });
    
    // Update withdrawal stats if provided
    if (review.withdrawalExperience) {
      ratings.withdrawalStats.times.push(review.withdrawalExperience.time);
      ratings.withdrawalStats.methods.push(review.withdrawalExperience.method);
      
      // Calculate average withdrawal time
      const times = ratings.withdrawalStats.times;
      ratings.withdrawalStats.averageTime = Math.round(
        times.reduce((sum, t) => sum + t, 0) / times.length
      );
    }
    
    // Recalculate overall score
    this.calculateOverallScore(bookmaker);
    
    this.saveRatings();
  }
  
  /**
   * Initialize ratings structure for a bookmaker
   */
  initializeRatings(bookmaker) {
    const categories = {};
    Object.keys(this.categories).forEach(key => {
      categories[key] = {
        total: 0,
        count: 0,
        average: 0
      };
    });
    
    return {
      name: bookmaker,
      overallScore: 0,
      categories,
      withdrawalStats: {
        times: [],
        methods: [],
        averageTime: 0
      },
      oddsQuality: {
        averageMargin: null,
        competitiveness: 0,
        marketCoverage: 0
      },
      reliability: {
        uptime: 100,
        apiStability: 100,
        lastIncident: null
      },
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Calculate overall score for a bookmaker
   */
  calculateOverallScore(bookmaker) {
    const ratings = this.ratings[bookmaker];
    if (!ratings) return 0;
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    Object.entries(this.categories).forEach(([key, config]) => {
      const category = ratings.categories[key];
      if (category && category.count > 0) {
        weightedSum += category.average * config.weight;
        totalWeight += config.weight;
      }
    });
    
    ratings.overallScore = totalWeight > 0 
      ? Math.round((weightedSum / totalWeight) * 100) / 100 
      : 0;
    
    ratings.lastUpdated = new Date().toISOString();
    
    return ratings.overallScore;
  }
  
  /**
   * Record odds quality metrics from analysis
   */
  recordOddsQuality(bookmaker, metrics) {
    if (!this.ratings[bookmaker]) {
      this.ratings[bookmaker] = this.initializeRatings(bookmaker);
    }
    
    const oddsQuality = this.ratings[bookmaker].oddsQuality;
    
    if (metrics.averageMargin !== undefined) {
      oddsQuality.averageMargin = metrics.averageMargin;
    }
    if (metrics.competitiveness !== undefined) {
      oddsQuality.competitiveness = metrics.competitiveness;
    }
    if (metrics.marketCoverage !== undefined) {
      oddsQuality.marketCoverage = metrics.marketCoverage;
    }
    
    // Update odds quality category based on metrics
    const ratings = this.ratings[bookmaker].categories;
    if (!ratings.oddsQuality) {
      ratings.oddsQuality = { total: 0, count: 0, average: 0 };
    }
    
    // Calculate odds quality rating (1-5) based on margin
    // Lower margin = higher rating
    let rating = 3;
    if (oddsQuality.averageMargin !== null) {
      if (oddsQuality.averageMargin < 0.05) rating = 5;
      else if (oddsQuality.averageMargin < 0.07) rating = 4;
      else if (oddsQuality.averageMargin < 0.10) rating = 3;
      else if (oddsQuality.averageMargin < 0.15) rating = 2;
      else rating = 1;
    }
    
    ratings.oddsQuality.total += rating;
    ratings.oddsQuality.count += 1;
    ratings.oddsQuality.average = Math.round(
      (ratings.oddsQuality.total / ratings.oddsQuality.count) * 100
    ) / 100;
    
    this.calculateOverallScore(bookmaker);
    this.saveRatings();
    
    return this.ratings[bookmaker];
  }
  
  /**
   * Record reliability metrics
   */
  recordReliability(bookmaker, metrics) {
    if (!this.ratings[bookmaker]) {
      this.ratings[bookmaker] = this.initializeRatings(bookmaker);
    }
    
    const reliability = this.ratings[bookmaker].reliability;
    
    if (metrics.uptime !== undefined) {
      reliability.uptime = metrics.uptime;
    }
    if (metrics.apiStability !== undefined) {
      reliability.apiStability = metrics.apiStability;
    }
    if (metrics.incident) {
      reliability.lastIncident = {
        timestamp: new Date().toISOString(),
        description: metrics.incident
      };
    }
    
    // Update reliability category
    const ratings = this.ratings[bookmaker].categories;
    if (!ratings.reliability) {
      ratings.reliability = { total: 0, count: 0, average: 0 };
    }
    
    // Calculate reliability rating based on uptime
    let rating = 3;
    if (reliability.uptime >= 99.9) rating = 5;
    else if (reliability.uptime >= 99.5) rating = 4;
    else if (reliability.uptime >= 99) rating = 3;
    else if (reliability.uptime >= 95) rating = 2;
    else rating = 1;
    
    ratings.reliability.total += rating;
    ratings.reliability.count += 1;
    ratings.reliability.average = Math.round(
      (ratings.reliability.total / ratings.reliability.count) * 100
    ) / 100;
    
    this.calculateOverallScore(bookmaker);
    this.saveRatings();
    
    return this.ratings[bookmaker];
  }
  
  /**
   * Get all bookmaker ratings
   */
  getAllRatings(options = {}) {
    const { sortBy = 'overallScore', minReviews = 0 } = options;
    
    let ratings = Object.values(this.ratings);
    
    // Filter by minimum reviews
    if (minReviews > 0) {
      ratings = ratings.filter(r => {
        const reviewCount = this.reviews[r.name]?.stats?.totalReviews || 0;
        return reviewCount >= minReviews;
      });
    }
    
    // Sort
    ratings.sort((a, b) => {
      if (sortBy === 'overallScore') return b.overallScore - a.overallScore;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'withdrawalSpeed') {
        return (a.categories.withdrawalSpeed?.average || 0) - 
               (b.categories.withdrawalSpeed?.average || 0);
      }
      return b.overallScore - a.overallScore;
    });
    
    return ratings;
  }
  
  /**
   * Get detailed rating for a specific bookmaker
   */
  getBookmakerRating(bookmaker) {
    const rating = this.ratings[bookmaker];
    if (!rating) return null;
    
    const reviews = this.reviews[bookmaker];
    
    return {
      ...rating,
      reviewStats: reviews?.stats || { totalReviews: 0, averageRating: 0 },
      recentReviews: reviews?.reviews?.slice(-5) || [],
      categoryBreakdown: this.getCategoryBreakdown(bookmaker)
    };
  }
  
  /**
   * Get category breakdown with descriptions
   */
  getCategoryBreakdown(bookmaker) {
    const rating = this.ratings[bookmaker];
    if (!rating) return {};
    
    const breakdown = {};
    Object.entries(this.categories).forEach(([key, config]) => {
      const category = rating.categories[key];
      const score = category?.average || 0;
      breakdown[key] = {
        label: config.label,
        score,
        description: this.getRatingDescription(score),
        weight: config.weight
      };
    });
    
    return breakdown;
  }
  
  /**
   * Get rating description
   */
  getRatingDescription(score) {
    const rounded = Math.round(score);
    return this.ratingDescriptions[rounded] || 'Unknown';
  }
  
  /**
   * Get top rated bookmakers
   */
  getTopRated(limit = 10, options = {}) {
    return this.getAllRatings({ ...options, sortBy: 'overallScore' }).slice(0, limit);
  }
  
  /**
   * Get bookmakers by category rating
   */
  getBestByCategory(category, limit = 5) {
    const ratings = Object.values(this.ratings)
      .filter(r => r.categories[category]?.count > 0)
      .sort((a, b) => {
        return (b.categories[category]?.average || 0) - 
               (a.categories[category]?.average || 0);
      });
    
    return ratings.slice(0, limit);
  }
  
  /**
   * Get withdrawal speed rankings
   */
  getWithdrawalRankings() {
    return Object.values(this.ratings)
      .filter(r => r.withdrawalStats.averageTime > 0)
      .sort((a, b) => a.withdrawalStats.averageTime - b.withdrawalStats.averageTime)
      .map(r => ({
        name: r.name,
        averageHours: r.withdrawalStats.averageTime,
        methods: [...new Set(r.withdrawalStats.methods)],
        overallScore: r.overallScore
      }));
  }
  
  /**
   * Compare multiple bookmakers
   */
  compareBookmakers(bookmakers) {
    return bookmakers.map(name => this.getBookmakerRating(name)).filter(Boolean);
  }
  
  /**
   * Mark a review as helpful
   */
  markHelpful(bookmaker, reviewId) {
    const reviews = this.reviews[bookmaker]?.reviews;
    if (!reviews) return false;
    
    const review = reviews.find(r => r.id === reviewId);
    if (review) {
      review.helpful++;
      this.saveReviews();
      return true;
    }
    return false;
  }
  
  /**
   * Report a review
   */
  reportReview(bookmaker, reviewId) {
    const reviews = this.reviews[bookmaker]?.reviews;
    if (!reviews) return false;
    
    const review = reviews.find(r => r.id === reviewId);
    if (review) {
      review.reported++;
      this.saveReviews();
      return true;
    }
    return false;
  }
  
  /**
   * Get review statistics
   */
  getReviewStats() {
    const stats = {
      totalBookmakers: Object.keys(this.reviews).length,
      totalReviews: 0,
      verifiedReviews: 0,
      averageRating: 0,
      categoryAverages: {}
    };
    
    let totalRating = 0;
    let ratingCount = 0;
    
    Object.values(this.reviews).forEach(bookmaker => {
      stats.totalReviews += bookmaker.stats.totalReviews;
      stats.verifiedReviews += bookmaker.stats.verifiedReviews;
      
      bookmaker.reviews.forEach(review => {
        totalRating += review.rating;
        ratingCount++;
        
        Object.entries(review.categories).forEach(([category, rating]) => {
          if (!stats.categoryAverages[category]) {
            stats.categoryAverages[category] = { total: 0, count: 0 };
          }
          stats.categoryAverages[category].total += rating;
          stats.categoryAverages[category].count++;
        });
      });
    });
    
    if (ratingCount > 0) {
      stats.averageRating = Math.round((totalRating / ratingCount) * 100) / 100;
    }
    
    // Calculate category averages
    Object.entries(stats.categoryAverages).forEach(([category, data]) => {
      stats.categoryAverages[category] = Math.round((data.total / data.count) * 100) / 100;
    });
    
    return stats;
  }
  
  /**
   * Generate a comprehensive report
   */
  generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: this.getReviewStats(),
      topRated: this.getTopRated(10),
      bestWithdrawalSpeed: this.getBestByCategory('withdrawalSpeed', 5),
      bestOddsQuality: this.getBestByCategory('oddsQuality', 5),
      bestCustomerService: this.getBestByCategory('customerService', 5),
      mostReliable: this.getBestByCategory('reliability', 5),
      withdrawalRankings: this.getWithdrawalRankings(),
      allRatings: this.getAllRatings()
    };
    
    return report;
  }
  
  /**
   * Export data
   */
  exportData(format = 'json') {
    if (format === 'json') {
      return JSON.stringify({
        reviews: this.reviews,
        ratings: this.ratings
      }, null, 2);
    }
    
    if (format === 'csv') {
      // Generate CSV of ratings
      const headers = ['Bookmaker', 'Overall Score', 'Withdrawal Speed', 'Customer Service', 
                      'Odds Quality', 'Reliability', 'User Experience', 'Avg Withdrawal Hours'];
      
      const rows = Object.values(this.ratings).map(r => [
        r.name,
        r.overallScore,
        r.categories.withdrawalSpeed?.average || 0,
        r.categories.customerService?.average || 0,
        r.categories.oddsQuality?.average || 0,
        r.categories.reliability?.average || 0,
        r.categories.userExperience?.average || 0,
        r.withdrawalStats.averageTime
      ]);
      
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
    
    return null;
  }
  
  /**
   * Generate unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

module.exports = BookmakerReviews;