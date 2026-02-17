/**
 * Saga Pattern Tests
 */

import {
  Saga,
  SagaStep,
  SagaOrchestrator,
  InMemorySagaStorage,
  SagaStatus,
  StepStatus,
  SagaEventType,
  createBetPlacementSaga,
  createOpportunityExecutionSaga,
  createWithdrawalSaga
} from './saga-pattern.js';

import { describe, it, expect, beforeEach } from './test-framework.js';

describe('SagaStep', () => {
  it('should create a step with default values', () => {
    const step = new SagaStep({
      name: 'test-step',
      execute: async () => 'result'
    });

    expect(step.name).toBe('test-step');
    expect(step.status).toBe(StepStatus.PENDING);
    expect(step.retryPolicy.maxRetries).toBe(0);
  });

  it('should execute successfully', async () => {
    const step = new SagaStep({
      name: 'test-step',
      execute: async (ctx) => ({ value: ctx.testValue })
    });

    const result = await step.run({ testValue: 42 });

    expect(result.success).toBe(true);
    expect(result.result.value).toBe(42);
    expect(step.status).toBe(StepStatus.COMPLETED);
  });

  it('should handle execution failure', async () => {
    const step = new SagaStep({
      name: 'failing-step',
      execute: async () => {
        throw new Error('Execution failed');
      }
    });

    const result = await step.run({});

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Execution failed');
    expect(step.status).toBe(StepStatus.FAILED);
  });

  it('should compensate successfully', async () => {
    const compensateFn = jest.fn();
    const step = new SagaStep({
      name: 'test-step',
      execute: async () => 'result',
      compensate: compensateFn
    });

    await step.run({});
    const result = await step.runCompensation({});

    expect(result.success).toBe(true);
    expect(compensateFn).toHaveBeenCalled();
    expect(step.status).toBe(StepStatus.COMPENSATED);
  });

  it('should skip compensation if no compensate function', async () => {
    const step = new SagaStep({
      name: 'test-step',
      execute: async () => 'result'
    });

    await step.run({});
    const result = await step.runCompensation({});

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('should check dependencies', () => {
    const step = new SagaStep({
      name: 'dependent-step',
      execute: async () => 'result',
      dependsOn: ['step1', 'step2']
    });

    const completedStep1 = new SagaStep({ id: 'step1', name: 'step1', execute: async () => {} });
    completedStep1.status = StepStatus.COMPLETED;

    expect(step.canRun([completedStep1])).toBe(false); // step2 not completed

    const completedStep2 = new SagaStep({ id: 'step2', name: 'step2', execute: async () => {} });
    completedStep2.status = StepStatus.COMPLETED;

    expect(step.canRun([completedStep1, completedStep2])).toBe(true);
  });
});

describe('Saga', () => {
  it('should execute sequential steps successfully', async () => {
    const executionOrder = [];
    
    const saga = new Saga({ name: 'test-saga' })
      .addStep({
        name: 'step1',
        execute: async () => {
          executionOrder.push('step1');
          return { data: 1 };
        }
      })
      .addStep({
        name: 'step2',
        execute: async () => {
          executionOrder.push('step2');
          return { data: 2 };
        }
      });

    const result = await saga.execute();

    expect(result.success).toBe(true);
    expect(executionOrder).toEqual(['step1', 'step2']);
    expect(saga.status).toBe(SagaStatus.COMPLETED);
  });

  it('should execute steps with dependencies in order', async () => {
    const executionOrder = [];
    
    const saga = new Saga({ name: 'test-saga' })
      .addStep({
        id: 'a',
        name: 'step-a',
        execute: async () => {
          executionOrder.push('a');
          return {};
        }
      })
      .addStep({
        id: 'b',
        name: 'step-b',
        dependsOn: ['a'],
        execute: async () => {
          executionOrder.push('b');
          return {};
        }
      })
      .addStep({
        id: 'c',
        name: 'step-c',
        dependsOn: ['a'],
        execute: async () => {
          executionOrder.push('c');
          return {};
        }
      })
      .addStep({
        id: 'd',
        name: 'step-d',
        dependsOn: ['b', 'c'],
        execute: async () => {
          executionOrder.push('d');
          return {};
        }
      });

    await saga.execute();

    expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('b'));
    expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('c'));
    expect(executionOrder.indexOf('b')).toBeLessThan(executionOrder.indexOf('d'));
    expect(executionOrder.indexOf('c')).toBeLessThan(executionOrder.indexOf('d'));
  });

  it('should compensate on failure', async () => {
    const compensateCalls = [];
    
    const saga = new Saga({ name: 'test-saga' })
      .addStep({
        id: 'step1',
        name: 'step1',
        execute: async () => ({ value: 1 }),
        compensate: async () => compensateCalls.push('step1')
      })
      .addStep({
        id: 'step2',
        name: 'step2',
        execute: async () => {
          throw new Error('Step 2 failed');
        },
        compensate: async () => compensateCalls.push('step2')
      })
      .addStep({
        id: 'step3',
        name: 'step3',
        execute: async () => ({ value: 3 }),
        compensate: async () => compensateCalls.push('step3')
      });

    const result = await saga.execute();

    expect(result.success).toBe(false);
    expect(compensateCalls).toEqual(['step1']); // Only step1 was completed and needs compensation
    expect(saga.status).toBe(SagaStatus.COMPENSATED);
  });

  it('should emit events during execution', async () => {
    const events = [];
    
    const saga = new Saga({ name: 'test-saga' })
      .addStep({
        name: 'step1',
        execute: async () => 'result'
      });

    saga.on('event', (event) => events.push(event.type));

    await saga.execute();

    expect(events).toContain(SagaEventType.SAGA_STARTED);
    expect(events).toContain(SagaEventType.STEP_STARTED);
    expect(events).toContain(SagaEventType.STEP_COMPLETED);
    expect(events).toContain(SagaEventType.SAGA_COMPLETED);
  });

  it('should support parallel execution', async () => {
    const startTimes = {};
    const endTimes = {};
    
    const saga = new Saga({ name: 'parallel-saga', parallel: true })
      .addStep({
        id: 'step1',
        name: 'step1',
        execute: async () => {
          startTimes.step1 = Date.now();
          await new Promise(r => setTimeout(r, 50));
          endTimes.step1 = Date.now();
          return {};
        }
      })
      .addStep({
        id: 'step2',
        name: 'step2',
        execute: async () => {
          startTimes.step2 = Date.now();
          await new Promise(r => setTimeout(r, 50));
          endTimes.step2 = Date.now();
          return {};
        }
      });

    await saga.execute();

    // Steps should overlap in parallel execution
    expect(startTimes.step2).toBeLessThan(endTimes.step1);
  });

  it('should handle step timeout', async () => {
    const saga = new Saga({ name: 'timeout-saga' })
      .addStep({
        name: 'slow-step',
        timeoutMs: 50,
        execute: async () => {
          await new Promise(r => setTimeout(r, 100));
          return {};
        }
      });

    const result = await saga.execute();

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should retry failed steps', async () => {
    let attempts = 0;
    
    const saga = new Saga({ name: 'retry-saga' })
      .addStep({
        name: 'flaky-step',
        retryPolicy: { maxRetries: 2, delayMs: 10 },
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        }
      });

    const result = await saga.execute();

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });
});

