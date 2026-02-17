/**
 * Distributed Tracing System for Surebet Detector Microservices
 * 
 * Implements OpenTelemetry-compatible tracing with Jaeger export.
 * Tracks requests across microservices for debugging and performance analysis.
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Trace Context - Propagates tracing information across service boundaries
 */
export class TraceContext {
  constructor(traceId = null, spanId = null, parentSpanId = null, sampled = true) {
    this.traceId = traceId || TraceContext.generateTraceId();
    this.spanId = spanId || TraceContext.generateSpanId();
    this.parentSpanId = parentSpanId;
    this.sampled = sampled;
    this.baggage = new Map();
  }

  static generateTraceId() {
    return randomBytes(16).toString('hex');
  }

  static generateSpanId() {
    return randomBytes(8).toString('hex');
  }

  /**
   * Create a child context for a new span
   */
  createChild() {
    const child = new TraceContext(
      this.traceId,
      TraceContext.generateSpanId(),
      this.spanId,
      this.sampled
    );
    child.baggage = new Map(this.baggage);
    return child;
  }

  /**
   * Serialize to W3C Trace Context format
   */
  toW3C() {
    const flags = this.sampled ? '01' : '00';
    return `00-${this.traceId}-${this.spanId}-${flags}`;
  }

  /**
   * Parse from W3C Trace Context format
   */
  static fromW3C(header) {
    if (!header) return new TraceContext();
    
    const parts = header.split('-');
    if (parts.length !== 4 || parts[0] !== '00') {
      return new TraceContext();
    }

    const sampled = parts[3] === '01';
    return new TraceContext(parts[1], parts[2], null, sampled);
  }

  /**
   * Serialize to Jaeger format
   */
  toJaeger() {
    const parent = this.parentSpanId ? `:${this.parentSpanId}` : '';
    const flags = this.sampled ? ':1' : ':0';
    return `${this.traceId}:${this.spanId}:0${parent}${flags}`;
  }

  /**
   * Parse from Jaeger format
   */
  static fromJaeger(header) {
    if (!header) return new TraceContext();
    
    const parts = header.split(':');
    if (parts.length < 2) return new TraceContext();

    const traceId = parts[0].padStart(32, '0');
    const spanId = parts[1];
    const parentSpanId = parts[3] || null;
    const sampled = parts[4] === '1';

    return new TraceContext(traceId, spanId, parentSpanId, sampled);
  }

  /**
   * Extract from HTTP headers
   */
  static fromHeaders(headers) {
    // Try W3C format first
    if (headers['traceparent']) {
      return TraceContext.fromW3C(headers['traceparent']);
    }
    
    // Try Jaeger format
    if (headers['uber-trace-id']) {
      return TraceContext.fromJaeger(headers['uber-trace-id']);
    }

    // Try X-Trace headers
    if (headers['x-trace-id']) {
      return new TraceContext(
        headers['x-trace-id'],
        headers['x-span-id'],
        headers['x-parent-span-id'],
        headers['x-sampled'] !== 'false'
      );
    }

    return new TraceContext();
  }

  /**
   * Inject into HTTP headers
   */
  toHeaders(headers = {}) {
    headers['traceparent'] = this.toW3C();
    headers['uber-trace-id'] = this.toJaeger();
    headers['x-trace-id'] = this.traceId;
    headers['x-span-id'] = this.spanId;
    if (this.parentSpanId) {
      headers['x-parent-span-id'] = this.parentSpanId;
    }
    headers['x-sampled'] = this.sampled ? 'true' : 'false';
    
    // Add baggage
    for (const [key, value] of this.baggage) {
      headers[`x-baggage-${key}`] = value;
    }
    
    return headers;
  }
}

/**
 * Span - Represents a single operation within a trace
 */
