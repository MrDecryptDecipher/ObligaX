export class DateUtils {
  /**
   * Parse an ISO date or Date object into a valid Date, throwing if invalid
   */
  public static parse(input: string | Date): Date {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) {
      throw new Error(`DATE-001: Invalid date string format: '${String(input)}'. Expected ISO-8601.`);
    }
    return d;
  }

  /**
   * Format as ISO YYYY-MM-DD
   */
  public static toDateOnlyString(input: string | Date): string {
    const d = DateUtils.parse(input);
    return d.toISOString().split('T')[0]!;
  }

  /**
   * Ensure dueDate >= createdDate
   */
  public static validateDueAfterCreated(createdDate: string | Date, dueDate: string | Date): boolean {
    const created = DateUtils.parse(createdDate);
    const due = DateUtils.parse(dueDate);
    return due.getTime() >= created.getTime();
  }

  /**
   * Get current UTC timestamp
   */
  public static nowUtc(): Date {
    return new Date();
  }
}
