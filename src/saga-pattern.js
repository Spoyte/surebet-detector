/**
 * Saga Pattern Implementation for Distributed Transactions
 * 
 * Manages distributed transactions across microservices for bet placement workflows.
 * Implements both Choreography and Orchestration saga patterns.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Saga Status Constants
 */
export const SagaStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated'
};

/**
 * Saga Step Status
 */
export const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated',
  SKIPPED: 'skipped'
};

/**
 * Saga Event Types
 */
export const SagaEventType = {
  SAGA_STARTED: 'saga.started',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_FAILED: 'step.failed',
  STEP_COMPENSATING: 'step.compensating',
  STEP_COMPENSATED: 'step.compensated',
  SAGA_COMPLETED: 'saga.completed',
  SAGA_FAILED: 'saga.failed',
  SAGA_COMPENSATED: 'saga.compensated'
};

/**
 * Saga Step - Represents a single step in a saga
 */
export class SagaStep {
  constructor(options) {
    this.id = options.id || randomUUID();
    this.name = options.name;
    this.execute = options.execute;
    this.compensate = options.compensate || null;
    this.retryPolicy = options.retryPolicy || { maxRetries: 0, delayMs: 0 };
    this.timeoutMs = options.timeoutMs || 30000;
    this.dependsOn = options.dependsOn || [];
    
    this.status = StepStatus.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
  }

  async run(context) {
    this.status = StepStatus.RUNNING;
    this.startTime = Date.now();
    this.attempts++;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Step ${this.name} timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
      });

      this.result = await Promise.race([
        this.execute(context),
        timeoutPromise
      ]);

      this.status = StepStatus.COMPLETED;
      this.endTime = Date.now();
      return { success: true, result: this.result };
    } catch (error) {
      this.error = error;
      this.status = StepStatus.FAILED;
      this.endTime = Date.now();
      return { success: false, error };
    }
  }

  async runCompensation(context) {
    if (!this.compensate || this.status !== StepStatus.COMPLETED) {
      this.status = StepStatus.SKIPPED;
      return { success: true, skipped: true };
    }

    this.status = StepStatus.COMPENSATING;
    this.startTime = Date.now();

    try {
      await this.compensate(context, this.result);
      this.status = StepStatus.COMPENSATED;
      this.endTime = Date.now();
      return { success: true };
    } catch (error) {
      this.error = error;
      this.status = StepStatus.FAILED;
      this.endTime = Date.now();
      return { success: false, error };
    }
  }

  canRun(completedSteps) {
    return this.dependsOn.every(depId => 
      completedSteps.some(step => step.id === depId && step.status === StepStatus.COMPLETED)
    );
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      result: this.result,
      error: this.error?.message,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime && this.startTime ? this.endTime - this.startTime : null,
      attempts: this.attempts,
      dependsOn: this.dependsOn
    };
  }
}

/**
 * Saga - Manages a distributed transaction
 */
export class Saga extends EventEmitter {
  constructor(options) {
    super();
    this.id = options.id || randomUUID();
    this.name = options.name;
    this.steps = new Map();
    this.status = SagaStatus.PENDING;
    this.context = options.context || {};
    this.metadata = options.metadata || {};
    this.parallel = options.parallel || false;
    this.compensateOnFailure = options.compensateOnFailure !== false;
    
    this.startTime = null;
    this.endTime = null;
    this.events = [];
  }

  addStep(step) {
    if (!(step instanceof SagaStep)) {
      step = new SagaStep(step);
    }
    this.steps.set(step.id, step);
    return this;
  }

  addSteps(steps) {
    steps.forEach(step => this.addStep(step));
    return this;
  }

  async execute() {
    this.status = SagaStatus.RUNNING;
    this.startTime = Date.now();
    this._emitEvent(SagaEventType.SAGA_STARTED, { sagaId: this.id });

    try {
      if (this.parallel) {
        await this._executeParallel();
      } else {
        await this._executeSequential();
      }

      this.status = SagaStatus.COMPLETED;
      this.endTime = Date.now();
      this._emitEvent(SagaEventType.SAGA_COMPLETED, { sagaId: this.id });
      
      return {
        success: true,
        sagaId: this.id,
        results: this._getResults()
      };
    } catch (error) {
      this.status = SagaStatus.FAILED;
      this.endTime = Date.now();
      this._emitEvent(SagaEventType.SAGA_FAILED, { sagaId: this.id, error: error.message });

      if (this.compensateOnFailure) {
        await this.compensate();
      }

      return {
        success: false,
        sagaId: this.id,
        error: error.message,
        failedStep: this._getFailedStep(),
        results: this._getResults()
      };
    }
  }

