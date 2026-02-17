describe('Dashboard Navigation', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
  });

  it('should display dashboard on login', async () => {
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
    await expect(element(by.id('profit-summary'))).toBeVisible();
    await expect(element(by.id('active-opportunities'))).toBeVisible();
  });

  it('should navigate between tabs', async () => {
    await element(by.id('opportunities-tab')).tap();
    await expect(element(by.id('opportunities-screen'))).toBeVisible();
    
    await element(by.id('bets-tab')).tap();
    await expect(element(by.id('bets-screen'))).toBeVisible();
    
    await element(by.id('quick-bet-tab')).tap();
    await expect(element(by.id('quick-bet-screen'))).toBeVisible();
    
    await element(by.id('profile-tab')).tap();
    await expect(element(by.id('profile-screen'))).toBeVisible();
    
    await element(by.id('dashboard-tab')).tap();
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('should show profit chart on dashboard', async () => {
    await expect(element(by.id('profit-chart'))).toBeVisible();
    await element(by.id('chart-period-week')).tap();
    await element(by.id('chart-period-month')).tap();
    await element(by.id('chart-period-year')).tap();
  });

  it('should display recent activity', async () => {
    await expect(element(by.id('recent-activity-list'))).toBeVisible();
    await expect(element(by.id('activity-item-0'))).toBeVisible();
  });
});

describe('Bets History', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await element(by.id('bets-tab')).tap();
  });

  it('should display bets list', async () => {
    await expect(element(by.id('bets-screen'))).toBeVisible();
    await expect(element(by.id('bets-list'))).toBeVisible();
  });

  it('should filter bets by status', async () => {
    await element(by.id('filter-active')).tap();
    await expect(element(by.id('bets-list'))).toBeVisible();
    
    await element(by.id('filter-won')).tap();
    await expect(element(by.id('bets-list'))).toBeVisible();
    
    await element(by.id('filter-lost')).tap();
    await expect(element(by.id('bets-list'))).toBeVisible();
  });

  it('should show bet details on tap', async () => {
    await element(by.id('bet-item-0')).tap();
    await expect(element(by.id('bet-detail-screen'))).toBeVisible();
    await expect(element(by.id('bet-odds'))).toBeVisible();
    await expect(element(by.id('bet-stake'))).toBeVisible();
    await expect(element(by.id('bet-profit'))).toBeVisible();
  });

  it('should support pull to refresh', async () => {
    await element(by.id('bets-list')).swipe('down', 'fast', 0.5);
    await expect(element(by.id('refresh-indicator'))).toBeVisible();
  });
});