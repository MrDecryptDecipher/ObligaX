export class SecretsManager {
  public static getSecret(key: string, defaultValue?: string): string {
    const val = process.env[key];
    if (val !== undefined && val !== '') {
      return val;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`SEC-001: Missing required secret configuration: '${key}'`);
  }
}