describe('SagaOrchestrator', () => {
  let orchestrator;
  let storage;

  beforeEach(() => {
    storage = new InMemorySagaStorage();
    orchestrator = new SagaOrchestrator({ storage });
  });

  it('should create and execute sagas', async () => {
    const saga = await orchestrator.createSaga({
      name: 'test-saga'
    });

    saga.addStep({
      name: 'test-step',
      execute: async () => 'result'
    });

    const result = await orchestrator.executeSaga(saga.id);

    expect(result.success).toBe(true);
  });

  it('should persist saga state', async () => {
    const saga = await orchestrator.createSaga({
      name: 'test-saga'
    });

    saga.addStep({
      name: 'test-step',
      execute: async () => 'result'
    });

    await orchestrator.executeSaga(saga.id);

    const persisted = await storage.load(saga.id);
    expect(persisted.status).toBe(SagaStatus.COMPLETED);
  });

  it('should list sagas with filters', async () => {
    const saga1 = await orchestrator.createSaga({ name: 'saga-1' });
    const saga2 = await orchestrator.createSaga({ name: 'saga-2' });

    saga1.addStep({ name: 'step', execute: async () => {} });
    saga2.addStep({ name: 'step', execute: async () => {} });

    await orchestrator.executeSaga(saga1.id);
    await orchestrator.executeSaga(saga2.id);

    const completed = await orchestrator.listSagas({ status: SagaStatus.COMPLETED });
    expect(completed.length).toBe(2);
  });
});

