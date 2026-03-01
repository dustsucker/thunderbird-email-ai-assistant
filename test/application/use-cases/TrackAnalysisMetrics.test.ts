import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TrackAnalysisMetrics } from '../../../src/application/use-cases/TrackAnalysisMetrics';
import { MetricsRepository } from '../../../src/infrastructure/storage/MetricsRepository';
import type { ILogger } from '@/infrastructure/interfaces/ILogger';
import type { IClock } from '@/domain/interfaces/IClock';

// Mock messenger.storage.local
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('messenger', {
  storage: {
    local: {
      get: vi.fn((key?: string | string[] | Record<string, unknown>) => {
        if (key === undefined) return Promise.resolve({ ...mockStorage });
        if (typeof key === 'string') return Promise.resolve({ [key]: mockStorage[key] });
        if (Array.isArray(key)) {
          const result: Record<string, unknown> = {};
          key.forEach((k) => {
            if (mockStorage[k] !== undefined) result[k] = mockStorage[k];
          });
          return Promise.resolve(result);
        }
        return Promise.resolve({});
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

describe('TrackAnalysisMetrics', () => {
  let useCase: TrackAnalysisMetrics;
  let mockLogger: ILogger;
  let mockClock: IClock;
  let mockRandom: {
    uuid: Mock<() => string>;
    randomInt: Mock<(min: number, max: number) => number>;
  };
  let metricsRepository: MetricsRepository;
  let currentTime: number;

  beforeEach(() => {
    // Clear storage
    Object.keys(mockStorage).forEach((key) => {
      delete mockStorage[key];
    });

    currentTime = 100000;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      maskApiKey: vi.fn((key: string) => key.slice(0, 4) + '***'),
    };

    mockClock = {
      now: vi.fn(() => currentTime),
      currentDate: vi.fn(() => new Date(currentTime)),
    };

    mockRandom = {
      uuid: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 9)),
      randomInt: vi.fn((min, max) => Math.floor(Math.random() * (max - min + 1)) + min),
    };

    metricsRepository = new MetricsRepository(mockLogger, mockClock, mockRandom);
    useCase = new TrackAnalysisMetrics(mockLogger, mockClock, metricsRepository);
  });

  describe('startTracking', () => {
    it('should return a completion function', () => {
      const complete = useCase.startTracking('msg-1', 'openai', 'gpt-4');
      expect(typeof complete).toBe('function');
    });

    it('should log debug message when tracking starts', () => {
      useCase.startTracking('msg-1', 'openai', 'gpt-4');
      expect(mockLogger.debug).toHaveBeenCalledWith('Started tracking analysis', {
        messageId: 'msg-1',
        provider: 'openai',
        model: 'gpt-4',
      });
    });

    it('should record metric on successful completion', async () => {
      vi.mocked(mockRandom.uuid).mockReturnValue('metric-123');

      const complete = useCase.startTracking('msg-1', 'openai', 'gpt-4');

      // Simulate time passing
      currentTime = 101500;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);

      await complete(true, { input: 100, output: 50 });

      const metrics = await metricsRepository.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        id: 'metric-123',
        messageId: 'msg-1',
        provider: 'openai',
        model: 'gpt-4',
        startTime: 100000,
        endTime: 101500,
        duration: 1500,
        success: true,
        inputTokens: 100,
        outputTokens: 50,
      });
      expect(metrics[0].estimatedCost).toBeCloseTo(0.006, 4); // GPT-4 rates
    });

    it('should record metric on failed completion', async () => {
      vi.mocked(mockRandom.uuid).mockReturnValue('metric-456');

      const complete = useCase.startTracking('msg-2', 'claude', 'claude-3-opus');

      currentTime = 102000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);

      await complete(false, undefined, 'API timeout');

      const metrics = await metricsRepository.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        messageId: 'msg-2',
        provider: 'claude',
        model: 'claude-3-opus',
        duration: 2000,
        success: false,
        errorMessage: 'API timeout',
      });
      expect(metrics[0].inputTokens).toBeUndefined();
      expect(metrics[0].outputTokens).toBeUndefined();
      expect(metrics[0].estimatedCost).toBeUndefined();
    });

    it('should calculate cost based on provider and model', async () => {
      const complete = useCase.startTracking('msg-1', 'openai', 'gpt-4');

      currentTime = 101000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);

      await complete(true, { input: 1000, output: 500 });

      const metrics = await metricsRepository.getMetrics();
      // GPT-4: $0.03/1K input, $0.06/1K output
      // Cost: (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
      expect(metrics[0].estimatedCost).toBeCloseTo(0.06, 4);
    });

    it('should handle missing token information gracefully', async () => {
      const complete = useCase.startTracking('msg-1', 'ollama', 'llama3');

      currentTime = 101000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);

      await complete(true); // No token info

      const metrics = await metricsRepository.getMetrics();
      expect(metrics[0].inputTokens).toBeUndefined();
      expect(metrics[0].outputTokens).toBeUndefined();
      expect(metrics[0].estimatedCost).toBeUndefined();
    });

    it('should not throw if metric recording fails', async () => {
      // Make storage.set throw
      const errorSpy = vi.fn();
      vi.mocked(messenger.storage.local.set).mockRejectedValueOnce(new Error('Storage error'));

      mockLogger = {
        ...mockLogger,
        warn: errorSpy,
      };

      metricsRepository = new MetricsRepository(mockLogger, mockClock, mockRandom);
      useCase = new TrackAnalysisMetrics(mockLogger, mockClock, metricsRepository);

      const complete = useCase.startTracking('msg-1', 'openai', 'gpt-4');

      currentTime = 101000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);

      // Should not throw
      await expect(complete(true, { input: 100, output: 50 })).resolves.not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should return aggregated metrics for specified period', async () => {
      vi.mocked(mockRandom.uuid).mockReturnValue('metric-1');

      await metricsRepository.recordMetric({
        messageId: 'msg-1',
        provider: 'openai',
        model: 'gpt-4',
        startTime: currentTime - 1000,
        endTime: currentTime,
        duration: 1000,
        success: true,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.006,
      });

      const result = await useCase.getMetrics('hour');

      expect(result.period).toBe('hour');
      expect(result.totalAnalyses).toBe(1);
      expect(result.successfulAnalyses).toBe(1);
    });

    it('should default to day period', async () => {
      const result = await useCase.getMetrics();
      expect(result.period).toBe('day');
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', async () => {
      vi.mocked(mockRandom.uuid).mockReturnValue('metric-1');

      await metricsRepository.recordMetric({
        messageId: 'msg-1',
        provider: 'openai',
        model: 'gpt-4',
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        success: true,
      });

      await useCase.clearMetrics();

      const metrics = await metricsRepository.getMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('integration', () => {
    it('should track multiple analyses and aggregate correctly', async () => {
      vi.mocked(mockRandom.uuid)
        .mockReturnValueOnce('metric-1')
        .mockReturnValueOnce('metric-2')
        .mockReturnValueOnce('metric-3');

      // Track first analysis
      const complete1 = useCase.startTracking('msg-1', 'openai', 'gpt-4');
      currentTime = 101000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);
      await complete1(true, { input: 100, output: 50 });

      // Track second analysis
      currentTime = 102000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);
      const complete2 = useCase.startTracking('msg-2', 'claude', 'claude-3-sonnet');
      currentTime = 105000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);
      await complete2(true, { input: 200, output: 100 });

      // Track failed analysis
      currentTime = 106000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);
      const complete3 = useCase.startTracking('msg-3', 'openai', 'gpt-4');
      currentTime = 107000;
      vi.mocked(mockClock.now).mockReturnValue(currentTime);
      await complete3(false, undefined, 'Rate limit exceeded');

      // Get aggregated metrics
      const aggregated = await useCase.getMetrics('day');

      expect(aggregated.totalAnalyses).toBe(3);
      expect(aggregated.successfulAnalyses).toBe(2);
      expect(aggregated.failedAnalyses).toBe(1);
      expect(aggregated.totalInputTokens).toBe(300);
      expect(aggregated.totalOutputTokens).toBe(150);

      // Check provider breakdown
      expect(aggregated.byProvider['openai'].count).toBe(2);
      expect(aggregated.byProvider['openai'].successRate).toBe(0.5);
      expect(aggregated.byProvider['claude'].count).toBe(1);
      expect(aggregated.byProvider['claude'].successRate).toBe(1);
    });
  });
});
