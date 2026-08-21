import 'dotenv/config';
import { dbService } from '../layers/database/db.js';

async function enableVector() {
  await dbService.connect();
  await dbService.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('[Vector] Extension enabled successfully!');
  await dbService.disconnect();
}

enableVector().catch(console.error);
