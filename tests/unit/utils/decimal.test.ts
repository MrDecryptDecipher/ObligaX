import { SafeDecimal } from '@/utils/decimal';

describe('SafeDecimal', () => {
  test('avoids IEEE-754 binary floating-point representation bugs', () => {
    // In IEEE-754: 0.1 + 0.2 === 0.30000000000000004
    const sum = SafeDecimal.add('0.1', '0.2');
    expect(sum.toString()).toBe('0.3');
  });

  test('handles large institutional currency amounts with 10 decimal precision', () => {
    const a = '999999999999999999.1234567891';
    const b = '0.0000000009';
    const sum = SafeDecimal.add(a, b);
    expect(sum.toString()).toBe('999999999999999999.12345679');
  });

  test('prevents division by zero with institutional error code', () => {
    expect(() => SafeDecimal.divide('100', '0')).toThrow(/Division by zero is not permitted/);
  });

  test('performs comparisons correctly', () => {
    expect(SafeDecimal.gt('100.01', '100.00')).toBe(true);
    expect(SafeDecimal.gte('100.00', '100.00')).toBe(true);
    expect(SafeDecimal.lt('50', '51')).toBe(true);
    expect(SafeDecimal.lte('50', '50')).toBe(true);
    expect(SafeDecimal.eq('100.0000', '100')).toBe(true);
  });
});
