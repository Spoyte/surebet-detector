/**
 * Distributed Tracing Tests
 * 
 * Comprehensive test suite for the tracing system.
 */

import {
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
  initGlobalTracer,
  getGlobalTracer,
  trace
} from './distributed-tracing.js';

import { describe, it, expect, beforeEach, afterEach } from './test-framework.js';

describe('TraceContext', () => {
  it('should generate unique trace and span IDs', () => {
    const ctx1 = new TraceContext();
    const ctx2 = new TraceContext();
    
    expect(ctx1.traceId).not.toBe(ctx2.traceId);
    expect(ctx1.spanId).not.toBe(ctx2.spanId);
    expect(ctx1.traceId).toHaveLength(32);
    expect(ctx1.spanId).toHaveLength(16);
  });

  it('should create child context correctly', () => {
    const parent = new TraceContext('abc123', 'def456', null, true);
    parent.baggage.set('userId', '123');
    
    const child = parent.createChild();
    
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.sampled).toBe(parent.sampled);
    expect(child.baggage.get('userId')).toBe('123');
  });

  it('should serialize to W3C format', () => {
    const ctx = new TraceContext('0af7651916cd43dd8448eb211c80319c', 'b7ad6b7169203331', null, true);
    
    expect(ctx.toW3C()).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });

  it('should parse from W3C format', () => {
    const ctx = TraceContext.fromW3C('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    
    expect(ctx.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx.spanId).toBe('b7ad6b7169203331');
    expect(ctx.sampled).toBe(true);
  });

  it('should serialize to Jaeger format', () => {
    const ctx = new TraceContext('abc123', 'def456', 'parent789', true);
    
    expect(ctx.toJaeger()).toBe('abc123:def456:0:parent789:1');
  });

  it('should parse from Jaeger format', () => {
    const ctx = TraceContext.fromJaeger('abc123:def456:0:parent789:1');
    
    expect(ctx.traceId).toBe('000000000000000000000000000abc123');
    expect(ctx.spanId).toBe('def456');
    expect(ctx.parentSpanId).toBe('parent789');
    expect(ctx.sampled).toBe(true);
  });

  it('should extract from HTTP headers', () => {
    const headers = {
      'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      'uber-trace-id': 'abc123:def456:0:parent789:1'
    };
    
    const ctx = TraceContext.fromHeaders(headers);
    
    expect(ctx.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx.spanId).toBe('b7ad6b7169203331');
  });

  it('should inject into HTTP headers', () => {
    const ctx = new TraceContext('abc123', 'def456', 'parent789', true);
    ctx.baggage.set('userId', '123');
    
    const headers = ctx.toHeaders();
    
    expect(headers['traceparent']).toContain('abc123');
    expect(headers['uber-trace-id']).toContain('abc123');
    expect(headers['x-trace-id']).toBe('abc123');
    expect(headers['x-baggage-userId']).toBe('123');
  });
});

describe('Span', () => {
  it('should create span with correct properties', () => {
    const ctx = new TraceContext();
    const span = new Span('test-operation', ctx, { kind: 'server' });
    
    expect(span.name).toBe('test-operation');
    expect(span.context).toBe(ctx);
    expect(span.kind).toBe('server');
    expect(span.startTime).toBeGreaterThan(0);
    expect(span.endTime).toBeNull();
  });

  it('should set tags correctly', () => {
    const ctx = new TraceContext();
    const span = new Span('test', ctx);
    
    span.setTag('key1', 'value1');
    span.setTag('key2', 123);
    
    expect(span.tags.get('key1')).toBe('value1');
    expect(span.tags.get('key2')).toBe(123);
  });

  it('should log events', () => {
    const ctx = new TraceContext();
    const span = new Span('test', ctx);
    
    span.log('event1', { field1: 'value1' });
    span.log('event2');
    
    expect(span.logs).toHaveLength(2);
    expect(span.logs[0].event).toBe('event1');
    expect(span.logs[0].fields.field1).toBe('value1');
  });

  it('should record exceptions', () => {
    const ctx = new TraceContext();
    const span = new Span('test', ctx);
    const error = new Error('Test error');
    
    span.recordException(error);
    
    expect(span.status).toBe('error');
    expect(span.tags.get('error')).toBe(true);
    expect(span.tags.get('error.message')).toBe('Test error');
  });

  it('should calculate duration after ending', () => {
    const ctx = new TraceContext();
    const span = new Span('test', ctx);
    
    expect(span.duration).toBeNull();
    
    span.end(span.startTime + 100);
    
    expect(span.duration).toBe(100);
  });

  it('should convert to JSON correctly', () => {
    const ctx = new TraceContext('trace123', 'span456', 'parent789', true);
    const span = new Span('test', ctx);
    span.setTag('key', 'value');
    span.end();
    
    const json = span.toJSON();
    
    expect(json.traceId).toBe('trace123');
    expect(json.spanId).toBe('span456');
    expect(json.parentSpanId).toBe('parent789');
    expect(json.name).toBe('test');
    expect(json.tags.key).toBe('value');
  });
});

describe('Samplers', () => {
  it('AlwaysOnSampler should always sample', () => {
    const sampler = new AlwaysOnSampler();
    
    expect(sampler.shouldSample()).toBe(true);
    expect(sampler.shouldSample()).toBe(true);
  });

  it('AlwaysOffSampler should never sample', () => {
    const sampler = new AlwaysOffSampler();
    
    expect(sampler.shouldSample()).toBe(false);
    expect(sampler.shouldSample()).toBe(false);
  });

  it('ProbabilitySampler should sample at given rate', () => {
    const sampler = new ProbabilitySampler(0.5);
    
    // With probability 0.5, we expect roughly 50% to be sampled
    let sampled = 0;
    for (let i = 0; i < 1000; i++) {
      if (sampler.shouldSample()) sampled++;
    }
    
    expect(sampled).toBeGreaterThan(400);
    expect(sampled).toBeLessThan(600);
  });

  it('RateLimitingSampler should limit trace rate', async () => {
    const sampler = new RateLimitingSampler(10); // 10 per second
    
    // First 10 should be sampled
    for (let i = 0; i < 10; i++) {
      expect(sampler.shouldSample()).toBe(true);
    }
    
    // 11th should not be sampled (rate limited)
    expect(sampler.shouldSample()).toBe(false);
  });
});

