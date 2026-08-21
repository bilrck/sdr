import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'sdr-saas-intelligence-secret-2026';
const JWT_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
}

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  public async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public generateToken(userId: string, email: string, name: string): string {
    const secret = process.env.JWT_SECRET || 'sdr-saas-intelligence-super-secret-key-2026-prod-scale';
    return jwt.sign({ userId, email, name }, secret, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  public verifyToken(token: string): JWTPayload | null {
    try {
      const secret = process.env.JWT_SECRET || 'sdr-saas-intelligence-super-secret-key-2026-prod-scale';
      return jwt.verify(token, secret) as JWTPayload;
    } catch {
      return null;
    }
  }

  public extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}

export const authService = AuthService.getInstance();
