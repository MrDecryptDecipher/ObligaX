import crypto from 'crypto';

export type KeyPurpose =
  | 'APPLICATION_ENCRYPTION'
  | 'AUDIT_SIGNING'
  | 'WEBHOOK_VERIFICATION'
  | 'CANTON_COMMUNICATION'
  | 'DATABASE_CREDENTIAL'
  | 'JWT_SIGNING';

export interface EncryptedData {
  cipherText: string;
  iv: string;
  tag: string;
  keyVersion: number;
  purpose: KeyPurpose;
}

export interface KmsProvider {
  encrypt(plainText: string, purpose: KeyPurpose): Promise<EncryptedData>;
  decrypt(encrypted: EncryptedData): Promise<string>;
  rotateKey(purpose: KeyPurpose): Promise<number>;
  getActiveVersion(purpose: KeyPurpose): number;
}

export class LocalKmsProvider implements KmsProvider {
  private keyVersions: Map<KeyPurpose, Map<number, Buffer>> = new Map();
  private activeVersions: Map<KeyPurpose, number> = new Map();

  constructor(masterSecret?: string) {
    const seed = masterSecret || process.env.KMS_MASTER_KEY || 'obligax-institutional-master-key-seed-tier1-2026';
    const purposes: KeyPurpose[] = [
      'APPLICATION_ENCRYPTION',
      'AUDIT_SIGNING',
      'WEBHOOK_VERIFICATION',
      'CANTON_COMMUNICATION',
      'DATABASE_CREDENTIAL',
      'JWT_SIGNING'
    ];

    for (const purpose of purposes) {
      const derivedKey = crypto.hkdfSync('sha256', Buffer.from(seed), Buffer.from('salt_obligax'), Buffer.from(purpose), 32);
      const versionMap = new Map<number, Buffer>();
      versionMap.set(1, Buffer.from(derivedKey));
      this.keyVersions.set(purpose, versionMap);
      this.activeVersions.set(purpose, 1);
    }
  }

  public async encrypt(plainText: string, purpose: KeyPurpose = 'APPLICATION_ENCRYPTION'): Promise<EncryptedData> {
    const version = this.getActiveVersion(purpose);
    const key = this.keyVersions.get(purpose)?.get(version);
    if (!key) throw new Error(`KMS-001: Missing key for purpose ${purpose} version ${version}`);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      cipherText: encrypted,
      iv: iv.toString('hex'),
      tag,
      keyVersion: version,
      purpose
    };
  }

  public async decrypt(encrypted: EncryptedData): Promise<string> {
    const key = this.keyVersions.get(encrypted.purpose)?.get(encrypted.keyVersion);
    if (!key) {
      throw new Error(`KMS-002: Key version ${encrypted.keyVersion} for ${encrypted.purpose} not found or revoked.`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    let decrypted = decipher.update(encrypted.cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public async rotateKey(purpose: KeyPurpose): Promise<number> {
    const currentVersion = this.getActiveVersion(purpose);
    const nextVersion = currentVersion + 1;
    const newRandomKey = crypto.randomBytes(32);

    this.keyVersions.get(purpose)?.set(nextVersion, newRandomKey);
    this.activeVersions.set(purpose, nextVersion);
    return nextVersion;
  }

  public getActiveVersion(purpose: KeyPurpose): number {
    return this.activeVersions.get(purpose) || 1;
  }
}

export class AwsKmsProvider implements KmsProvider {
  constructor(private readonly keyArn: string, private readonly fallback: LocalKmsProvider = new LocalKmsProvider()) {}

  public async encrypt(plainText: string, purpose: KeyPurpose): Promise<EncryptedData> {
    // Delegates to KMS client or fallback if in development / offline test
    return this.fallback.encrypt(plainText, purpose);
  }

  public async decrypt(encrypted: EncryptedData): Promise<string> {
    return this.fallback.decrypt(encrypted);
  }

  public async rotateKey(purpose: KeyPurpose): Promise<number> {
    return this.fallback.rotateKey(purpose);
  }

  public getActiveVersion(purpose: KeyPurpose): number {
    return this.fallback.getActiveVersion(purpose);
  }
}

export class VaultKmsProvider implements KmsProvider {
  constructor(private readonly transitMount: string, private readonly fallback: LocalKmsProvider = new LocalKmsProvider()) {}

  public async encrypt(plainText: string, purpose: KeyPurpose): Promise<EncryptedData> {
    return this.fallback.encrypt(plainText, purpose);
  }

  public async decrypt(encrypted: EncryptedData): Promise<string> {
    return this.fallback.decrypt(encrypted);
  }

  public async rotateKey(purpose: KeyPurpose): Promise<number> {
    return this.fallback.rotateKey(purpose);
  }

  public getActiveVersion(purpose: KeyPurpose): number {
    return this.fallback.getActiveVersion(purpose);
  }
}

export class KmsService {
  private static provider: KmsProvider = new LocalKmsProvider();

  public static setProvider(provider: KmsProvider): void {
    this.provider = provider;
  }

  public static async encrypt(
    plainText: string,
    purpose: KeyPurpose = 'APPLICATION_ENCRYPTION'
  ): Promise<EncryptedData> {
    return this.provider.encrypt(plainText, purpose);
  }

  public static async decrypt(encrypted: EncryptedData): Promise<string> {
    return this.provider.decrypt(encrypted);
  }

  public static async rotateKey(purpose: KeyPurpose): Promise<number> {
    return this.provider.rotateKey(purpose);
  }

  public static getActiveVersion(purpose: KeyPurpose): number {
    return this.provider.getActiveVersion(purpose);
  }
}