export class Span {
  constructor(name, context, options = {}) {
    this.name = name;
    this.context = context;
    this.startTime = Date.now();
    this.endTime = null;
    this.tags = new Map();
    this.logs = [];
    this.status = 'unset'; // unset, ok, error
    this.statusMessage = '';
    this.kind = options.kind || 'internal'; // client, server, producer, consumer, internal
    
    // Set initial tags
    this.setTag('span.kind', this.kind);
    if (options.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        this.setTag(key, value);
      }
    }
  }

  /**
   * Set a tag on the span
   */
  setTag(key, value) {
    this.tags.set(key, value);
    return this;
  }

  /**
   * Log an event
   */
  log(event, fields = {}) {
    this.logs.push({
      timestamp: Date.now(),
      event,
      fields
    });
    return this;
  }

  /**
   * Set span status
   */
  setStatus(status, message = '') {
    this.status = status;
    this.statusMessage = message;
    if (status === 'error') {
      this.setTag('error', true);
    }
    return this;
  }

  /**
   * Record an exception
   */
  recordException(error) {
    this.setStatus('error', error.message);
    this.setTag('error.type', error.name);
    this.setTag('error.message', error.message);
    if (error.stack) {
      this.setTag('error.stack', error.stack);
    }
    this.log('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack
    });
    return this;
  }

  /**
   * End the span
   */
  end(endTime = Date.now()) {
    this.endTime = endTime;
    return this;
  }

  /**
   * Get span duration in milliseconds
   */
  get duration() {
    if (!this.endTime) return null;
    return this.endTime - this.startTime;
  }

  /**
   * Convert to Jaeger Thrift format
   */
  toJaegerThrift() {
    return {
      traceIdLow: parseInt(this.context.traceId.slice(-16), 16),
      traceIdHigh: parseInt(this.context.traceId.slice(0, 16), 16) || 0,
      spanId: parseInt(this.context.spanId, 16),
      parentSpanId: this.context.parentSpanId ? parseInt(this.context.parentSpanId, 16) : 0,
      operationName: this.name,
      references: [],
      flags: this.context.sampled ? 1 : 0,
      startTime: Math.floor(this.startTime / 1000),
      startTimeMillis: this.startTime % 1000,
      duration: Math.floor((this.duration || 0) * 1000),
      tags: Array.from(this.tags.entries()).map(([key, value]) => ({
        key,
        vType: this._getTagType(value),
        vStr: typeof value === 'string' ? value : undefined,
        vLong: typeof value === 'number' && Number.isInteger(value) ? value : undefined,
        vDouble: typeof value === 'number' && !Number.isInteger(value) ? value : undefined,
        vBool: typeof value === 'boolean' ? value : undefined
      })),
      logs: this.logs.map(log => ({
        timestamp: Math.floor(log.timestamp / 1000),
        timestampMillis: log.timestamp % 1000,
        fields: Object.entries(log.fields).map(([key, value]) => ({
          key,
          vType: this._getTagType(value),
          vStr: typeof value === 'string' ? value : undefined,
          vLong: typeof value === 'number' && Number.isInteger(value) ? value : undefined,
          vDouble: typeof value === 'number' && !Number.isInteger(value) ? value : undefined,
          vBool: typeof value === 'boolean' ? value : undefined
        }))
      }))
    };
  }

  _getTagType(value) {
    if (typeof value === 'string') return 0; // STRING
    if (typeof value === 'number') return Number.isInteger(value) ? 2 : 3; // LONG : DOUBLE
    if (typeof value === 'boolean') return 1; // BOOL
    return 0;
  }

  /**
   * Convert to JSON format
   */
  toJSON() {
    return {
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.context.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      statusMessage: this.statusMessage,
      tags: Object.fromEntries(this.tags),
      logs: this.logs
    };
  }
}

/**
 * Tracer - Creates and manages spans
 */
export class Tracer {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.sampler = options.sampler || new AlwaysOnSampler();
    this.processor = options.processor || new BatchSpanProcessor();
    this.propagator = options.propagator || new W3CPropagator();
    this.resource = {
      'service.name': serviceName,
      'service.version': options.version || '1.0.0',
      'host.name': options.hostname || 'localhost',
      ...options.resource
    };
  }

  /**
   * Start a new span
   */
  startSpan(name, options = {}) {
    const parentContext = options.parent || null;
    const shouldSample = this.sampler.shouldSample(parentContext, name);
    
    let context;
    if (parentContext) {
      context = parentContext.createChild();
      context.sampled = shouldSample && parentContext.sampled;
    } else {
      context = new TraceContext(null, null, null, shouldSample);
    }

    const span = new Span(name, context, options);
    
    // Add resource tags
    for (const [key, value] of Object.entries(this.resource)) {
      span.setTag(key, value);
    }

    return span;
  }

  /**
   * Start an active span with automatic ending
   */
  async withSpan(name, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = {};
    }

    const span = this.startSpan(name, options);
    
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
      this.processor.onEnd(span);
    }
  }

  /**
   * Extract trace context from carrier
   */
  extract(carrier) {
    return this.propagator.extract(carrier);
  }

  /**
   * Inject trace context into carrier
   */
  inject(context, carrier) {
    return this.propagator.inject(context, carrier);
  }

  /**
   * Shutdown the tracer
   */
  async shutdown() {
    await this.processor.shutdown();
  }
}