  async _executeSequential() {
    const sortedSteps = this._topologicalSort();
    
    for (const step of sortedSteps) {
      this._emitEvent(SagaEventType.STEP_STARTED, { stepId: step.id, stepName: step.name });
      
      const result = await this._executeStepWithRetry(step);
      
      if (!result.success) {
        this._emitEvent(SagaEventType.STEP_FAILED, { 
          stepId: step.id, 
          stepName: step.name, 
          error: result.error.message 
        });
        throw result.error;
      }
      
      this._emitEvent(SagaEventType.STEP_COMPLETED, { stepId: step.id, stepName: step.name });
    }
  }

  async _executeParallel() {
    const pendingSteps = Array.from(this.steps.values());
    const completedSteps = [];
    const runningSteps = new Set();

    while (pendingSteps.length > 0 || runningSteps.size > 0) {
      // Find steps that can run
      const readySteps = pendingSteps.filter(step => 
        step.canRun(completedSteps) && !runningSteps.has(step.id)
      );

      // Start ready steps
      for (const step of readySteps) {
        runningSteps.add(step.id);
        this._executeStepAsync(step, runningSteps, completedSteps, pendingSteps);
      }

      // Wait a bit before checking again
      if (runningSteps.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Check if any step failed
    const failedStep = Array.from(this.steps.values()).find(s => s.status === StepStatus.FAILED);
    if (failedStep) {
      throw failedStep.error;
    }
  }

  async _executeStepAsync(step, runningSteps, completedSteps, pendingSteps) {
    this._emitEvent(SagaEventType.STEP_STARTED, { stepId: step.id, stepName: step.name });
    
    const result = await this._executeStepWithRetry(step);
    
    runningSteps.delete(step.id);
    
    if (result.success) {
      completedSteps.push(step);
      pendingSteps.splice(pendingSteps.indexOf(step), 1);
      this._emitEvent(SagaEventType.STEP_COMPLETED, { stepId: step.id, stepName: step.name });
    } else {
      this._emitEvent(SagaEventType.STEP_FAILED, { 
        stepId: step.id, 
        stepName: step.name, 
        error: result.error.message 
      });
    }
  }

  async _executeStepWithRetry(step) {
    let result = await step.run(this.context);
    
    while (!result.success && step.attempts <= step.retryPolicy.maxRetries) {
      if (step.retryPolicy.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, step.retryPolicy.delayMs));
      }
      result = await step.run(this.context);
    }
    
    return result;
  }

  async compensate() {
    this.status = SagaStatus.COMPENSATING;
    
    const completedSteps = Array.from(this.steps.values())
      .filter(step => step.status === StepStatus.COMPLETED)
      .reverse(); // Compensate in reverse order

    for (const step of completedSteps) {
      this._emitEvent(SagaEventType.STEP_COMPENSATING, { stepId: step.id, stepName: step.name });
      
      const result = await step.runCompensation(this.context);
      
      if (result.success) {
        this._emitEvent(SagaEventType.STEP_COMPENSATED, { stepId: step.id, stepName: step.name });
      } else {
        // Log compensation failure - may need manual intervention
        console.error(`Compensation failed for step ${step.name}:`, result.error);
      }
    }

    this.status = SagaStatus.COMPENSATED;
    this._emitEvent(SagaEventType.SAGA_COMPENSATED, { sagaId: this.id });
  }

