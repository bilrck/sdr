import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

// Define a Prisma client wrapper that can check if it's connected
export class DatabaseService {
  private static instance: DatabaseService;
  public prisma!: PrismaClient;
  private isConnected: boolean = false;

  private constructor() {
    this.prisma = new PrismaClient({
      log: ['error'],
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    try {
      // Simple query to verify connection
      await this.prisma.$queryRaw`SELECT 1`;
      this.isConnected = true;
      console.log('[Database] Connected to PostgreSQL database successfully.');
      return true;
    } catch (error) {
      this.isConnected = false;
      console.warn('[Database] Failed to connect to PostgreSQL. Using memory fallback mode.');
      return false;
    }
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    this.isConnected = false;
  }
}

export const dbService = DatabaseService.getInstance();
