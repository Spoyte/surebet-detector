const { device } = require('detox');

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    permissions: { notifications: 'YES', camera: 'YES' }
  });
});

beforeEach(async () => {
  await device.reloadReactNative();
});

afterAll(async () => {
  // Cleanup if needed
});