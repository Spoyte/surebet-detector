/**
 * Service Client Utility
 * 
 * Handles communication with downstream microservices
 * with retry logic, circuit breaker pattern, and error handling.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

// Service URLs from environment
const SERVICE_URLS = {
  oddsCollector: process.env.ODDS_COLLECTOR_URL || 'http://localhost:3001',
  arbitrageDetector: process.env.ARBITRAGE_DETECTOR_URL || 'http://localhost:3002',
  userManagement: process.env.USER_MANAGEMENT_URL || 'http://localhost:3003',
  notificationService: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
  analyticsService: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3005',
  apiGateway: process.env.API_GATEWAY_URL || 'http://localhost:3000'
};

// Circuit breaker state
interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

const circuits: Map<string, CircuitState> = new Map();
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_TIMEOUT = 30000; // 30 seconds

class ServiceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response?.status ?? 0) >= 500;
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Request to ${config.url}`, { method: config.method });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Response from ${response.config.url}`, { 
          status: response.status,
          duration: Date.now() - (response.config as any).startTime 
        });
        return response;
      },
      (error) => {
        logger.error(`Request failed: ${error.config?.url}`, { 
          error: error.message,
          status: error.response?.status 
        });
        return Promise.reject(error);
      }
    );
  }

  private getCircuitState(service: string): CircuitState {
    if (!circuits.has(service)) {
      circuits.set(service, { failures: 0, lastFailure: 0, open: false });
    }
    return circuits.get(service)!;
  }

  private isCircuitOpen(service: string): boolean {
    const state = this.getCircuitState(service);
    if (!state.open) return false;
    
    // Check if circuit should be half-open
    if (Date.now() - state.lastFailure > CIRCUIT_TIMEOUT) {
      state.open = false;
      state.failures = 0;
      return false;
    }
    return true;
  }

  private recordSuccess(service: string): void {
    const state = this.getCircuitState(service);
    state.failures = 0;
    state.open = false;
  }

  private recordFailure(service: string): void {
    const state = this.getCircuitState(service);
    state.failures++;
    state.lastFailure = Date.now();
    
    if (state.failures >= CIRCUIT_THRESHOLD) {
      state.open = true;
      logger.warn(`Circuit breaker opened for service: ${service}`);
    }
  }

  async request<T>(
    service: keyof typeof SERVICE_URLS,
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      data?: any;
      params?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    if (this.isCircuitOpen(service)) {
      throw new Error(`Circuit breaker is open for service: ${service}`);
    }

    const url = `${SERVICE_URLS[service]}${endpoint}`;
    
    try {
      const response = await this.client.request<T>({
        url,
        method: options.method || 'GET',
        data: options.data,
        params: options.params,
        headers: options.headers
      });
      
      this.recordSuccess(service);
      return response.data;
    } catch (error) {
      this.recordFailure(service);
      throw error;
    }
  }

  async get<T>(service: keyof typeof SERVICE_URLS, endpoint: string, params?: any): Promise<T> {
    return this.request<T>(service, endpoint, { method: 'GET', params });
  }

  async post<T>(service: keyof typeof SERVICE_URLS, endpoint: string, data?: any): Promise<T> {
    return this.request<T>(service, endpoint, { method: 'POST', data });
  }

  async checkHealth(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, string>;
  }> {
    const health: Record<string, string> = {};
    
    for (const [name, url] of Object.entries(SERVICE_URLS)) {
      try {
        const response = await this.client.get(`${url}/health`, { timeout: 5000 });
        health[name] = response.status === 200 ? 'healthy' : 'unhealthy';
      } catch (error) {
        health[name] = 'unreachable';
      }
    }

    const allHealthy = Object.values(health).every(s => s === 'healthy');
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: health
    };
  }

  // Batch multiple requests
  async batch<T>(
    requests: Array<{
      service: keyof typeof SERVICE_URLS;
      endpoint: string;
      options?: Parameters<ServiceClient['request']>[2];
    }>
  ): Promise<Array<{ success: boolean; data?: T; error?: string }>> {
    const results = await Promise.allSettled(
      requests.map(req => this.request<T>(req.service, req.endpoint, req.options))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return { success: true, data: result.value };
      } else {
        return { success: false, error: result.reason?.message || 'Unknown error' };
      }
    });
  }
}

export const serviceClient = new ServiceClient();
export { SERVICE_URLS };
