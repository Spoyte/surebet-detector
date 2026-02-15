/**
 * Tracks bookmaker promotions and boosted odds
 */
class PromotionsTracker {
    constructor() {
        this.promotions = [];
        this.combines = []; // Parlay/combiné boosts
    }

    /**
     * Add a manual promotion (user-input from screenshot or description)
     */
    addPromotion(promo) {
        const promotion = {
            id: Date.now().toString(),
            bookmaker: promo.bookmaker, // 'Unibet FR', 'Winamax', 'Betclic'
            type: promo.type, // 'oddsBoost', 'freeBet', 'combinéBoost', 'refund'
            description: promo.description,
            sport: promo.sport,
            minOdds: promo.minOdds || 1.0,
            maxOdds: promo.maxOdds || 999,
            boostPercent: promo.boostPercent || 0,
            expiry: promo.expiry,
            terms: promo.terms,
            addedAt: new Date().toISOString()
        };
        
        this.promotions.push(promotion);
        return promotion;
    }

    /**
     * Add a combiné (parlay) boost
     */
    addCombine(combine) {
        const combiné = {
            id: Date.now().toString(),
            bookmaker: combine.bookmaker,
            name: combine.name, // e.g., "Top des Combinés #1"
            legs: combine.legs.map(leg => ({
                event: leg.event,
                selection: leg.selection,
                originalOdds: leg.originalOdds,
                boostedOdds: leg.boostedOdds
            })),
            totalOriginalOdds: this.calculateCombineOdds(combine.legs.map(l => l.originalOdds)),
            totalBoostedOdds: this.calculateCombineOdds(combine.legs.map(l => l.boostedOdds)),
            effectiveBoost: 0,
            expiry: combine.expiry,
            addedAt: new Date().toISOString()
        };
        
        // Calculate effective boost percentage
        combiné.effectiveBoost = ((combiné.totalBoostedOdds / combiné.totalOriginalOdds) - 1) * 100;
        
        this.combines.push(combiné);
        return combiné;
    }

    /**
     * Calculate combined odds for a parlay
     */
    calculateCombineOdds(oddsArray) {
        return oddsArray.reduce((acc, odds) => acc * odds, 1);
    }

    /**
     * Analyze a combiné for hedging opportunities
     * This is complex - you'd need to lay each leg or find opposing parlays
     */
    analyzeCombineHedge(combiné, individualOdds) {
        // For a combiné hedge, you'd need to:
        // 1. Calculate implied probability of the combiné winning
        // 2. Find ways to bet against it (lay each leg on exchange, or find opposing outcomes)
        
        const impliedProb = 1 / combiné.totalBoostedOdds;
        
        // Simplified: if you can lay each leg at fair odds
        let layCost = 0;
        const legHedges = [];
        
        for (const leg of combiné.legs) {
            // Find opposing odds for this leg
            const opposing = individualOdds.find(o => 
                o.event === leg.event && o.selection !== leg.selection
            );
            
            if (opposing) {
                const layStake = 100 / opposing.odds; // Simplified
                layCost += layStake;
                legHedges.push({
                    leg: leg.event,
                    laySelection: opposing.selection,
                    layOdds: opposing.odds,
                    stake: layStake
                });
            }
        }

        const potentialProfit = 100 * combiné.totalBoostedOdds - 100 - layCost;
        
        return {
            combiné: combiné.name,
            totalBoostedOdds: combiné.totalBoostedOdds,
            impliedProbability: impliedProb * 100,
            hedgeCost: layCost,
            potentialProfit: potentialProfit,
            legs: legHedges,
            viable: potentialProfit > 0
        };
    }

    /**
     * Get active promotions for a specific bookmaker
     */
    getActivePromotions(bookmaker = null) {
        const now = new Date().toISOString();
        let active = this.promotions.filter(p => !p.expiry || p.expiry > now);
        
        if (bookmaker) {
            active = active.filter(p => p.bookmaker === bookmaker);
        }
        
        return active;
    }

    /**
     * Get active combinés
     */
    getActiveCombines(bookmaker = null) {
        const now = new Date().toISOString();
        let active = this.combines.filter(c => !c.expiry || c.expiry > now);
        
        if (bookmaker) {
            active = active.filter(c => c.bookmaker === bookmaker);
        }
        
        return active;
    }

    /**
     * Apply promotion to odds to get true +EV
     */
    applyPromotion(odds, promotion) {
        switch (promotion.type) {
            case 'oddsBoost':
                return odds * (1 + promotion.boostPercent / 100);
            
            case 'freeBet':
                // Free bet EV: stake not returned, so EV = (odds - 1) * probability * retention
                // Assuming 70% retention on free bet value
                return 1 + (odds - 1) * 0.7;
            
            case 'refund':
                // Refund if lose: effectively reduces risk
                // Simplified: adds ~5-10% EV depending on terms
                return odds * 1.05;
            
            default:
                return odds;
        }
    }

    /**
     * Export promotions data
     */
    export() {
        return {
            promotions: this.promotions,
            combines: this.combines,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import promotions data
     */
    import(data) {
        this.promotions = data.promotions || [];
        this.combines = data.combines || [];
    }
}

module.exports = PromotionsTracker;
