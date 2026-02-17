describe('Opportunities Screen', () => {
  beforeEach(async () => {
    // Login first
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Navigate to opportunities tab
    await element(by.id('opportunities-tab')).tap();
  });

  it('should display opportunities list', async () => {
    await expect(element(by.id('opportunities-screen'))).toBeVisible();
    await expect(element(by.id('opportunities-list'))).toBeVisible();
  });

  it('should pull to refresh opportunities', async () => {
    await element(by.id('opportunities-list')).swipe('down', 'fast', 0.5);
    await expect(element(by.id('refresh-indicator'))).toBeVisible();
  });

  it('should filter opportunities by sport', async () => {
    await element(by.id('filter-button')).tap();
    await element(by.id('sport-filter-tennis')).tap();
    await element(by.id('apply-filters')).tap();
    
    await expect(element(by.id('opportunities-list'))).toBeVisible();
  });

  it('should filter opportunities by profit percentage', async () => {
    await element(by.id('filter-button')).tap();
    await element(by.id('min-profit-slider')).swipe('right', 'fast', 0.5);
    await element(by.id('apply-filters')).tap();
    
    await expect(element(by.id('opportunities-list'))).toBeVisible();
  });

  it('should navigate to opportunity detail on tap', async () => {
    await element(by.id('opportunity-item-0')).tap();
    await expect(element(by.id('opportunity-detail-screen'))).toBeVisible();
    await expect(element(by.id('stake-calculator'))).toBeVisible();
  });

  it('should show empty state when no opportunities', async () => {
    // Apply very restrictive filter
    await element(by.id('filter-button')).tap();
    await element(by.id('min-profit-input')).typeText('99');
    await element(by.id('apply-filters')).tap();
    
    await expect(element(by.id('empty-state'))).toBeVisible();
    await expect(element(by.text('No opportunities found'))).toBeVisible();
  });
});

describe('Opportunity Detail', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await element(by.id('opportunities-tab')).tap();
    await element(by.id('opportunity-item-0')).tap();
  });

  it('should display opportunity details', async () => {
    await expect(element(by.id('match-name'))).toBeVisible();
    await expect(element(by.id('profit-percentage'))).toBeVisible();
    await expect(element(by.id('bookmaker-odds'))).toBeVisible();
  });

  it('should calculate stakes correctly', async () => {
    await element(by.id('total-stake-input')).typeText('100');
    await element(by.id('calculate-button')).tap();
    
    await expect(element(by.id('stake-bookmaker-1'))).toBeVisible();
    await expect(element(by.id('stake-bookmaker-2'))).toBeVisible();
    await expect(element(by.id('guaranteed-profit'))).toBeVisible();
  });

  it('should bookmark opportunity', async () => {
    await element(by.id('bookmark-button')).tap();
    await expect(element(by.id('bookmark-active'))).toBeVisible();
  });

  it('should share opportunity', async () => {
    await element(by.id('share-button')).tap();
    await expect(element(by.id('share-sheet'))).toBeVisible();
  });
});