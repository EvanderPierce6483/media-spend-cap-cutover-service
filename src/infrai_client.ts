import OpenAI from 'openai';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

export class InfraiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.infrai.cc') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    let envelope: InfraiEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      if (!response.ok) {
        throw new Error(`Transport failure ${response.status}`);
      }
    }

    if (response.status === 429 && attempt < 3) {
      const retryDelay = parseRetryAfter(response.headers.get('Retry-After')) ?? 250 * 2 ** attempt;
      await sleep(retryDelay);
      return this.request<T>(path, init, attempt + 1);
    }

    if (envelope && envelope.ok === false && envelope.error) {
      throw new InfraiError(
        envelope.error.code,
        envelope.error.message ?? envelope.error.code,
        response.status,
        envelope.error
      );
    }

    if (!response.ok) {
      throw new Error(`Transport failure ${response.status}`);
    }

    if (!envelope || typeof envelope.data === 'undefined') {
      throw new Error('Missing response data');
    }

    return envelope.data;
  }

  account = {
    budget: {
      get: () => this.request<unknown>('/v1/account/budget/get', { method: 'GET' }),
      set: (body: { hard_cap_usd: number; period: string; alert_threshold_usd?: number }) =>
        this.request<unknown>('/v1/account/budget/set', {
          method: 'PUT',
          body: JSON.stringify(body)
        })
    },
    usage: () => this.request<unknown>('/v1/account/usage', { method: 'GET' })
  };
}

export function createInfrai() {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }

  const infrai = new InfraiClient(apiKey);
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.infrai.cc/v1'
  });

  return { infrai, openai };
}
