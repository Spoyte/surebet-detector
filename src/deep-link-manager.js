/**
 * Deep Linking Manager
 * Handles universal links and app links for opportunities
 */

const crypto = require('crypto');

class DeepLinkManager {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://surebet.app',
      appScheme: config.appScheme || 'surebet',
      linkTTL: config.linkTTL || 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };
    
    // In-memory store for link metadata - use Redis in production
    this.linkStore = new Map();
  }

  /**
   * Generate a short unique ID for links
   */
  generateLinkId() {
    return crypto.randomBytes(6).toString('base64url');
  }

  /**
   * Create a deep link for an opportunity
   */
  createOpportunityLink(opportunity, options = {}) {
    const linkId = this.generateLinkId();
    const expiresAt = new Date(Date.now() + this.config.linkTTL);
    
    const linkData = {
      id: linkId,
      type: 'opportunity',
      opportunityId: opportunity.id,
      matchId: opportunity.matchId,
      data: {
        profitPercentage: opportunity.profitPercentage,
        evPercentage: opportunity.evPercentage,
        type: opportunity.type,
        marketType: opportunity.marketType,
        homeTeam: opportunity.match?.homeTeam,
        awayTeam: opportunity.match?.awayTeam,
        startTime: opportunity.match?.startTime,
      },
      createdAt: new Date(),
      expiresAt,
      clickCount: 0,
      metadata: {
        source: options.source || 'app',
        campaign: options.campaign,
        medium: options.medium,
        userId: options.userId,
      },
    };

    this.linkStore.set(linkId, linkData);

    return {
      linkId,
      shortUrl: `${this.config.baseUrl}/o/${linkId}`,
      universalLink: `${this.config.baseUrl}/opportunity/${linkId}`,
      appLink: `${this.config.appScheme}://opportunity/${opportunity.id}`,
      expiresAt,
    };
  }

  /**
   * Create a deep link for a bet
   */
  createBetLink(bet, options = {}) {
    const linkId = this.generateLinkId();
    const expiresAt = new Date(Date.now() + this.config.linkTTL);
    
    const linkData = {
      id: linkId,
      type: 'bet',
      betId: bet.id,
      data: {
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        status: bet.status,
        match: bet.match,
        bookmaker: bet.bookmaker,
      },
      createdAt: new Date(),
      expiresAt,
      clickCount: 0,
      metadata: options,
    };

    this.linkStore.set(linkId, linkData);

    return {
      linkId,
      shortUrl: `${this.config.baseUrl}/b/${linkId}`,
      universalLink: `${this.config.baseUrl}/bet/${linkId}`,
      appLink: `${this.config.appScheme}://bet/${bet.id}`,
      expiresAt,
    };
  }

  /**
   * Create a deep link for analytics/report sharing
   */
  createAnalyticsLink(analyticsData, options = {}) {
    const linkId = this.generateLinkId();
    const expiresAt = new Date(Date.now() + this.config.linkTTL * 7); // 7 days for analytics
    
    const linkData = {
      id: linkId,
      type: 'analytics',
      data: analyticsData,
      createdAt: new Date(),
      expiresAt,
      clickCount: 0,
      metadata: options,
    };

    this.linkStore.set(linkId, linkData);

    return {
      linkId,
      shortUrl: `${this.config.baseUrl}/a/${linkId}`,
      universalLink: `${this.config.baseUrl}/analytics/${linkId}`,
      expiresAt,
    };
  }

  /**
   * Resolve a short link to its full data
   */
  resolveLink(linkId) {
    const linkData = this.linkStore.get(linkId);
    
    if (!linkData) {
      return null;
    }

    // Check expiration
    if (new Date() > linkData.expiresAt) {
      this.linkStore.delete(linkId);
      return null;
    }

    // Increment click count
    linkData.clickCount++;
    linkData.lastClickedAt = new Date();

    return linkData;
  }

  /**
   * Get link metadata without incrementing click count
   */
  getLinkMetadata(linkId) {
    const linkData = this.linkStore.get(linkId);
    
    if (!linkData || new Date() > linkData.expiresAt) {
      return null;
    }

    return {
      id: linkData.id,
      type: linkData.type,
      createdAt: linkData.createdAt,
      expiresAt: linkData.expiresAt,
      clickCount: linkData.clickCount,
      metadata: linkData.metadata,
    };
  }

  /**
   * Generate Apple App Site Association file content
   */
  generateAppleAppSiteAssociation() {
    return {
      applinks: {
        details: [
          {
            appIDs: ['com.yourcompany.surebet'],
            components: [
              {
                '/': '/o/*',
                comment: 'Opportunity short links',
              },
              {
                '/': '/opportunity/*',
                comment: 'Opportunity universal links',
              },
              {
                '/': '/b/*',
                comment: 'Bet short links',
              },
              {
                '/': '/bet/*',
                comment: 'Bet universal links',
              },
              {
                '/': '/a/*',
                comment: 'Analytics short links',
              },
            ],
          },
        ],
      },
      webcredentials: {
        apps: ['com.yourcompany.surebet'],
      },
      appclips: {
        apps: ['com.yourcompany.surebet.clip'],
      },
    };
  }

  /**
   * Generate Android Asset Links file content
   */
  generateAndroidAssetLinks() {
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.yourcompany.surebet',
          sha256_cert_fingerprints: [
            'YOUR_SHA256_CERT_FINGERPRINT_HERE',
          ],
        },
      },
    ];
  }

  /**
   * Clean up expired links
   */
  cleanupExpiredLinks() {
    const now = new Date();
    let cleaned = 0;
    
    for (const [linkId, linkData] of this.linkStore) {
      if (now > linkData.expiresAt) {
        this.linkStore.delete(linkId);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Get link statistics
   */
  getStats() {
    const stats = {
      total: this.linkStore.size,
      byType: {},
      totalClicks: 0,
      expired: 0,
    };

    const now = new Date();

    for (const linkData of this.linkStore.values()) {
      // Count by type
      stats.byType[linkData.type] = (stats.byType[linkData.type] || 0) + 1;
      
      // Total clicks
      stats.totalClicks += linkData.clickCount;
      
      // Expired count
      if (now > linkData.expiresAt) {
        stats.expired++;
      }
    }

    return stats;
  }

  /**
   * Generate HTML for the interstitial page (for web users)
   */
  generateInterstitialPage(linkData, appStoreUrl, playStoreUrl) {
    const appLink = this.getAppLink(linkData);
    const title = this.getPageTitle(linkData);
    const description = this.getPageDescription(linkData);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph -->
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${this.config.baseUrl}/o/${linkData.id}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
        }
        .logo {
            width: 80px;
            height: 80px;
            margin-bottom: 20px;
        }
        h1 {
            font-size: 24px;
            margin-bottom: 10px;
        }
        .details {
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .profit {
            font-size: 36px;
            font-weight: bold;
            color: #4ade80;
        }
        .teams {
            font-size: 18px;
            margin: 10px 0;
        }
        .btn {
            display: block;
            width: 100%;
            padding: 16px;
            margin: 10px 0;
            border-radius: 12px;
            border: none;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
        }
        .btn-primary {
            background: #4ade80;
            color: #000;
        }
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }
        .stores {
            margin-top: 30px;
        }
        .store-btn {
            display: inline-block;
            margin: 5px;
        }
    </style>
    
    <script>
        // Try to open app
        window.onload = function() {
            window.location.href = '${appLink}';
        };
    </script>
</head>
<body>
    <div class="container">
        <div class="logo">🎯</div>
        <h1>${title}</h1>
        
        <div class="details">
            ${this.getDetailsHtml(linkData)}
        </div>
        
        <a href="${appLink}" class="btn btn-primary">Open in Surebet App</a>
        <a href="${this.config.baseUrl}" class="btn btn-secondary">Continue to Web</a>
        
        <div class="stores">
            <p>Don't have the app?</p>
            <a href="${appStoreUrl}" class="store-btn">App Store</a>
            <a href="${playStoreUrl}" class="store-btn">Play Store</a>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Get the app link for a link data object
   */
  getAppLink(linkData) {
    switch (linkData.type) {
      case 'opportunity':
        return `${this.config.appScheme}://opportunity/${linkData.opportunityId}`;
      case 'bet':
        return `${this.config.appScheme}://bet/${linkData.betId}`;
      case 'analytics':
        return `${this.config.appScheme}://analytics`;
      default:
        return `${this.config.appScheme}://`;
    }
  }

  /**
   * Get page title for interstitial
   */
  getPageTitle(linkData) {
    switch (linkData.type) {
      case 'opportunity':
        const profit = linkData.data.profitPercentage;
        return profit 
          ? `${profit.toFixed(2)}% Arbitrage Opportunity`
          : 'Betting Opportunity';
      case 'bet':
        return 'Bet Details';
      case 'analytics':
        return 'Performance Analytics';
      default:
        return 'Surebet';
    }
  }

  /**
   * Get page description for interstitial
   */
  getPageDescription(linkData) {
    switch (linkData.type) {
      case 'opportunity':
        const { homeTeam, awayTeam } = linkData.data;
        return homeTeam && awayTeam 
          ? `${homeTeam} vs ${awayTeam} - Guaranteed profit opportunity`
          : 'Guaranteed profit betting opportunity';
      case 'bet':
        return `Bet on ${linkData.data.selection} @ ${linkData.data.odds}`;
      case 'analytics':
        return 'View detailed betting performance analytics';
      default:
        return 'Surebet - Smart Betting Tools';
    }
  }

  /**
   * Get details HTML for interstitial
   */
  getDetailsHtml(linkData) {
    switch (linkData.type) {
      case 'opportunity':
        const { profitPercentage, evPercentage, homeTeam, awayTeam, type } = linkData.data;
        let html = '';
        
        if (profitPercentage) {
          html += `<div class="profit">+${profitPercentage.toFixed(2)}%</div>`;
        } else if (evPercentage) {
          html += `<div class="profit">+${evPercentage.toFixed(2)}% EV</div>`;
        }
        
        if (homeTeam && awayTeam) {
          html += `<div class="teams">${homeTeam} vs ${awayTeam}</div>`;
        }
        
        html += `<div class="type">${type}</div>`;
        return html;
        
      case 'bet':
        return `
          <div class="teams">${linkData.data.selection}</div>
          <div class="profit">@${linkData.data.odds}</div>
          <div class="type">Stake: €${linkData.data.stake}</div>
        `;
        
      default:
        return '<p>View details in the app</p>';
    }
  }
}

module.exports = { DeepLinkManager };