  _topologicalSort() {
    const steps = Array.from(this.steps.values());
    const visited = new Set();
    const result = [];

    const visit = (step) => {
      if (visited.has(step.id)) return;
      visited.add(step.id);

      for (const depId of step.dependsOn) {
        const dep = this.steps.get(depId);
        if (dep) visit(dep);
      }

      result.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return result;
  }

  _getResults() {
    const results = {};
    for (const [id, step] of this.steps) {
      results[id] = step.toJSON();
    }
    return results;
  }

  _getFailedStep() {
    for (const step of this.steps.values()) {
      if (step.status === StepStatus.FAILED) {
        return { id: step.id, name: step.name, error: step.error?.message };
      }
    }
    return null;
  }

  _emitEvent(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      sagaId: this.id,
      ...data
    };
    this.events.push(event);
    this.emit(type, event);
    this.emit('event', event);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      context: this.context,
      metadata: this.metadata,
      steps: Array.from(this.steps.values()).map(s => s.toJSON()),
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime && this.startTime ? this.endTime - this.startTime : null,
      events: this.events
    };
  }
}

/**
 * Saga Orchestrator - Manages multiple sagas
 */
export class SagaOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sagas = new Map();
    this.storage = options.storage || new InMemorySagaStorage();
    this.messageBroker = options.messageBroker || null;
  }

  async createSaga(definition) {
    const saga = new Saga(definition);
    this.sagas.set(saga.id, saga);
    await this.storage.save(saga);
    return saga;
  }

  async executeSaga(sagaId) {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    // Subscribe to saga events for persistence
    saga.on('event', async (event) => {
      await this.storage.saveEvent(sagaId, event);
      
      if (this.messageBroker) {
        await this.messageBroker.publish('saga.events', event);
      }
    });

    const result = await saga.execute();
    await this.storage.save(saga);
    
    return result;
  }

  async getSaga(sagaId) {
    return this.sagas.get(sagaId) || await this.storage.load(sagaId);
  }

  async listSagas(filters = {}) {
    const sagas = await this.storage.list(filters);
    return sagas;
  }

  async compensateSaga(sagaId) {
    const saga = await this.getSaga(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    await saga.compensate();
    await this.storage.save(saga);
    
    return saga.toJSON();
  }
}

/**
 * In-Memory Saga Storage
 */
export class InMemorySagaStorage {
  constructor() {
    this.sagas = new Map();
    this.events = new Map();
  }

  async save(saga) {
    this.sagas.set(saga.id, saga.toJSON());
  }

  async load(sagaId) {
    return this.sagas.get(sagaId);
  }

  async saveEvent(sagaId, event) {
    if (!this.events.has(sagaId)) {
      this.events.set(sagaId, []);
    }
    this.events.get(sagaId).push(event);
  }

  async list(filters = {}) {
    let sagas = Array.from(this.sagas.values());
    
    if (filters.status) {
      sagas = sagas.filter(s => s.status === filters.status);
    }
    
    if (filters.name) {
      sagas = sagas.filter(s => s.name === filters.name);
    }
    
    return sagas;
  }
}

/**
 * Pre-built Saga Definitions for Surebet Workflows
 */

/**
 * Bet Placement Saga
 * 
 * Workflow:
 * 1. Validate bet parameters
 * 2. Check user balance
 * 3. Reserve funds
 * 4. Place bet with bookmaker
 * 5. Confirm bet placement
 * 6. Update bet tracker
 * 7. Release reservation / deduct funds
 */