describe('Pre-built Sagas', () => {
  it('should create bet placement saga', () => {
    const mockServices = {
      userManagement: {
        getBalance: async () => 1000,
        reserveFunds: async () => ({ id: 'reservation-1' }),
        releaseReservation: async () => {},
        deductFunds: async () => {},
        refund: async () => {}
      },
      bookmaker: {
        placeBet: async () => ({ id: 'placement-1', bookmakerBetId: 'bm-1' }),
        cancelBet: async () => {},
        confirmBet: async () => ({ confirmed: true })
      },
      betTracker: {
        recordBet: async () => ({ id: 'bet-1' })
      }
    };

    const saga = createBetPlacementSaga({
      userId: 'user-1',
      bet: {
        id: 'bet-1',
        bookmakerId: 'bm-1',
        eventId: 'event-1',
        market: '1X2',
        selection: 'home',
        odds: 2.0,
        amount: 100,
        expectedProfit: 5
      },
      services: mockServices
    });

    expect(saga.name).toBe('bet-placement');
    expect(saga.steps.size).toBeGreaterThan(0);
  });

  it('should create opportunity execution saga', () => {
    const mockServices = {
      arbitrage: {
        getOpportunity: async () => ({
          id: 'opp-1',
          status: 'active',
          profitPercent: 2.5
        })
      },
      bookmaker: {
        placeBet: async () => ({ id: 'placement-1', bookmakerBetId: 'bm-1' }),
        cancelBet: async () => {}
      },
      betTracker: {
        recordArbitrageBet: async () => ({ id: 'arb-bet-1' })
      }
    };

    const saga = createOpportunityExecutionSaga({
      userId: 'user-1',
      opportunityId: 'opp-1',
      minProfitPercent: 1.0,
      expectedProfit: 10,
      legs: [
        { bookmaker: 'Unibet', bookmakerId: 'uni', eventId: 'e1', market: '1X2', selection: 'home', odds: 2.1, stake: 100 },
        { bookmaker: 'Betclic', bookmakerId: 'bcl', eventId: 'e1', market: '1X2', selection: 'away', odds: 2.0, stake: 105 }
      ],
      services: mockServices
    });

    expect(saga.name).toBe('opportunity-execution');
    expect(saga.parallel).toBe(true);
  });

  it('should create withdrawal saga', () => {
    const mockServices = {
      userManagement: {
        getAvailableBalance: async () => 1000,
        lockFunds: async () => ({ id: 'lock-1' }),
        unlockFunds: async () => {},
        createWithdrawal: async () => ({ id: 'wd-1' }),
        completeWithdrawal: async () => {}
      },
      payment: {
        processWithdrawal: async () => ({ id: 'pay-1', status: 'completed' }),
        cancelWithdrawal: async () => {}
      }
    };

    const saga = createWithdrawalSaga({
      userId: 'user-1',
      withdrawalId: 'wd-1',
      amount: 500,
      paymentMethod: 'bank_transfer',
      services: mockServices
    });

    expect(saga.name).toBe('withdrawal');
    expect(saga.steps.size).toBeGreaterThan(0);
  });
});

console.log('Running Saga Pattern Tests...\n');