/**
 * Sampler - Determines if a trace should be sampled
 */
export class AlwaysOnSampler {
  shouldSample() {
    return true;
  }
}

export class AlwaysOffSampler {
  shouldSample() {
    return false;
  }
}

export class ProbabilitySampler {
  constructor(probability = 0.1) {
    this.probability = probability;
  }

  shouldSample() {
    return Math.random() < this.probability;
  }
}

export class RateLimitingSampler {
  constructor(maxTracesPerSecond = 10) {
    this.maxTracesPerSecond = maxTracesPerSecond;
    this.tokens = maxTracesPerSecond;
    this.lastUpdate = Date.now();
  }

  shouldSample() {
    const now = Date.now();
    const elapsed = (now - this.lastUpdate) / 1000;
    this.tokens = Math.min(this.maxTracesPerSecond, this.tokens + elapsed * this.maxTracesPerSecond);
    this.lastUpdate = now;

    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }
}

/**
 * Span Processor - Handles span export
 */
export class BatchSpanProcessor {
  constructor(exporter, options = {}) {
    this.exporter = exporter || new ConsoleExporter();
    this.maxQueueSize = options.maxQueueSize || 2048;
    this.maxExportBatchSize = options.maxExportBatchSize || 512;
    this.exportTimeoutMillis = options.exportTimeoutMillis || 30000;
    this.scheduleDelayMillis = options.scheduleDelayMillis || 5000;
    
    this.queue = [];
    this.timer = null;
    this.isShutdown = false;
    
    this._startTimer();
  }

  onEnd(span) {
    if (this.isShutdown) return;
    if (!span.context.sampled) return;
    
    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest spans
      this.queue.shift();
    }
    
    this.queue.push(span);
    
    if (this.queue.length >= this.maxExportBatchSize) {
      this._export();
    }
  }

  async _export() {
    if (this.queue.length === 0) return;
    
    const spans = this.queue.splice(0, this.maxExportBatchSize);
    
    try {
      await this.exporter.export(spans);
    } catch (error) {
      console.error('Failed to export spans:', error);
    }
  }

  _startTimer() {
    this.timer = setInterval(() => {
      this._export();
    }, this.scheduleDelayMillis);
  }

  async shutdown() {
    this.isShutdown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this._export();
    await this.exporter.shutdown();
  }
}

/**
 * Span Exporters
 */
export class ConsoleExporter {
  async export(spans) {
    for (const span of spans) {
      console.log('[TRACE]', JSON.stringify(span.toJSON()));
    }
  }

  async shutdown() {}
}

export class JaegerExporter {
  constructor(options = {}) {
    this.endpoint = options.endpoint || 'http://localhost:14268/api/traces';
    this.agentHost = options.agentHost || 'localhost';
    this.agentPort = options.agentPort || 6832;
    this.serviceName = options.serviceName || 'surebet-service';
    this.tags = options.tags || {};
  }

