describe('Offline Mode', () => {
  beforeEach(async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
  });

  it('should show offline indicator when network is lost', async () => {
    await device.setWiFi(false);
    
    await expect(element(by.id('offline-indicator'))).toBeVisible();
    await expect(element(by.text('You are offline'))).toBeVisible();
    
    await device.setWiFi(true);
  });

  it('should display cached opportunities when offline', async () => {
    // First load some data while online
    await element(by.id('opportunities-tab')).tap();
    await expect(element(by.id('opportunities-list'))).toBeVisible();
    
    // Go offline
    await device.setWiFi(false);
    
    // Should still show cached data
    await expect(element(by.id('opportunities-list'))).toBeVisible();
    await expect(element(by.id('offline-badge'))).toBeVisible();
    
    await device.setWiFi(true);
  });

  it('should queue actions for sync when back online', async () => {
    await element(by.id('quick-bet-tab')).tap();
    await element(by.id('preset-stake-50')).tap();
    
    await device.setWiFi(false);
    
    // Try to place bet offline
    await element(by.id('confirm-slider')).swipe('right', 'fast', 0.8);
    
    await expect(element(by.id('queued-indicator'))).toBeVisible();
    
    // Restore connection
    await device.setWiFi(true);
    
    await waitFor(element(by.id('sync-success')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should sync data when coming back online', async () => {
    await device.setWiFi(false);
    await device.setWiFi(true);
    
    await expect(element(by.id('syncing-indicator'))).toBeVisible();
    await waitFor(element(by.id('sync-complete')))
      .toBeVisible()
      .withTimeout(5000);
  });
});

describe('App State Persistence', () => {
  it('should maintain login state after app restart', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Terminate and relaunch
    await device.terminateApp();
    await device.launchApp();
    
    // Should still be logged in
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('should restore previous screen after background', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await element(by.id('opportunities-tab')).tap();
    await element(by.id('opportunity-item-0')).tap();
    
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    
    // Should return to opportunity detail
    await expect(element(by.id('opportunity-detail-screen'))).toBeVisible();
  });
});