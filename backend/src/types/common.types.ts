export interface RequestContext {
  traceId: string;
  actor: string;
  roles: string[];
  partyId: string;
  tenantId?: string;
  organizationId?: string;
  capabilities?: string[];
  allowedActAs?: string[];
  ipAddress?: string;
  idempotencyKey?: string;
}

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    traceId: string;
    timestamp: string;
    [key: string]: unknown;
  };
}
