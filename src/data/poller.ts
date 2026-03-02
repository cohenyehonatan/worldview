/**
 * Generic polling manager that fetches data at regular intervals.
 */
export class Poller<T> {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastData: T | null = null;
  private fetchFn: () => Promise<T>;
  private onData: (data: T) => void;
  private intervalMs: number;

  constructor(
    fetchFn: () => Promise<T>,
    onData: (data: T) => void,
    intervalMs: number = 5000
  ) {
    this.fetchFn = fetchFn;
    this.onData = onData;
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    // Fetch immediately on start
    await this.poll();
    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getLastData(): T | null {
    return this.lastData;
  }

  private async poll(): Promise<void> {
    try {
      const data = await this.fetchFn();
      this.lastData = data;
      this.onData(data);
    } catch (err) {
      console.warn('[Poller] fetch failed:', err);
    }
  }
}