export function createBetPlacementSaga(context) {
  return new Saga({
    name: 'bet-placement',
    context,
    parallel: false,
    compensateOnFailure: true
  })
    .addStep({
      id: 'validate',
      name: 'Validate Bet Parameters',
      execute: async (ctx) => {
        if (!ctx.bet || !ctx.bet.amount || !ctx.bet.odds) {
          throw new Error('Invalid bet parameters');
        }
        return { valid: true };
      }
    })
    .addStep({
      id: 'check-balance',
      name: 'Check User Balance',
      execute: async (ctx) => {
        const balance = await ctx.services.userManagement.getBalance(ctx.userId);
        if (balance < ctx.bet.amount) {
          throw new Error('Insufficient balance');
        }
        return { balance };
      }
    })
    .addStep({
      id: 'reserve-funds',
      name: 'Reserve Funds',
      dependsOn: ['check-balance'],
      execute: async (ctx) => {
        const reservation = await ctx.services.userManagement.reserveFunds(
          ctx.userId, 
          ctx.bet.amount,
          { sagaId: ctx.sagaId, betId: ctx.bet.id }
        );
        return { reservationId: reservation.id };
      },
      compensate: async (ctx, result) => {
        await ctx.services.userManagement.releaseReservation(result.reservationId);
      }
    })
    .addStep({
      id: 'place-bet',
      name: 'Place Bet with Bookmaker',
      dependsOn: ['validate', 'reserve-funds'],
      execute: async (ctx) => {
        const placement = await ctx.services.bookmaker.placeBet({
          bookmakerId: ctx.bet.bookmakerId,
          eventId: ctx.bet.eventId,
          market: ctx.bet.market,
          selection: ctx.bet.selection,
          odds: ctx.bet.odds,
          stake: ctx.bet.amount
        });
        return { placementId: placement.id, bookmakerBetId: placement.bookmakerBetId };
      },
      compensate: async (ctx, result) => {
        await ctx.services.bookmaker.cancelBet(result.placementId);
      },
      retryPolicy: { maxRetries: 2, delayMs: 1000 },
      timeoutMs: 30000
    })
    .addStep({
      id: 'confirm-bet',
      name: 'Confirm Bet Placement',
      dependsOn: ['place-bet'],
      execute: async (ctx, steps) => {
        const confirmation = await ctx.services.bookmaker.confirmBet(
          steps['place-bet'].result.placementId
        );
        return { confirmed: true, confirmation };
      }
    })
    .addStep({
      id: 'track-bet',
      name: 'Update Bet Tracker',
      dependsOn: ['confirm-bet'],
      execute: async (ctx, steps) => {
        const bet = await ctx.services.betTracker.recordBet({
          userId: ctx.userId,
          bookmakerId: ctx.bet.bookmakerId,
          bookmakerBetId: steps['place-bet'].result.bookmakerBetId,
          eventId: ctx.bet.eventId,
          market: ctx.bet.market,
          selection: ctx.bet.selection,
          odds: ctx.bet.odds,
          stake: ctx.bet.amount,
          expectedProfit: ctx.bet.expectedProfit
        });
        return { betId: bet.id };
      }
    })
    .addStep({
      id: 'deduct-funds',
      name: 'Deduct Funds',
      dependsOn: ['track-bet'],
      execute: async (ctx, steps) => {
        await ctx.services.userManagement.deductFunds(
          ctx.userId,
          ctx.bet.amount,
          {
            reservationId: steps['reserve-funds'].result.reservationId,
            betId: steps['track-bet'].result.betId
          }
        );
        return { deducted: true };
      },
      compensate: async (ctx, steps) => {
        await ctx.services.userManagement.refund(
          ctx.userId,
          ctx.bet.amount,
          { reason: 'saga-compensation', betId: steps['track-bet']?.result?.betId }
        );
      }
    });
}

/**
 * Opportunity Execution Saga
 * 
 * Executes all legs of an arbitrage opportunity atomically
 */
export function createOpportunityExecutionSaga(context) {
  const saga = new Saga({
    name: 'opportunity-execution',
    context,
    parallel: true, // Execute legs in parallel
    compensateOnFailure: true
  });

  // Add validation step
  saga.addStep({
    id: 'validate-opportunity',
    name: 'Validate Opportunity',
    execute: async (ctx) => {
      const opportunity = await ctx.services.arbitrage.getOpportunity(ctx.opportunityId);
      if (!opportunity || opportunity.status !== 'active') {
        throw new Error('Opportunity not available');
      }
      if (opportunity.profitPercent < ctx.minProfitPercent) {
        throw new Error('Profit below threshold');
      }
      return { opportunity };
    }
  });

  // Add a step for each leg
  context.legs?.forEach((leg, index) => {
    saga.addStep({
      id: `place-leg-${index}`,
      name: `Place Leg ${index + 1} - ${leg.bookmaker}`,
      dependsOn: ['validate-opportunity'],
      execute: async (ctx) => {
        const placement = await ctx.services.bookmaker.placeBet({
          bookmakerId: leg.bookmakerId,
          eventId: leg.eventId,
          market: leg.market,
          selection: leg.selection,
          odds: leg.odds,
          stake: leg.stake
        });
        return { 
          legIndex: index,
          placementId: placement.id,
          bookmakerBetId: placement.bookmakerBetId
        };
      },
      compensate: async (ctx, result) => {
        await ctx.services.bookmaker.cancelBet(result.placementId);
      },
      retryPolicy: { maxRetries: 1, delayMs: 500 },
      timeoutMs: 20000
    });
  });

  // Final confirmation step
  saga.addStep({
    id: 'confirm-all',
    name: 'Confirm All Legs Placed',
    dependsOn: context.legs?.map((_, i) => `place-leg-${i}`) || [],
    execute: async (ctx, steps) => {
      const legResults = context.legs?.map((_, i) => steps[`place-leg-${i}`]?.result) || [];
      
      await ctx.services.betTracker.recordArbitrageBet({
        userId: ctx.userId,
        opportunityId: ctx.opportunityId,
        legs: legResults,
        totalStake: context.legs?.reduce((sum, leg) => sum + leg.stake, 0),
        expectedProfit: ctx.expectedProfit
      });
      
      return { confirmed: true, legs: legResults };
    }
  });

  return saga;
}

