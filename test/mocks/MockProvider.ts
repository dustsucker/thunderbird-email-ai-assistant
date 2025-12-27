import {
  BaseProvider,
  BaseProviderSettings,
  RequestBody,
  TagResponse,
  HttpHeaders,
} from '../../providers/BaseProvider';
import { CustomTags } from '../../core/config';
import { StructuredEmailData } from '../../core/analysis';

export interface MockResponse {
  tags: string[];
  confidence: number;
  reasoning: string;
  [key: string]: unknown;
}

export class MockProvider extends BaseProvider {
  private mockResponse: MockResponse;
  private requestCount: number;
  private mockError: Error | null = null;
  private mockStatusCode: number | null = null;
  private simulateTimeout: boolean = false;
  private simulateMalformedJson: boolean = false;

  constructor(mockResponse: MockResponse = { tags: ['work'], confidence: 0.9, reasoning: 'Mock reasoning' }) {
    super();
    this.mockResponse = mockResponse;
    this.requestCount = 0;
  }

  protected getApiUrl(): string {
    return 'mock://api';
  }

  protected validateSettings(settings: BaseProviderSettings): boolean {
    return true;
  }

  protected buildRequestBody(
    settings: BaseProviderSettings,
    prompt: string,
    structuredData: StructuredEmailData,
    customTags: CustomTags
  ): RequestBody {
    return {};
  }

  protected getHeaders(settings: BaseProviderSettings): HttpHeaders {
    return {};
  }

  protected async executeRequest(
    settings: BaseProviderSettings,
    requestBody: RequestBody
  ): Promise<Response> {
    this.requestCount++;

    if (this.simulateTimeout) {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 100));
    }

    if (this.mockError) {
      throw this.mockError;
    }

    const statusCode = this.mockStatusCode ?? 200;

    if (this.simulateMalformedJson) {
      return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as unknown as Response;
    }

    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      json: async () => this.mockResponse,
    } as unknown as Response;
  }

  protected parseResponse(response: unknown): TagResponse {
    return this.mockResponse;
  }

  public setMockResponse(response: MockResponse): void {
    this.mockResponse = response;
  }

  public getRequestCount(): number {
    return this.requestCount;
  }

  public resetRequestCount(): void {
    this.requestCount = 0;
  }

  public setMockError(error: Error | string): void {
    this.mockError = error instanceof Error ? error : new Error(error);
  }

  public setMockErrorResponse(statusCode: number): void {
    this.mockStatusCode = statusCode;
  }

  public setMockTimeout(): void {
    this.simulateTimeout = true;
  }

  public setMockMalformedJson(): void {
    this.simulateMalformedJson = true;
  }

  public reset(): void {
    this.resetRequestCount();
    this.mockError = null;
    this.mockStatusCode = null;
    this.simulateTimeout = false;
    this.simulateMalformedJson = false;
  }
}
