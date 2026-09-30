import { Request, Response } from 'express';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { DatabaseService } from '../../infrastructure/database/database';
import { MetricsCollector } from '../../infrastructure/observability/metrics';

export class HealthController {
  constructor(private readonly cantonClient: CantonClient) {}

  public check = async (req: Request, res: Response): Promise<void> => {
    const cantonHealth = await this.cantonClient.healthCheck();
    const dbConnected = DatabaseService.connected;

    const isHealthy = cantonHealth.connected;

    const status = {
      status: isHealthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        cantonLedger: cantonHealth,
        database: {
          connected: dbConnected,
          driver: 'postgresql'
        }
      },
      metrics: MetricsCollector.getMetrics()
    };

    res.status(isHealthy ? 200 : 503).json(status);
  };
}
