# Distributed Tracing with Jaeger

This document describes the distributed tracing implementation for the Surebet Detector microservices architecture using Jaeger.

## Overview

Distributed tracing tracks requests as they flow through multiple microservices, providing visibility into:
- Request latency across service boundaries
- Service dependencies and call graphs
- Error propagation and root cause analysis
- Performance bottlenecks

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Odds Collector  │────▶│   Redis Cache   │
│  (with tracing) │     │  (with tracing)  │     │  (with tracing) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │   RabbitMQ MQ    │
         │              │  (with tracing)  │
         │              └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│ Other Services  │◀────│ Arbitrage Detector│
│  (with tracing) │     │  (with tracing)   │
└─────────────────┘     └──────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
            ┌──────────────────┐
            │  Jaeger Collector │
            │    (Port 14268)   │
            └──────────────────┘
                     │
                     ▼
            ┌──────────────────┐
            │   Jaeger UI       │
            │   (Port 16686)    │
            └──────────────────┘
```

## Components

### 1. Core Tracing Module (`src/distributed-tracing.js`)

The foundation of the tracing system:

- **TraceContext**: Propagates trace IDs across service boundaries
- **Span**: Represents a single operation within a trace
- **Tracer**: Creates and manages spans
- **Samplers**: Control which traces are recorded
- **Exporters**: Send traces to Jaeger
- **Propagators**: Handle trace context in HTTP headers

### 2. Service Integration (`src/tracing-integration.js`)

Pre-configured tracers for each microservice:

```javascript
import { initializeTracing, createServiceTracingMiddleware } from './tracing-integration.js';

// Initialize tracer for this service
const tracer = initializeTracing('api-gateway', {
  jaegerEndpoint: 'http://jaeger:14268/api/traces',
  sampleRate: 0.1
});

// Add Express middleware
app.use(createServiceTracingMiddleware(tracer, 'api-gateway'));
```

### 3. Auto-Instrumentation

The tracing system automatically instruments:

- **HTTP requests**: Incoming and outgoing
- **Message queue operations**: Publish and consume
- **Database queries**: All SQL operations
- **Redis operations**: Cache reads/writes

## Quick Start

### 1. Start Jaeger

Using Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  jaegertracing/all-in-one:1.45
```

Or use the included Docker Compose:

```bash
docker-compose -f docker-compose.microservices.yml up jaeger
```

### 2. Access Jaeger UI

Open http://localhost:16686 to view traces.

### 3. Instrument Your Service

```javascript
import { initializeTracing, createServiceTracingMiddleware } from '../src/tracing-integration.js';
import express from 'express';

const app = express();

// Initialize tracing
const tracer = initializeTracing('my-service', {
  jaegerEndpoint: process.env.JAEGER_ENDPOINT,
  sampleRate: 0.1
});

// Add tracing middleware
app.use(createServiceTracingMiddleware(tracer, 'my-service'));

// Your routes...
app.get('/api/data', async (req, res) => {
  // req.span is automatically available
  req.span.setTag('custom.tag', 'value');
  req.span.log('processing.started');
  
  // Your logic here...
  
  res.json({ data: 'result' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await tracer.shutdown();
  process.exit(0);
});
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JAEGER_ENDPOINT` | HTTP endpoint for Jaeger collector | `http://localhost:14268/api/traces` |
| `JAEGER_AGENT_HOST` | UDP agent host | `localhost` |
| `JAEGER_AGENT_PORT` | UDP agent port | `6832` |
| `JAEGER_SAMPLE_RATE` | Probability sampling rate (0-1) | `0.1` |
| `JAEGER_SERVICE_NAME` | Override service name | Auto-detected |
| `NODE_ENV` | Environment tag | `development` |

### Sampling Strategies

```javascript
import { 
  AlwaysOnSampler,      // Trace everything
  AlwaysOffSampler,     // Trace nothing
  ProbabilitySampler,   // Trace X% of requests
  RateLimitingSampler   // Max N traces per second
} from './distributed-tracing.js';

// Example: Sample 5% of requests
const sampler = new ProbabilitySampler(0.05);

// Example: Max 10 traces per second
const sampler = new RateLimitingSampler(10);
```

## Manual Instrumentation

### Creating Custom Spans

```javascript
import { getGlobalTracer } from './distributed-tracing.js';

const tracer = getGlobalTracer();

// Simple span
const span = tracer.startSpan('database-query');
span.setTag('db.table', 'opportunities');
span.setTag('db.operation', 'select');
// ... do work ...
span.end();

// Async span with auto-end
await tracer.withSpan('process-opportunity', async (span) => {
  span.setTag('opportunity.id', oppId);
  
  const result = await processOpportunity(oppId);
  
  span.setTag('opportunity.profit', result.profit);
  return result;
});
```

