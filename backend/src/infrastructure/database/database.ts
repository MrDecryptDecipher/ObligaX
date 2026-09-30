import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  private static instance: PrismaClient | null = null;
  private static isConnected = false;

  public static getClient(): PrismaClient {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
      });
    }
    return DatabaseService.instance;
  }

  public static async connect(): Promise<boolean> {
    try {
      const client = DatabaseService.getClient();
      await client.$connect();
      DatabaseService.isConnected = true;
      return true;
    } catch (err: unknown) {
      DatabaseService.isConnected = false;
      // In development or unit testing without local postgres, allow repository in-memory fallback
      return false;
    }
  }

  public static async disconnect(): Promise<void> {
    if (DatabaseService.instance) {
      await DatabaseService.instance.$disconnect();
      DatabaseService.isConnected = false;
    }
  }

  public static get connected(): boolean {
    return DatabaseService.isConnected;
  }
}