  async export(spans) {
    const batch = {
      process: {
        serviceName: this.serviceName,
        tags: Object.entries(this.tags).map(([key, value]) => ({
          key,
          vType: typeof value === 'number' ? (Number.isInteger(value) ? 2 : 3) : 0,
          vStr: typeof value === 'string' ? value : undefined,
          vLong: typeof value === 'number' && Number.isInteger(value) ? value : undefined,
          vDouble: typeof value === 'number' && !Number.isInteger(value) ? value : undefined
        }))
      },
      spans: spans.map(span => span.toJaegerThrift())
    };

    try {
      // Send via HTTP to Jaeger collector
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        throw new Error(`Jaeger export failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to export to Jaeger:', error);
      throw error;
    }
  }

  async shutdown() {}
}

export class FileExporter {
  constructor(options = {}) {
    this.filePath = options.filePath || './traces.jsonl';
    this.fs = options.fs || null; // Injected fs module for testing
  }

  async export(spans) {
    const lines = spans.map(span => JSON.stringify(span.toJSON())).join('\n') + '\n';
    
    if (this.fs) {
      await this.fs.appendFile(this.filePath, lines);
    } else {
      const { appendFileSync } = await import('fs');
      appendFileSync(this.filePath, lines);
    }
  }

  async shutdown() {}
}

/**
 * Propagator - Handles trace context propagation
 */
export class W3CPropagator {
  extract(carrier) {
    if (carrier['traceparent']) {
      return TraceContext.fromW3C(carrier['traceparent']);
    }
    return new TraceContext();
  }

  inject(context, carrier = {}) {
    carrier['traceparent'] = context.toW3C();
    return carrier;
  }
}

export class JaegerPropagator {
  extract(carrier) {
    if (carrier['uber-trace-id']) {
      return TraceContext.fromJaeger(carrier['uber-trace-id']);
    }
    return new TraceContext();
  }

  inject(context, carrier = {}) {
    carrier['uber-trace-id'] = context.toJaeger();
    return carrier;
  }
}

/**
 * Tracing Middleware for Express/Fastify
 */
export function createTracingMiddleware(tracer, options = {}) {
  const { headerName = 'traceparent', spanName = (req) => `${req.method} ${req.path}` } = options;

  return async (req, res, next) => {
    // Extract or create trace context
    const parentContext = tracer.extract(req.headers);
    
    const span = tracer.startSpan(spanName(req), {
      parent: parentContext,
      kind: 'server',
      tags: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.headers.host,
        'http.scheme': req.protocol || 'http',
        'http.user_agent': req.headers['user-agent'],
        'http.request_content_length': req.headers['content-length']
      }
    });

    // Inject trace context into response headers
    tracer.inject(span.context, res);

    // Store span in request for later use
    req.span = span;
    req.traceContext = span.context;

    // Track response
    res.on('finish', () => {
      span.setTag('http.status_code', res.statusCode);
      span.setTag('http.response_content_length', res.getHeader('content-length'));
      
      if (res.statusCode >= 400) {
        span.setStatus('error', `HTTP ${res.statusCode}`);
      } else {
        span.setStatus('ok');
      }
      
      span.end();
      tracer.processor.onEnd(span);
    });

    next();
  };
}

/**
 * Tracing for HTTP clients
 */
export function createTracedHttpClient(tracer, baseClient) {
  return {
    async request(options, callback) {
      const span = tracer.startSpan(`HTTP ${options.method || 'GET'}`, {
        kind: 'client',
        tags: {
          'http.method': options.method || 'GET',
          'http.url': options.url || `${options.hostname}:${options.port}${options.path}`,
          'http.target': options.path,
          'http.host': options.hostname || options.host,
          'http.scheme': options.protocol || 'http:'
        }
      });

      // Inject trace context into request headers
      options.headers = options.headers || {};
      tracer.inject(span.context, options.headers);

      const startTime = Date.now();
      
      try {
        const response = await baseClient.request(options, callback);
        
        span.setTag('http.status_code', response.statusCode);
        span.setTag('http.response_content_length', response.headers['content-length']);
        
        if (response.statusCode >= 400) {
          span.setStatus('error', `HTTP ${response.statusCode}`);
        } else {
          span.setStatus('ok');
        }
        
        return response;
      } catch (error) {
        span.recordException(error);
        throw error;
      } finally {
        span.end();
        tracer.processor.onEnd(span);
      }
    }
  };
}

/**
 * Tracing for Message Queue operations
 */
export function createTracedMessageProducer(tracer, producer) {
  return {
    async send(topic, message, options = {}) {
      const span = tracer.startSpan(`send ${topic}`, {
        kind: 'producer',
        tags: {
          'messaging.system': options.system || 'rabbitmq',
          'messaging.destination': topic,
          'messaging.destination_kind': 'topic'
        }
      });

      // Inject trace context into message headers
      message.headers = message.headers || {};
      tracer.inject(span.context, message.headers);

      try {
        const result = await producer.send(topic, message, options);
        span.setStatus('ok');
        return result;
      } catch (error) {
        span.recordException(error);
        throw error;
      } finally {
        span.end();
        tracer.processor.onEnd(span);
      }
    }
  };
}

export function createTracedMessageConsumer(tracer, consumer) {
  return {
    async subscribe(topic, handler) {
      return consumer.subscribe(topic, async (message) => {
        // Extract trace context from message headers
        const parentContext = tracer.extract(message.headers || {});
        
        const span = tracer.startSpan(`receive ${topic}`, {
          parent: parentContext,
          kind: 'consumer',
          tags: {
            'messaging.system': message.headers?.['messaging.system'] || 'rabbitmq',
            'messaging.source': topic,
            'messaging.source_kind': 'topic',
            'messaging.message_id': message.id,
            'messaging.message_payload_size_bytes': JSON.stringify(message).length
          }
        });

        // Store span in message context
        message.span = span;
        message.traceContext = span.context;

        try {
          const result = await handler(message);
          span.setStatus('ok');
          return result;
        } catch (error) {
          span.recordException(error);
          throw error;
        } finally {
          span.end();
          tracer.processor.onEnd(span);
        }
      });
    }
  };
}

/**
 * Tracing for Database operations
 */
export function createTracedDatabase(tracer, db, dbType = 'postgresql') {
  return new Proxy(db, {
    get(target, prop) {
      const value = target[prop];
      
      if (typeof value === 'function') {
        return async (...args) => {
          const span = tracer.startSpan(`db.${prop}`, {
            kind: 'client',
            tags: {
              'db.system': dbType,
              'db.operation': prop,
              'db.statement': args[0]?.toString().substring(0, 1000)
            }
          });

          try {
            const result = await value.apply(target, args);
            span.setTag('db.rows_affected', result?.rowCount || 0);
            span.setStatus('ok');
            return result;
          } catch (error) {
            span.recordException(error);
            throw error;
          } finally {
            span.end();
            tracer.processor.onEnd(span);
          }
        };
      }
      
      return value;
    }
  });
}

/**
 * Tracing for Redis operations
 */
export function createTracedRedis(tracer, redis) {
  return new Proxy(redis, {
    get(target, prop) {
      const value = target[prop];
      
      if (typeof value === 'function' && !prop.startsWith('_')) {
        return async (...args) => {
          const span = tracer.startSpan(`redis.${prop}`, {
            kind: 'client',
            tags: {
              'db.system': 'redis',
              'db.operation': prop
            }
          });

          try {
            const result = await value.apply(target, args);
            span.setStatus('ok');
            return result;
          } catch (error) {
            span.recordException(error);
            throw error;
          } finally {
            span.end();
            tracer.processor.onEnd(span);
          }
        };
      }
      
      return value;
    }
  });
}

/**
 * Global tracer instance
 */
let globalTracer = null;

export function initGlobalTracer(serviceName, options = {}) {
  globalTracer = new Tracer(serviceName, options);
  return globalTracer;
}

export function getGlobalTracer() {
  if (!globalTracer) {
    throw new Error('Global tracer not initialized. Call initGlobalTracer() first.');
  }
  return globalTracer;
}

export function trace(name, options, fn) {
  return getGlobalTracer().withSpan(name, options, fn);
}

/**
 * Utility to trace async functions
 */
export function traced(target, propertyKey, descriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = async function(...args) {
    const tracer = getGlobalTracer();
    const className = this.constructor.name;
    
    return tracer.withSpan(`${className}.${propertyKey}`, {
      tags: {
        'code.function': propertyKey,
        'code.namespace': className
      }
    }, async (span) => {
      return originalMethod.apply(this, args);
    });
  };
  
  return descriptor;
}

export default {
  TraceContext,
  Span,
  Tracer,
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  RateLimitingSampler,
  BatchSpanProcessor,
  ConsoleExporter,
  JaegerExporter,
  FileExporter,
  W3CPropagator,
  JaegerPropagator,
  createTracingMiddleware,
  createTracedHttpClient,
  createTracedMessageProducer,
  createTracedMessageConsumer,
  createTracedDatabase,
  createTracedRedis,
  initGlobalTracer,
  getGlobalTracer,
  trace,
  traced
};