### Adding Events and Logs

```javascript
span.log('cache.miss', { key: 'odds:123' });
span.log('validation.started');
span.log('validation.completed', { duration: 45 });
```

### Recording Errors

```javascript
try {
  await riskyOperation();
} catch (error) {
  span.recordException(error);
  // Span status is automatically set to 'error'
}
```

## Cross-Service Tracing

### HTTP Client Tracing

```javascript
import { createTracedHttpClient } from './distributed-tracing.js';

const httpClient = createTracedHttpClient(tracer, baseHttpClient);

// Trace context is automatically propagated
const response = await httpClient.request({
  method: 'GET',
  url: 'http://other-service/api/data'
});
```

### Message Queue Tracing

```javascript
import { createTracedMessageProducer, createTracedMessageConsumer } from './distributed-tracing.js';

// Producer
const tracedProducer = createTracedMessageProducer(tracer, producer);
await tracedProducer.send('odds.updates', message);

// Consumer
const tracedConsumer = createTracedMessageConsumer(tracer, consumer);
await tracedConsumer.subscribe('odds.updates', async (message) => {
  // message.span and message.traceContext are available
  await processOdds(message.data);
});
```

## Viewing Traces

### Jaeger UI

1. Open http://localhost:16686
2. Select your service from the dropdown
3. Click "Find Traces"
4. Click on a trace to see the full call graph

### Key Features

- **Trace Timeline**: Visual representation of span durations
- **Service Dependencies**: Graph showing service relationships
- **Search**: Filter by service, operation, tags, duration
- **Compare**: Compare two traces side-by-side

## Performance Considerations

### Sampling

- Use lower sample rates for high-throughput services (e.g., odds collector)
- Use higher sample rates for critical paths (e.g., API gateway)
- Always sample errors

### Batch Export

Spans are batched before export to reduce overhead:
- Default batch size: 512 spans
- Default queue size: 2048 spans
- Export interval: 5 seconds

### Overhead

Typical overhead with 10% sampling:
- CPU: < 1%
- Memory: ~10MB per 1000 active spans
- Network: ~1KB per span

## Troubleshooting

### No Traces Appearing

1. Check Jaeger is running: `curl http://localhost:16686`
2. Verify `JAEGER_ENDPOINT` is correct
3. Check sampling rate isn't 0
4. Look for export errors in logs

### Incomplete Traces

1. Ensure trace context is propagated between services
2. Check all services use compatible propagation format (W3C or Jaeger)
3. Verify spans are properly ended

### High Memory Usage

1. Reduce `maxQueueSize` in BatchSpanProcessor
2. Decrease sampling rate
3. Check for spans not being ended

## API Reference

### TraceContext

```javascript
const ctx = new TraceContext(traceId, spanId, parentSpanId, sampled);
const child = ctx.createChild();
const headers = ctx.toHeaders();
const fromHeaders = TraceContext.fromHeaders(headers);
```

### Span

```javascript
span.setTag(key, value);
span.log(event, fields);
span.setStatus('ok' | 'error', message);
span.recordException(error);
span.end();
```

### Tracer

```javascript
const span = tracer.startSpan(name, options);
await tracer.withSpan(name, options, async (span) => { ... });
const ctx = tracer.extract(carrier);
tracer.inject(context, carrier);
await tracer.shutdown();
```

## Migration Guide

### From Existing Logging

Replace:
```javascript
console.log(`Processing opportunity ${id}`);
const start = Date.now();
await processOpportunity(id);
console.log(`Finished in ${Date.now() - start}ms`);
```

With:
```javascript
await tracer.withSpan('process-opportunity', { 
  tags: { 'opportunity.id': id } 
}, async (span) => {
  await processOpportunity(id);
});
```

### Adding to Existing Services

1. Add `initializeTracing()` at startup
2. Add middleware to HTTP framework
3. Wrap external calls with traced clients
4. Add `shutdownTracing()` on exit

## Best Practices

1. **Use semantic conventions**: Follow OpenTelemetry naming standards
2. **Don't trace everything**: Use sampling for high-volume operations
3. **Add business context**: Include IDs, user info, business metrics
4. **Handle errors**: Always record exceptions
5. **End spans**: Ensure spans are ended even on errors
6. **Propagate context**: Pass trace context across all boundaries

## Further Reading

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
