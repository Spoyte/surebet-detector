describe('Authentication Flow', () => {
  it('should display login screen on first launch', async () => {
    await expect(element(by.id('login-screen'))).toBeVisible();
    await expect(element(by.id('email-input'))).toBeVisible();
    await expect(element(by.id('password-input'))).toBeVisible();
    await expect(element(by.id('login-button'))).toBeVisible();
  });

  it('should show validation errors for empty fields', async () => {
    await element(by.id('login-button')).tap();
    await expect(element(by.text('Email is required'))).toBeVisible();
    await expect(element(by.text('Password is required'))).toBeVisible();
  });

  it('should login with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Should navigate to dashboard after successful login
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com');
    await element(by.id('password-input')).typeText('wrongpassword');
    await element(by.id('login-button')).tap();
    
    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });

  it('should support biometric authentication when available', async () => {
    // Check if biometric prompt appears
    await expect(element(by.id('biometric-button'))).toBeVisible();
    await element(by.id('biometric-button')).tap();
    
    // Mock biometric success
    await device.matchFace();
    
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });
});

describe('Biometric Authentication', () => {
  it('should prompt for biometric on app resume', async () => {
    // Login first
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Background the app
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    
    // Should show biometric guard
    await expect(element(by.id('biometric-guard'))).toBeVisible();
  });

  it('should allow fallback to password', async () => {
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    
    await expect(element(by.id('biometric-guard'))).toBeVisible();
    await element(by.id('use-password-button')).tap();
    
    await expect(element(by.id('password-confirm-input'))).toBeVisible();
  });
});