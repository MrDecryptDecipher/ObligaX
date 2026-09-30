import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../types/errors.types';

export interface TokenPayload {
  sub: string;
  party: string;
  roles: string[];
  aud?: string;
  iss?: string;
  exp?: number;
}

export class TokenVerifier {
  private static secret = process.env.JWT_SECRET || 'super-secret-development-jwt-key-min-32-chars-obligax';

  public static verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload;
      return decoded;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new UnauthorizedError(`Invalid authentication token: ${msg}`);
    }
  }

  public static sign(payload: Omit<TokenPayload, 'exp'>, expiresIn: string = '24h'): string {
    return jwt.sign(payload, this.secret, { expiresIn } as jwt.SignOptions);
  }
}
