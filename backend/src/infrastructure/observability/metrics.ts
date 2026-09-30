import client from 'prom-client';

// Standard Prometheus registry
export const register = new client.Registry();

// Default system metrics (CPU, memory, event loop lag)
client.collectDefaultMetrics({ register, prefix: 'obligax_' });

// SLO & Performance Metrics
export const httpRequestDuration = new client.Histogram({
  name: 'obligax_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

export const commandAcceptanceDuration = new client.Histogram({
  name: 'obligax_command_acceptance_duration_seconds',
  help: 'Latency from command submission to Canton acceptance',
  labelNames: ['operation', 'party'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const projectionLagGauge = new client.Gauge({
  name: 'obligax_projection_lag_seconds',
  help: 'Lag in seconds between Canton transaction effective time and PostgreSQL projection write',
  labelNames: ['subscriber'],
  registers: [register]
});

export const cantonSubmissionCounter = new client.Counter({
  name: 'obligax_canton_submission_total',
  help: 'Total Canton command submissions',
  labelNames: ['template', 'status'],
  registers: [register]
});

export const settlementCompletionCounter = new client.Counter({
  name: 'obligax_settlement_completion_total',
  help: 'Total external rail settlement results',
  labelNames: ['rail', 'status'],
  registers: [register]
});

export const reconciliationDiscrepancyCounter = new client.Counter({
  name: 'obligax_reconciliation_discrepancy_total',
  help: 'Total discrepancies detected across ledger, DB, and settlement rails',
  labelNames: ['discrepancy_type'],
  registers: [register]
});

export const activeObligationsGauge = new client.Gauge({
  name: 'obligax_active_obligations_total',
  help: 'Count of active active obligations in system by status',
  labelNames: ['status'],
  registers: [register]
});

export class MetricsCollector {
  public static increment(metric: string, count = 1): void {
    if (metric.includes('settlement_completed')) settlementCompletionCounter.inc({ rail: 'RTGS', status: 'COMPLETED' }, count);
    if (metric.includes('settlement_failed')) settlementCompletionCounter.inc({ rail: 'RTGS', status: 'FAILED' }, count);
    if (metric.includes('canton_submit_success')) cantonSubmissionCounter.inc({ template: 'Obligation', status: 'SUCCESS' }, count);
    if (metric.includes('canton_submit_failed')) cantonSubmissionCounter.inc({ template: 'Obligation', status: 'FAILED' }, count);
  }

  public static recordTiming(metric: string, durationMs: number): void {
    const sec = durationMs / 1000;
    if (metric.includes('command')) {
      commandAcceptanceDuration.observe({ operation: 'submit', party: 'operator' }, sec);
    }
  }

  public static async getMetricsString(): Promise<string> {
    return register.metrics();
  }

  public static async getMetrics(): Promise<Record<string, unknown>> {
    const json = await register.getMetricsAsJSON();
    return { metrics: json };
  }
}
