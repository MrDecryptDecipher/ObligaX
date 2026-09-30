import Decimal from 'decimal.js';

// Configure Decimal for institutional financial precision
Decimal.set({
  precision: 38,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -12,
  toExpPos: 38
});

export class SafeDecimal {
  /**
   * Parse a value into a Decimal, throwing a descriptive error if invalid
   */
  public static from(value: Decimal.Value | SafeDecimal): Decimal {
    if (value instanceof SafeDecimal) {
      return value.toDecimal();
    }
    try {
      return new Decimal(value);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`FIN-001: Invalid decimal value '${String(value)}': ${msg}`);
    }
  }

  /**
   * Add two amounts
   */
  public static add(a: Decimal.Value, b: Decimal.Value): Decimal {
    return SafeDecimal.from(a).plus(SafeDecimal.from(b));
  }

  /**
   * Subtract b from a
   */
  public static subtract(a: Decimal.Value, b: Decimal.Value): Decimal {
    return SafeDecimal.from(a).minus(SafeDecimal.from(b));
  }

  /**
   * Multiply two values
   */
  public static multiply(a: Decimal.Value, b: Decimal.Value): Decimal {
    return SafeDecimal.from(a).times(SafeDecimal.from(b));
  }

  /**
   * Divide a by b with non-zero check
   */
  public static divide(a: Decimal.Value, b: Decimal.Value): Decimal {
    const divisor = SafeDecimal.from(b);
    if (divisor.isZero()) {
      throw new Error('FIN-002: Division by zero is not permitted in financial calculations.');
    }
    return SafeDecimal.from(a).dividedBy(divisor);
  }

  /**
   * Absolute value
   */
  public static abs(a: Decimal.Value): Decimal {
    return SafeDecimal.from(a).abs();
  }

  /**
   * True if a > b
   */
  public static gt(a: Decimal.Value, b: Decimal.Value): boolean {
    return SafeDecimal.from(a).gt(SafeDecimal.from(b));
  }

  /**
   * True if a >= b
   */
  public static gte(a: Decimal.Value, b: Decimal.Value): boolean {
    return SafeDecimal.from(a).gte(SafeDecimal.from(b));
  }

  /**
   * True if a < b
   */
  public static lt(a: Decimal.Value, b: Decimal.Value): boolean {
    return SafeDecimal.from(a).lt(SafeDecimal.from(b));
  }

  /**
   * True if a <= b
   */
  public static lte(a: Decimal.Value, b: Decimal.Value): boolean {
    return SafeDecimal.from(a).lte(SafeDecimal.from(b));
  }

  /**
   * True if a == b
   */
  public static eq(a: Decimal.Value, b: Decimal.Value): boolean {
    return SafeDecimal.from(a).eq(SafeDecimal.from(b));
  }

  /**
   * Format decimal to fixed string for banking rails (e.g. 2 decimal places for USD, 4 for crypto/FX)
   */
  public static toFixed(a: Decimal.Value, decimalPlaces: number = 2): string {
    return SafeDecimal.from(a).toFixed(decimalPlaces);
  }

  /**
   * Institutional string representation preserving up to 10 decimal digits without exponent notation
   */
  public static toInstitutionalString(a: Decimal.Value): string {
    return SafeDecimal.from(a).toString();
  }

  private constructor(private readonly value: Decimal) {}

  public toDecimal(): Decimal {
    return this.value;
  }
}

export { Decimal };
