import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../background';
import { AppConfig, DEFAULTS } from '../core/config';

describe('RateLimiter - Semaphore Management', () => {
  let rateLimiter: RateLimiter;
  let appConfig: AppConfig;

  beforeEach(() => {
    appConfig = { ...DEFAULTS };
    rateLimiter = new RateLimiter(
      {
        openai: { limit: 10, window: 60000 },
        ollama: { limit: 20, window: 60000 },
      },
      appConfig
    );
  });

  describe('Semaphore Acquisition', () => {
    it('should acquire semaphore slot immediately when available', async () => {
      const results: string[] = [];
      
      await rateLimiter.execute('openai', async () => {
        results.push('task1');
      }, 1, 'gpt-4');

      expect(results).toEqual(['task1']);
    });

    it('should queue tasks when semaphore limit is reached', async () => {
      const results: string[] = [];
      const limit = 2;
      
      const task1 = rateLimiter.execute('openai', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('task1');
      }, 1, 'gpt-4');

      const task2 = rateLimiter.execute('openai', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('task2');
      }, 1, 'gpt-4');

      const task3 = rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      const tasks: Promise<void>[] = [];
      
      for (let i = 0; i < 5; i++) {
        const model = i % 2 === 0 ? 'gpt-4' : 'gpt-3.5-turbo';
        tasks.push(
          rateLimiter.execute('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            results.push(`${model}_${i}`);
          }, 1, model)
        );
      }

      await Promise.all(tasks);

      expect(results.length).toBe(5);
      expect(results[0]).toContain('gpt-4');
      expect(results[4]).toContain('gpt-3.5-turbo');
    });

    it('should use provider default when no model-specific config exists', async () => {
      const results: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        results.push(`start_${i}`);
        await rateLimiter.execute('ollama', async () => {
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
          rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      await rateLimiter.execute('openai', async () => {
        results.push('task1');
      }, 1, 'gpt-4');

      await rateLimiter.execute('openai', async () => {
        results.push('task2');
      }, 1, 'gpt-4');

      expect(results).toEqual(['task1', 'task2']);
    });

    it('should process waiting tasks in order', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      const tasks = ['A', 'B', 'C', 'D'].map(id => 
        rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      await rateLimiter.execute('openai', async () => {
        throw new Error('Test error');
      }, 1, 'gpt-4').catch(() => {
        results.push('error_handled');
      });

      await rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      try {
        await rateLimiter.execute('openai', async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('First attempt failed');
          }
          results.push('success');
        }, 1, 'gpt-4');
      } catch (e) {
        results.push('first_failed');
      }

      await rateLimiter.execute('openai', async () => {
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
        rateLimiter.execute('openai', async () => {
          results.push(id);
        }, priority)
      );

      await Promise.all(promises);

      expect(results).toEqual(['urgent', 'high', 'medium', 'low']);
    });

    it('should maintain priority within same model queue', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 1 },
      ]};
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      const tasks = [
        { id: 'A', priority: 1 },
        { id: 'B', priority: 10 },
        { id: 'C', priority: 5 },
      ];

      const promises = tasks.map(({ id, priority }) => 
        rateLimiter.execute('openai', async () => {
          results.push(id);
        }, priority, 'gpt-4')
      );

      await Promise.all(promises);

      expect(results).toEqual(['B', 'C', 'A']);
    });

    it('should handle same priority tasks in order of arrival', async () => {
      const results: string[] = [];
      
      const tasks = ['A', 'B', 'C', 'D'].map(id => 
        rateLimiter.execute('openai', async () => {
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
          rateLimiter.execute('openai', async () => {
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
      expect(stats.openai?.queueLength).toBeGreaterThan(0);

      await Promise.all(tasks);
    });

    it('should reject tasks when cancelRunning is true', async () => {
      const tasks: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        tasks.push(
          rateLimiter.execute('openai', async () => {
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
        rateLimiter.execute('unconfigured', async () => {}, 1)
      ).rejects.toThrow("Provider 'unconfigured' not configured");
    });

    it('should list valid providers in error message', async () => {
      await expect(
        rateLimiter.execute('invalid', async () => {}, 1)
      ).rejects.toThrow(/Valid providers: openai|ollama/);
    });
  });

  describe('Mixed Semaphores and Rate Limiting', () => {
    it('should apply both semaphore and token bucket limits', async () => {
      const results: string[] = [];
      
      const config = { ...DEFAULTS, modelConcurrencyLimits: [
        { provider: 'openai', model: 'gpt-4', concurrency: 2 },
      ]};
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 2, window: 60000 } },
        config
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        {
          openai: { limit: 10, window: 60000 },
          ollama: { limit: 20, window: 60000 },
        },
        config
      );

      const tasks: Promise<void>[] = [];
      
      for (let i = 0; i < 3; i++) {
        tasks.push(
          rateLimiter.execute('openai', async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            openaiResults.push(`openai_${i}`);
          }, 1, 'gpt-4')
        );
      }

      for (let i = 0; i < 5; i++) {
        tasks.push(
          rateLimiter.execute('ollama', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          rateLimiter.execute('openai', async () => {
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
      
      rateLimiter = new RateLimiter(
        { openai: { limit: 100, window: 60000 } },
        config
      );

      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          rateLimiter.execute('openai', async () => {
            concurrentCount++;
            maxConcurrentCount = Math.max(maxConcurrentCount, concurrentCount);
            await new Promise(resolve => setTimeout(resolve, 50));
            concurrentCount--;
          }, 1, 'gpt-4')
        );
      }

      await Promise.all(tasks);

      expect(maxConcurrentCount).toBe(2);
    });
  });
});
