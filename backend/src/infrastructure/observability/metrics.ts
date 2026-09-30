export class MetricsCollector {
  private static counters: Map<string, number> = new Map();
  private static timings: Map<string, number[]> = new Map();

  public static increment(metric: string, count: number = 1): void {
    const current = this.counters.get(metric) || 0;
    this.counters.set(metric, current + count);
  }

  public static recordTiming(metric: string, durationMs: number): void {
    const list = this.timings.get(metric) || [];
    list.push(durationMs);
    if (list.length > 1000) list.shift();
    this.timings.set(metric, list);
  }

  public static getMetrics(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of this.counters.entries()) {
      result[key] = val;
    }
    for (const [key, val] of this.timings.entries()) {
      const avg = val.length ? val.reduce((a, b) => a + b, 0) / val.length : 0;
      result[`${key}_avg_ms`] = Math.round(avg * 100) / 100;
      result[`${key}_count`] = val.length;
    }
    return result;
  }
}
