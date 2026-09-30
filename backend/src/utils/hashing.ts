import * as crypto from 'crypto';

export class HashingUtils {
  /**
   * Deterministically sort object keys recursively for canonical JSON representation
   */
  public static canonicalizeJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map(item => HashingUtils.canonicalizeJson(item)).join(',') + ']';
    }

    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const parts = sortedKeys.map(key => {
      const val = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${HashingUtils.canonicalizeJson(val)}`;
    });

    return '{' + parts.join(',') + '}';
  }

  /**
   * Compute SHA-256 hash of a string or canonicalized payload
   */
  public static sha256(data: string | unknown): string {
    const text = typeof data === 'string' ? data : HashingUtils.canonicalizeJson(data);
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Secure timing-safe string comparison
   */
  public static timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
