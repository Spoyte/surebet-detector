describe('Quick Bet Flow', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await element(by.id('quick-bet-tab')).tap();
  });

  it('should display quick bet screen', async () => {
    await expect(element(by.id('quick-bet-screen'))).toBeVisible();
    await expect(element(by.id('opportunity-card'))).toBeVisible();
  });

  it('should allow one-tap stake entry', async () => {
    await element(by.id('preset-stake-50')).tap();
    await expect(element(by.id('stake-display'))).toHaveText('€50');
  });

  it('should swipe to confirm bet', async () => {
    await element(by.id('preset-stake-100')).tap();
    await element(by.id('confirm-slider')).swipe('right', 'fast', 0.8);
    
    await expect(element(by.id('bet-confirmation'))).toBeVisible();
  });

  it('should show bet placement loading state', async () => {
    await element(by.id('preset-stake-100')).tap();
    await element(by.id('confirm-slider')).swipe('right', 'fast', 0.8);
    
    await expect(element(by.id('placing-bet-indicator'))).toBeVisible();
  });

  it('should display success confirmation', async () => {
    await element(by.id('preset-stake-100')).tap();
    await element(by.id('confirm-slider')).swipe('right', 'fast', 0.8);
    
    await waitFor(element(by.id('bet-success')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should handle bet placement failure gracefully', async () => {
    // Simulate network error
    await device.setURLBlacklist(['.*api.*']);
    
    await element(by.id('preset-stake-100')).tap();
    await element(by.id('confirm-slider')).swipe('right', 'fast', 0.8);
    
    await expect(element(by.id('bet-error'))).toBeVisible();
    await expect(element(by.id('retry-button'))).toBeVisible();
    
    await device.setURLBlacklist([]);
  });
});

describe('Stake Calculator', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
  });

  it('should calculate dutching for multiple outcomes', async () => {
    await element(by.id('opportunities-tab')).tap();
    await element(by.id('opportunity-item-dutch')).tap();
    
    await element(by.id('total-stake-input')).typeText('300');
    await element(by.id('calculate-dutch-button')).tap();
    
    await expect(element(by.id('dutch-stakes-list'))).toBeVisible();
    await expect(element(by.id('dutch-profit'))).toBeVisible();
  });

  it('should apply Kelly Criterion calculation', async () => {
    await element(by.id('opportunities-tab')).tap();
    await element(by.id('opportunity-item-0')).tap();
    
    await element(by.id('kelly-toggle')).tap();
    await element(by.id('bankroll-input')).typeText('10000');
    await element(by.id('calculate-button')).tap();
    
    await expect(element(by.id('kelly-stake'))).toBeVisible();
    await expect(element(by.id('kelly-fraction'))).toBeVisible();
  });
});