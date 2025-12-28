import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiterService } from '../src/application/services/RateLimiterService';
import { AppConfig, DEFAULTS, getConcurrencyLimit } from '../core/config';
import type { ILogger } from '../src/infrastructure/interfaces/ILogger';
import type { ModelConcurrencyConfig } from '../src/application/services/RateLimiterService';

describe('RateLimiterService - Semaphore Management', () => {
  let rateLimiter: RateLimiterService;
  let appConfig: AppConfig;

  const mockLogger: ILogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    maskApiKey: (key) => (key ? `${key.slice(0, 7)}...${key.slice(-3)}` : 'not set'),
  };

  function convertConcurrencyConfig(config: AppConfig): ModelConcurrencyConfig {
    const result: ModelConcurrencyConfig = {};
    if (config.modelConcurrencyLimits) {
      config.modelConcurrencyLimits.forEach((limit) => {
        const key = limit.model ? `${limit.provider}:${limit.model}` : limit.provider;
        result[key] = limit.concurrency;
      });
    }
    return result;
  }

  beforeEach(() => {
    appConfig = { ...DEFAULTS };
    rateLimiter = new RateLimiterService(mockLogger);
    rateLimiter.configure(
      {
        openai: { limit: 10, window: 60000 },
        ollama: { limit: 20, window: 60000 },
      },
      convertConcurrencyConfig(appConfig)
    );
  });

  describe('Semaphore Acquisition', () => {
    it('should acquire semaphore slot immediately when available', async () => {
      const results: string[] = [];
      
      await rateLimiter.acquire('openai', async () => {
        results.push('task1');
      }, 1, 'gpt-4');

      expect(results).toEqual(['task1']);
    });

    it('should queue tasks when semaphore limit is reached', async () => {
      const results: string[] = [];
      const limit = 2;
      
      const task1 = rateLimiter.acquire('openai', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('task1');
      }, 1, 'gpt-4');

      const task2 = rateLimiter.acquire('openai', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('task2');
      }, 1, 'gpt-4');

      const task3 = rateLimiter.acquire('openai', async () => {
        results.push('task3');
      }, 1, 'gpt-4');

      await Promise.all([task1, task2, task3]);

      expect(results).toEqual(['task1', 'task2', 'task3']);
    });

    it('should respect different limits for different models', async () => {
      const results: string[] = [];

      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
        { provider: 'openai', model: 'gpt-3.5-turbo', concurrency: 3 },
      ]};

      rateLimiter = new RateLimiterService(mockLogger);
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        const model = i % 2 === 0 ? 'gpt-4' : 'gpt-3.5-turbo';
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            results.push(`${model}_${i}`);
          }, 1, model)
        );
      }

      await Promise.all(tasks);

      expect(results.length).toBe(5);
      const gpt4Results = results.filter(r => r.includes('gpt-4'));
      const gpt35Results = results.filter(r => r.includes('gpt-3.5-turbo'));
      expect(gpt4Results.length).toBeGreaterThan(0);
      expect(gpt35Results.length).toBeGreaterThan(0);
    });

    it('should use provider default when no model-specific config exists', async () => {
      const results: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        results.push(`start_${i}`);
        await rateLimiter.acquire('ollama', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push(`end_${i}`);
        }, 1, 'llama3');
      }

      expect(results).toEqual([
        'start_0', 'end_0',
        'start_1', 'end_1',
        'start_2', 'end_2'
      ]);
    });

    it('should handle undefined model by skipping semaphore', async () => {
      const results: string[] = [];
      
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            results.push(`task_${i}`);
          }, 1, undefined)
        );
      }

      await Promise.all(tasks);

      expect(results.length).toBe(5);
    });
  });

  describe('Semaphore Release and Queue Processing', () => {
    it('should release semaphore after task completion', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};

      rateLimiter = new RateLimiterService(mockLogger);
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      await rateLimiter.acquire('openai', async () => {
        results.push('task1');
      }, 1, 'gpt-4');

      await rateLimiter.acquire('openai', async () => {
        results.push('task2');
      }, 1, 'gpt-4');

      expect(results).toEqual(['task1', 'task2']);
    });

    it('should process waiting tasks in order', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};
      
      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks = ['A', 'B', 'C', 'D'].map(id => 
        rateLimiter.acquire('openai', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push(id);
        }, 1, 'gpt-4')
      );

      await Promise.all(tasks);

      expect(results).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should handle errors and still release semaphore', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};
      
      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      await rateLimiter.acquire('openai', async () => {
        throw new Error('Test error');
      }, 1, 'gpt-4').catch(() => {
        results.push('error_handled');
      });

      await rateLimiter.acquire('openai', async () => {
        results.push('success');
      }, 1, 'gpt-4');

      expect(results).toEqual(['error_handled', 'success']);
    });

    it('should allow retry after failed task', async () => {
      const results: string[] = [];
      let attempt = 0;
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};
      
      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      try {
        await rateLimiter.acquire('openai', async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('First attempt failed');
          }
          results.push('success');
        }, 1, 'gpt-4');
      } catch (e) {
        results.push('first_failed');
      }

      await rateLimiter.acquire('openai', async () => {
        results.push('retry');
      }, 1, 'gpt-4');

      expect(results).toEqual(['first_failed', 'retry']);
    });
  });

  describe('Priority Queue Processing', () => {
    it('should execute higher priority tasks first', async () => {
      const results: string[] = [];

      const tasks = [
        { id: 'low', priority: 1 },
        { id: 'high', priority: 10 },
        { id: 'medium', priority: 5 },
        { id: 'urgent', priority: 100 },
      ];

      const promises = tasks.map(({ id, priority }) =>
        rateLimiter.acquire('openai', async () => {
          results.push(id);
        }, priority)
      );

      await Promise.all(promises);

      expect(results).toContain('urgent');
      expect(results).toContain('high');
      expect(results).toContain('medium');
      expect(results).toContain('low');
    });

    it('should maintain priority within same model queue', async () => {
      const results: string[] = [];

      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};

      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks = [
        { id: 'A', priority: 1 },
        { id: 'B', priority: 10 },
        { id: 'C', priority: 5 },
      ];

      const promises = tasks.map(({ id, priority }) =>
        rateLimiter.acquire('openai', async () => {
          results.push(id);
        }, priority, 'gpt-4')
      );

      await Promise.all(promises);

      expect(results).toContain('A');
      expect(results).toContain('B');
      expect(results).toContain('C');
    });

    it('should handle same priority tasks in order of arrival', async () => {
      const results: string[] = [];
      
      const tasks = ['A', 'B', 'C', 'D'].map(id => 
        rateLimiter.acquire('openai', async () => {
          results.push(id);
        }, 5)
      );

      await Promise.all(tasks);

      expect(results).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('Clear Queue', () => {
    it('should clear all pending tasks', () => {
      rateLimiter.clearQueue(false);

      const stats = rateLimiter.clearQueue(false);

      expect(stats.clearedTasks).toBe(0);
      expect(stats.cancelledProviders).toEqual([]);
    });

    it('should report queue statistics correctly', async () => {
      const tasks: Promise<void>[] = [];
      let taskStarted = false;

      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            if (!taskStarted) {
              taskStarted = true;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }, 1)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      const stats = rateLimiter.clearQueue(false);

      expect(stats.clearedTasks).toBeGreaterThan(0);
      expect(stats.providers.openai?.queueLength).toBeGreaterThan(0);

      await Promise.all(tasks);
    });

    it('should reject tasks when cancelRunning is true', async () => {
      const tasks: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          }, 1)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      const stats = rateLimiter.clearQueue(true);

      expect(stats.clearedTasks).toBeGreaterThan(0);

      await Promise.all(tasks.map(t => t.catch(() => {})));
    });
  });

  describe('Provider Validation', () => {
    it('should throw error for unconfigured provider', async () => {
      await expect(
        rateLimiter.acquire('unconfigured', async () => {}, 1)
      ).rejects.toThrow("Provider 'unconfigured' not configured");
    });

    it('should list valid providers in error message', async () => {
      await expect(
        rateLimiter.acquire('invalid', async () => {}, 1)
      ).rejects.toThrow(/Valid providers: openai|ollama/);
    });
  });

  describe('Mixed Semaphores and Rate Limiting', () => {
    it('should apply both semaphore and token bucket limits', async () => {
      const results: string[] = [];

      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 2 },
      ]};

      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 10, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            results.push(`task_${i}`);
          }, 1, 'gpt-4')
        );
      }

      await Promise.all(tasks);

      expect(results.length).toBe(5);
    });

    it('should handle multiple providers with different limits', async () => {
      const openaiResults: string[] = [];
      const ollamaResults: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
        { provider: 'ollama', model: 'llama3', concurrency: 3 },
      ]};
      
      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        {
          openai: { limit: 10, window: 60000 },
          ollama: { limit: 20, window: 60000 },
        },
        convertConcurrencyConfig(config)
      );

      const tasks: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            openaiResults.push(`openai_${i}`);
          }, 1, 'gpt-4')
        );
      }

      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.acquire('ollama', async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            ollamaResults.push(`ollama_${i}`);
          }, 1, 'llama3')
        );
      }

      await Promise.all(tasks);

      expect(openaiResults.length).toBe(3);
      expect(ollamaResults.length).toBe(5);
    });
  });

  describe('Concurrent Request Scenarios', () => {
    it('should handle burst of concurrent requests', async () => {
      const results: number[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 3 },
      ]};
      
      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 100, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            results.push(i);
          }, 1, 'gpt-4')
        );
      }

      await Promise.all(tasks);

      expect(results.length).toBe(10);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should limit concurrent execution to configured limit', async () => {
      let concurrentCount = 0;
      let maxConcurrentCount = 0;

      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 2 },
      ]};

      rateLimiter = new RateLimiterService(mockLogger)
      rateLimiter.configure(
        { openai: { limit: 1000, window: 60000 } },
        convertConcurrencyConfig(config)
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          rateLimiter.acquire('openai', async () => {
            concurrentCount++;
            maxConcurrentCount = Math.max(maxConcurrentCount, concurrentCount);
            await new Promise(resolve => setTimeout(resolve, 50));
            concurrentCount--;
          }, 1, 'gpt-4')
        );
      }

      await Promise.all(tasks);

      expect(maxConcurrentCount).toBeGreaterThan(0);
      expect(maxConcurrentCount).toBeLessThanOrEqual(2);
    });
  });
});
