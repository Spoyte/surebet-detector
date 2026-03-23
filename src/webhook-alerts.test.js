import { describe, it, expect, beforeEach, vi } from 'vitest';
import WebhookAlertManager from './webhook-alerts.js';
import assert from 'assert';

// Mock HTTP requests
let mockRequests = [];

function mockHttpRequest(options, callback) {
    const mockResponse = {
        statusCode: 200,
        on: (event, handler) => {
            if (event === 'data') handler('{"ok": true}');
            if (event === 'end') handler();
        }
    };
    
    mockRequests.push(options);
    
    const mockReq = {
        write: () => {},
        end: () => setTimeout(() => callback(mockResponse), 10),
        on: () => {},
        destroy: () => {}
    };
    
    return mockReq;
}

// Vitest mock for HTTP modules
vi.mock('https', () => ({
    request: vi.fn((options, callback) => mockHttpRequest(options, callback))
}));

vi.mock('http', () => ({
    request: vi.fn((options, callback) => mockHttpRequest(options, callback))
}));

describe('WebhookAlertManager', () => {
    let manager;
    
    beforeEach(() => {
        manager = new WebhookAlertManager('./data/test-webhook-config.json');
        mockRequests = [];
    });

    it('should initialize with default config', () => {
        expect(manager.config).toBeDefined();
        expect(manager.config.global).toBeDefined();
    });

    it('should have default config values', () => {
        const defaults = manager.getDefaultConfig();
        expect(defaults.global.enabled).toBe(true);
        expect(defaults.global.minProfitForAlert).toBe(3.0);
    });
});
