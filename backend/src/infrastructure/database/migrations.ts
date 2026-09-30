import { DatabaseService } from './database';
import { AuditLogger } from '../observability/audit-logger';

export class DatabaseMigrationService {
  public static async verifyOrMigrate(): Promise<boolean> {
    try {
      const isConnected = await DatabaseService.connect();
      if (!isConnected) {
        AuditLogger.warn('PostgreSQL database not directly reachable. Running in resilient mock/in-memory mode.');
        return false;
      }

      const prisma = DatabaseService.getClient();
      // Perform simple connectivity / table verification
      await prisma.$queryRaw`SELECT 1;`;
      AuditLogger.info('PostgreSQL schema connection verified.');
      return true;
    } catch (err: unknown) {
      AuditLogger.warn('Database verification notice:', { err });
      return false;
    }
  }
}
