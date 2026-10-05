import { randomUUID } from 'node:crypto';

// Only explicitly selected metadata belongs here. Never pass request URLs,
// headers, tokens, upstream bodies, or arbitrary Error messages to the logger.
type Metadata = { reason?: string; status?: number; serverTime?: number; expiresAt?: number; remainingSeconds?: number };

export class PortalAuthError extends Error {
  constructor(public readonly code: string, public readonly details: Metadata = {}) {
    super(code);
  }
}

export function portalDiagnostics(flow: 'launch' | 'api' | 'session' | 'proxy') {
  const enabled = process.env.PORTAL_DEBUG === 'true';
  const requestId = randomUUID();
  return {
    log(stage: string, metadata: Metadata = {}) {
      if (enabled) console.info('[portal]', JSON.stringify({ requestId, flow, stage, ...metadata }));
    },
    failure(stage: string, error: unknown) {
      this.log(stage, error instanceof PortalAuthError
        ? { reason: error.code, ...error.details }
        : { reason: 'UNEXPECTED_ERROR' });
    },
    respond<T extends Response>(response: T): T {
      if (enabled) response.headers.set('x-portal-debug-id', requestId);
      return response;
    },
  };
}