describe('BatchSpanProcessor', () => {
  it('should queue spans and batch export', async () => {
    const exported = [];
    const exporter = {
      export: async (spans) => exported.push(...spans),
      shutdown: async () => {}
    };
    
    const processor = new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 2,
      scheduleDelayMillis: 1000
    });
    
    const ctx = new TraceContext(null, null, null, true);
    const span1 = new Span('test1', ctx);
    const span2 = new Span('test2', ctx);
    
    processor.onEnd(span1);
    processor.onEnd(span2);
    
    // Wait for batch to export
    await new Promise(r => setTimeout(r, 100));
    
    expect(exported).toHaveLength(2);
    expect(exported[0].name).toBe('test1');
    expect(exported[1].name).toBe('test2');
    
    await processor.shutdown();
  });

  it('should not export unsampled spans', async () => {
    const exported = [];
    const exporter = {
      export: async (spans) => exported.push(...spans),
      shutdown: async () => {}
    };
    
    const processor = new BatchSpanProcessor(exporter);
    
    const sampledCtx = new TraceContext(null, null, null, true);
    const unsampledCtx = new TraceContext(null, null, null, false);
    
    processor.onEnd(new Span('sampled', sampledCtx));
    processor.onEnd(new Span('unsampled', unsampledCtx));
    
    await processor.shutdown();
    
    expect(exported).toHaveLength(1);
    expect(exported[0].name).toBe('sampled');
  });
});

describe('Tracer', () => {
  it('should create spans with correct context', () => {
    const tracer = new Tracer('test-service');
    const span = tracer.startSpan('test-operation');
    
    expect(span.name).toBe('test-operation');
    expect(span.context.traceId).toHaveLength(32);
    expect(span.tags.get('service.name')).toBe('test-service');
  });

  it('should create child spans', () => {
    const tracer = new Tracer('test-service');
    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', { parent: parent.context });
    
    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
  });

  it('should execute withSpan correctly', async () => {
    const tracer = new Tracer('test-service');
    
    const result = await tracer.withSpan('test', async (span) => {
      span.setTag('test', true);
      return 'success';
    });
    
    expect(result).toBe('success');
  });

  it('should handle errors in withSpan', async () => {
    const tracer = new Tracer('test-service');
    
    await expect(tracer.withSpan('test', async (span) => {
      throw new Error('Test error');
    })).rejects.toThrow('Test error');
  });

  it('should extract context from carrier', () => {
    const tracer = new Tracer('test-service');
    const carrier = { 'traceparent': '00-abc123-def456-01' };
    
    const ctx = tracer.extract(carrier);
    
    expect(ctx.traceId).toBe('abc123');
    expect(ctx.spanId).toBe('def456');
  });

  it('should inject context into carrier', () => {
    const tracer = new Tracer('test-service');
    const span = tracer.startSpan('test');
    const carrier = {};
    
    tracer.inject(span.context, carrier);
    
    expect(carrier['traceparent']).toBeDefined();
  });
});

describe('Exporters', () => {
  it('ConsoleExporter should log spans', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args);
    
    const exporter = new ConsoleExporter();
    const ctx = new TraceContext(null, null, null, true);
    await exporter.export([new Span('test', ctx)]);
    
    console.log = originalLog;
    
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toBe('[TRACE]');
  });

  it('FileExporter should write to file', async () => {
    const fs = {
      appendFile: async (path, data) => {
        fs.lastPath = path;
        fs.lastData = data;
      }
    };
    
    const exporter = new FileExporter({ filePath: '/tmp/traces.jsonl', fs });
    const ctx = new TraceContext(null, null, null, true);
    await exporter.export([new Span('test', ctx)]);
    
    expect(fs.lastPath).toBe('/tmp/traces.jsonl');
    expect(fs.lastData).toContain('test');
  });
});

describe('Propagators', () => {
  it('W3CPropagator should extract and inject', () => {
    const propagator = new W3CPropagator();
    const carrier = { 'traceparent': '00-abc123-def456-01' };
    
    const ctx = propagator.extract(carrier);
    expect(ctx.traceId).toBe('abc123');
    
    const output = {};
    propagator.inject(ctx, output);
    expect(output['traceparent']).toContain('abc123');
  });

  it('JaegerPropagator should extract and inject', () => {
    const propagator = new JaegerPropagator();
    const carrier = { 'uber-trace-id': 'abc123:def456:0:0:1' };
    
    const ctx = propagator.extract(carrier);
    expect(ctx.traceId).toContain('abc123');
    
    const output = {};
    propagator.inject(ctx, output);
    expect(output['uber-trace-id']).toContain('abc123');
  });
});

describe('Integration', () => {
  beforeEach(() => {
    // Reset global tracer
    initGlobalTracer('test-service');
  });

  it('should use global tracer', async () => {
    const tracer = getGlobalTracer();
    expect(tracer.serviceName).toBe('test-service');
  });

  it('should trace function with trace helper', async () => {
    const result = await trace('test-operation', async (span) => {
      return 'completed';
    });
    
    expect(result).toBe('completed');
  });
});

// Run tests
console.log('Running Distributed Tracing Tests...\n');
