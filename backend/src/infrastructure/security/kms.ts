import crypto from 'crypto';

export class KmsService {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly masterKey = crypto.scryptSync(
    process.env.KMS_SECRET || 'obligax-institutional-master-key-seed-2026',
    'salt',
    32
  );

  public static encrypt(plainText: string): { cipherText: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return {
      cipherText: encrypted,
      iv: iv.toString('hex'),
      tag
    };
  }

  public static decrypt(cipherText: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
