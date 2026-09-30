export interface SecretMetadata {
  key: string;
  version: number;
  value: string;
  rotationTimestamp: Date;
  expiresAt?: Date;
  isRevoked: boolean;
}

export class SecretsManager {
  private static dynamicSecrets: Map<string, SecretMetadata[]> = new Map();

  public static getSecret(key: string, defaultValue?: string): string {
    // 1. Check dynamic secrets store first (supports live rotation without restart)
    const list = this.dynamicSecrets.get(key);
    if (list && list.length > 0) {
      const active = list
        .filter(s => !s.isRevoked && (!s.expiresAt || s.expiresAt.getTime() > Date.now()))
        .sort((a, b) => b.version - a.version)[0];
      if (active) return active.value;
    }

    // 2. Check process.env
    const val = process.env[key];
    if (val !== undefined && val !== '') {
      return val;
    }

    // 3. Fallback default
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`SEC-001: Missing required secret configuration: '${key}'`);
  }

  /**
   * Dynamically rotate secret without application restart
   */
  public static rotateSecret(key: string, newValue: string, ttlSeconds?: number): SecretMetadata {
    const list = this.dynamicSecrets.get(key) || [];
    const nextVersion = list.length + 1;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined;

    const metadata: SecretMetadata = {
      key,
      version: nextVersion,
      value: newValue,
      rotationTimestamp: new Date(),
      expiresAt,
      isRevoked: false
    };

    list.push(metadata);
    this.dynamicSecrets.set(key, list);
    return metadata;
  }

  /**
   * Revoke a specific secret version
   */
  public static revokeSecret(key: string, version: number): void {
    const list = this.dynamicSecrets.get(key);
    if (list) {
      const found = list.find(s => s.version === version);
      if (found) found.isRevoked = true;
    }
  }

  /**
   * Get all active secret versions
   */
  public static getSecretMetadata(key: string): SecretMetadata[] {
    return this.dynamicSecrets.get(key) || [];
  }
}