/**
 * Withdrawal Saga
 * 
 * Handles withdrawal workflow with proper fund locking
 */
export function createWithdrawalSaga(context) {
  return new Saga({
    name: 'withdrawal',
    context,
    parallel: false,
    compensateOnFailure: true
  })
    .addStep({
      id: 'validate',
      name: 'Validate Withdrawal Request',
      execute: async (ctx) => {
        if (!ctx.amount || ctx.amount <= 0) {
          throw new Error('Invalid withdrawal amount');
        }
        if (!ctx.paymentMethod) {
          throw new Error('Payment method required');
        }
        return { valid: true };
      }
    })
    .addStep({
      id: 'check-balance',
      name: 'Check Available Balance',
      execute: async (ctx) => {
        const balance = await ctx.services.userManagement.getAvailableBalance(ctx.userId);
        if (balance < ctx.amount) {
          throw new Error('Insufficient available balance');
        }
        return { availableBalance: balance };
      }
    })
    .addStep({
      id: 'lock-funds',
      name: 'Lock Withdrawal Amount',
      dependsOn: ['check-balance'],
      execute: async (ctx) => {
        const lock = await ctx.services.userManagement.lockFunds(
          ctx.userId,
          ctx.amount,
          { reason: 'withdrawal', withdrawalId: ctx.withdrawalId }
        );
        return { lockId: lock.id };
      },
      compensate: async (ctx, result) => {
        await ctx.services.userManagement.unlockFunds(result.lockId);
      }
    })
    .addStep({
      id: 'create-withdrawal',
      name: 'Create Withdrawal Record',
      dependsOn: ['lock-funds'],
      execute: async (ctx) => {
        const withdrawal = await ctx.services.userManagement.createWithdrawal({
          userId: ctx.userId,
          amount: ctx.amount,
          paymentMethod: ctx.paymentMethod,
          status: 'pending'
        });
        return { withdrawalId: withdrawal.id };
      }
    })
    .addStep({
      id: 'process-payment',
      name: 'Process Payment',
      dependsOn: ['create-withdrawal'],
      execute: async (ctx, steps) => {
        const payment = await ctx.services.payment.processWithdrawal({
          withdrawalId: steps['create-withdrawal'].result.withdrawalId,
          amount: ctx.amount,
          paymentMethod: ctx.paymentMethod
        });
        return { paymentId: payment.id, status: payment.status };
      },
      compensate: async (ctx, steps) => {
        await ctx.services.payment.cancelWithdrawal(steps['process-payment'].result.paymentId);
      },
      retryPolicy: { maxRetries: 3, delayMs: 2000 },
      timeoutMs: 60000
    })
    .addStep({
      id: 'complete',
      name: 'Complete Withdrawal',
      dependsOn: ['process-payment'],
      execute: async (ctx, steps) => {
        await ctx.services.userManagement.completeWithdrawal({
          withdrawalId: steps['create-withdrawal'].result.withdrawalId,
          paymentId: steps['process-payment'].result.paymentId,
          lockId: steps['lock-funds'].result.lockId
        });
        return { completed: true };
      }
    });
}

export default {
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
};
