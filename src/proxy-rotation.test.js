/**
 * Tests for Proxy Rotation System
 */

const {
  ProxyRotationManager,
  ProxyPoolBuilder,
  BookmakerProxySelector,
  PROXY_TYPES,
  PROXY_STATUS,
  ROTATION_STRATEGIES
} = require('./proxy-rotation.js');

// Test utilities
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Running Proxy Rotation System Tests...\n');
  
  let passed = 0;
  let failed = 0;

  // Test 1: Add proxy with auto-generated ID
  try {
    console.log('Test 1: Add proxy with auto-generated ID');
    const manager = new ProxyRotationManager();
    const id = manager.addProxy({
      type: PROXY_TYPES.HTTP,
      host: 'proxy1.example.com',
      port: 8080,
      country: 'US'
    });
    
    if (!id) throw new Error('Expected ID to be returned');
    if (!manager.proxies.has(id)) throw new Error('Expected proxy to be added to map');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 2: Add proxy with custom ID
  try {
    console.log('Test 2: Add proxy with custom ID');
    const manager = new ProxyRotationManager();
    const id = manager.addProxy({
      id: 'custom-proxy-1',
      type: PROXY_TYPES.HTTP,
      host: 'proxy1.example.com',
      port: 8080
    });
    
    if (id !== 'custom-proxy-1') throw new Error(`Expected 'custom-proxy-1', got '${id}'`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 3: Remove proxy
  try {
    console.log('Test 3: Remove proxy');
    const manager = new ProxyRotationManager();
    const id = manager.addProxy({
      type: PROXY_TYPES.HTTP,
      host: 'proxy1.example.com',
      port: 8080
    });
    
    const result = manager.removeProxy(id);
    if (!result) throw new Error('Expected removeProxy to return true');
    if (manager.proxies.has(id)) throw new Error('Expected proxy to be removed');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 4: Get proxy with round-robin strategy
  try {
    console.log('Test 4: Get proxy with round-robin strategy');
    const manager = new ProxyRotationManager({
      rotationStrategy: ROTATION_STRATEGIES.ROUND_ROBIN
    });
    
    manager.addProxy({ id: 'proxy-1', type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    manager.addProxy({ id: 'proxy-2', type: PROXY_TYPES.HTTP, host: 'proxy2.example.com', port: 8080 });
    
    const proxy1 = manager.getProxy('unibet');
    const proxy2 = manager.getProxy('betclic');
    
    if (!proxy1) throw new Error('Expected first proxy to be returned');
    if (!proxy2) throw new Error('Expected second proxy to be returned');
    if (proxy1.id === proxy2.id) throw new Error('Expected different proxies with round-robin');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 5: Get proxy with random strategy
  try {
    console.log('Test 5: Get proxy with random strategy');
    const manager = new ProxyRotationManager({
      rotationStrategy: ROTATION_STRATEGIES.RANDOM
    });
    
    manager.addProxy({ id: 'proxy-1', type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    const proxy = manager.getProxy('unibet');
    if (!proxy) throw new Error('Expected proxy to be returned');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 6: Return null when no proxies available
  try {
    console.log('Test 6: Return null when no proxies available');
    const manager = new ProxyRotationManager();
    
    const proxy = manager.getProxy('unibet');
    if (proxy !== null) throw new Error('Expected null when no proxies available');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 7: Skip banned proxies
  try {
    console.log('Test 7: Skip banned proxies');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ id: 'proxy-1', type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    manager.addProxy({ id: 'proxy-2', type: PROXY_TYPES.HTTP, host: 'proxy2.example.com', port: 8080 });
    
    manager.banProxy('proxy-1', 60000);
    
    const proxy = manager.getProxy('unibet');
    if (proxy.id !== 'proxy-2') throw new Error('Expected to get non-banned proxy');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 8: Track proxy usage
  try {
    console.log('Test 8: Track proxy usage');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ id: 'proxy-1', type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    manager.getProxy('unibet');
    
    const proxy = manager.proxies.get('proxy-1');
    if (proxy.useCount !== 1) throw new Error(`Expected useCount 1, got ${proxy.useCount}`);
    if (!proxy.lastUsed) throw new Error('Expected lastUsed to be set');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 9: Report success updates metrics
  try {
    console.log('Test 9: Report success updates metrics');
    const manager = new ProxyRotationManager();
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    manager.reportSuccess(id, 150);
    
    const proxy = manager.proxies.get(id);
    if (proxy.responseTime !== 150) throw new Error(`Expected responseTime 150, got ${proxy.responseTime}`);
    if (proxy.consecutiveFailures !== 0) throw new Error('Expected consecutiveFailures to be 0');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 10: Report failure updates metrics
  try {
    console.log('Test 10: Report failure updates metrics');
    const manager = new ProxyRotationManager();
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    manager.reportFailure(id, new Error('Connection failed'));
    
    const proxy = manager.proxies.get(id);
    if (proxy.failureCount !== 1) throw new Error(`Expected failureCount 1, got ${proxy.failureCount}`);
    if (proxy.consecutiveFailures !== 1) throw new Error(`Expected consecutiveFailures 1, got ${proxy.consecutiveFailures}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 11: Mark proxy as degraded after max failures
  try {
    console.log('Test 11: Mark proxy as degraded after max failures');
    const manager = new ProxyRotationManager({ maxFailures: 2 });
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    manager.reportFailure(id, new Error('Connection failed'));
    manager.reportFailure(id, new Error('Connection failed'));
    
    const proxy = manager.proxies.get(id);
    if (proxy.status !== PROXY_STATUS.DEGRADED) throw new Error(`Expected status DEGRADED, got ${proxy.status}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 12: Ban proxy on 403 error
  try {
    console.log('Test 12: Ban proxy on 403 error');
    const manager = new ProxyRotationManager();
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    const error = new Error('Forbidden');
    error.statusCode = 403;
    manager.reportFailure(id, error);
    
    const proxy = manager.proxies.get(id);
    if (proxy.status !== PROXY_STATUS.BANNED) throw new Error(`Expected status BANNED, got ${proxy.status}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 13: Rate limit proxy on 429 error
  try {
    console.log('Test 13: Rate limit proxy on 429 error');
    const manager = new ProxyRotationManager();
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    const error = new Error('Too Many Requests');
    error.statusCode = 429;
    manager.reportFailure(id, error);
    
    const proxy = manager.proxies.get(id);
    if (proxy.status !== PROXY_STATUS.RATE_LIMITED) throw new Error(`Expected status RATE_LIMITED, got ${proxy.status}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 14: Get stats
  try {
    console.log('Test 14: Get stats');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ id: 'proxy-1', type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080, country: 'US' });
    manager.getProxy('unibet');
    
    const stats = manager.getStats();
    if (stats.totalRequests !== 1) throw new Error(`Expected totalRequests 1, got ${stats.totalRequests}`);
    if (stats.proxyCount !== 1) throw new Error(`Expected proxyCount 1, got ${stats.proxyCount}`);
    if (!stats.proxies || stats.proxies.length !== 1) throw new Error('Expected 1 proxy in stats');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 15: Get pool summary
  try {
    console.log('Test 15: Get pool summary');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080, country: 'US' });
    manager.addProxy({ type: PROXY_TYPES.SOCKS5, host: 'proxy2.example.com', port: 1080, country: 'GB' });
    
    const summary = manager.getPoolSummary();
    if (summary.total !== 2) throw new Error(`Expected total 2, got ${summary.total}`);
    if (summary.byCountry.US !== 1) throw new Error('Expected 1 US proxy');
    if (summary.byCountry.GB !== 1) throw new Error('Expected 1 GB proxy');
    if (summary.byType[PROXY_TYPES.HTTP] !== 1) throw new Error('Expected 1 HTTP proxy');
    if (summary.byType[PROXY_TYPES.SOCKS5] !== 1) throw new Error('Expected 1 SOCKS5 proxy');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 16: Load from config
  try {
    console.log('Test 16: Load from config');
    const manager = new ProxyRotationManager();
    
    const configs = [
      { type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 },
      { type: PROXY_TYPES.HTTP, host: 'proxy2.example.com', port: 8080 }
    ];
    
    manager.loadFromConfig(configs);
    if (manager.proxies.size !== 2) throw new Error(`Expected 2 proxies, got ${manager.proxies.size}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 17: Export config
  try {
    console.log('Test 17: Export config');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080, country: 'US' });
    
    const configs = manager.exportConfig();
    if (configs.length !== 1) throw new Error(`Expected 1 config, got ${configs.length}`);
    if (configs[0].host !== 'proxy1.example.com') throw new Error('Expected correct host');
    if (configs[0].country !== 'US') throw new Error('Expected country US');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 18: ProxyPoolBuilder - build HTTP proxy
  try {
    console.log('Test 18: ProxyPoolBuilder - build HTTP proxy');
    const builder = new ProxyPoolBuilder();
    const proxies = builder
      .addHttpProxy('proxy1.example.com', 8080, { country: 'US' })
      .build();
    
    if (proxies.length !== 1) throw new Error(`Expected 1 proxy, got ${proxies.length}`);
    if (proxies[0].type !== PROXY_TYPES.HTTP) throw new Error('Expected HTTP type');
    if (proxies[0].host !== 'proxy1.example.com') throw new Error('Expected correct host');
    
    console.log('  ✅ Passed');
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 19: ProxyPoolBuilder - build SOCKS5 proxy
  try {
    console.log('Test 19: ProxyPoolBuilder - build SOCKS5 proxy');
    const builder = new ProxyPoolBuilder();
    const proxies = builder
      .addSocks5Proxy('proxy1.example.com', 1080)
      .build();
    
    if (proxies[0].type !== PROXY_TYPES.SOCKS5) throw new Error('Expected SOCKS5 type');
    
    console.log('  ✅ Passed');
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 20: ProxyPoolBuilder - chain multiple additions
  try {
    console.log('Test 20: ProxyPoolBuilder - chain multiple additions');
    const builder = new ProxyPoolBuilder();
    const proxies = builder
      .addHttpProxy('proxy1.example.com', 8080)
      .addSocks5Proxy('proxy2.example.com', 1080)
      .addVpnProxy('tun0')
      .build();
    
    if (proxies.length !== 3) throw new Error(`Expected 3 proxies, got ${proxies.length}`);
    
    console.log('  ✅ Passed');
    passed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 21: BookmakerProxySelector - prefer residential for strict bookmakers
  try {
    console.log('Test 21: BookmakerProxySelector - prefer residential for strict bookmakers');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ id: 'residential-us', type: PROXY_TYPES.HTTP, host: 'res1.example.com', port: 8080, country: 'US', tags: ['residential'] });
    manager.addProxy({ id: 'datacenter-us', type: PROXY_TYPES.HTTP, host: 'dc1.example.com', port: 8080, country: 'US', tags: ['datacenter'] });
    
    const selector = new BookmakerProxySelector(manager);
    const proxy = selector.getProxyForBookmaker('bet365');
    
    if (!proxy) throw new Error('Expected proxy to be returned');
    // bet365 requires residential, so should get residential-us
    if (proxy.id !== 'residential-us') throw new Error(`Expected residential-us, got ${proxy.id}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 22: BookmakerProxySelector - prefer GB for betfair
  try {
    console.log('Test 22: BookmakerProxySelector - prefer GB for betfair');
    const manager = new ProxyRotationManager();
    
    manager.addProxy({ id: 'residential-gb', type: PROXY_TYPES.HTTP, host: 'res2.example.com', port: 8080, country: 'GB', tags: ['residential'] });
    manager.addProxy({ id: 'residential-us', type: PROXY_TYPES.HTTP, host: 'res1.example.com', port: 8080, country: 'US', tags: ['residential'] });
    
    const selector = new BookmakerProxySelector(manager);
    const proxy = selector.getProxyForBookmaker('betfair');
    
    if (!proxy) throw new Error('Expected proxy to be returned');
    if (proxy.country !== 'GB') throw new Error(`Expected GB proxy, got ${proxy.country}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 23: Full integration test
  try {
    console.log('Test 23: Full integration test');
    const manager = new ProxyRotationManager();
    
    // Add proxies
    const id1 = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080, country: 'US' });
    const id2 = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy2.example.com', port: 8080, country: 'GB' });
    
    // Get proxy for bookmaker
    const proxy = manager.getProxy('unibet');
    if (!proxy) throw new Error('Expected proxy to be returned');
    
    // Report success
    manager.reportSuccess(proxy.id, 100);
    
    // Get another proxy
    const proxy2 = manager.getProxy('betclic');
    if (!proxy2) throw new Error('Expected second proxy');
    
    // Report failure
    manager.reportFailure(proxy2.id, new Error('Timeout'));
    
    // Check stats
    const stats = manager.getStats();
    if (stats.totalRequests !== 2) throw new Error(`Expected totalRequests 2, got ${stats.totalRequests}`);
    if (stats.successfulRequests !== 1) throw new Error(`Expected successfulRequests 1, got ${stats.successfulRequests}`);
    if (stats.failedRequests !== 1) throw new Error(`Expected failedRequests 1, got ${stats.failedRequests}`);
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Test 24: Auto-unban after duration
  try {
    console.log('Test 24: Auto-unban after duration');
    const manager = new ProxyRotationManager();
    
    const id = manager.addProxy({ type: PROXY_TYPES.HTTP, host: 'proxy1.example.com', port: 8080 });
    
    manager.banProxy(id, 50); // 50ms for testing
    
    const proxyAfterBan = manager.proxies.get(id);
    if (proxyAfterBan.status !== PROXY_STATUS.BANNED) throw new Error('Expected proxy to be banned');
    
    // Wait for auto-unban
    await sleep(100);
    
    const proxyAfterUnban = manager.proxies.get(id);
    if (proxyAfterUnban.status !== PROXY_STATUS.HEALTHY) throw new Error('Expected proxy to be unbanned');
    
    console.log('  ✅ Passed');
    passed++;
    manager.stop();
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    failed++;
  }

  // Print summary
  console.log('\n==================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('==================================================');
  
  return { passed, failed };
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };