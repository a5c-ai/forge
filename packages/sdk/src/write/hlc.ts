export type HlcState = {
  wallMs: number;
  counter: number;
};

export type HlcTick = {
  state: HlcState;
  // A sortable string token. We use `<wallMs>-<counter>` as a simple baseline.
  token: string;
};

export class HlcClock {
  constructor(private state: HlcState = { wallMs: 0, counter: 0 }) {}

  now(): HlcState {
    return { ...this.state };
  }

  tick(nowWallMs: number): HlcTick {
    if (nowWallMs > this.state.wallMs) {
      this.state = { wallMs: nowWallMs, counter: 0 };
    } else if (nowWallMs === this.state.wallMs) {
      this.state = { wallMs: this.state.wallMs, counter: this.state.counter + 1 };
    } else {
      // Clock went backwards; stay monotonic by incrementing counter on last wallMs.
      this.state = { wallMs: this.state.wallMs, counter: this.state.counter + 1 };
    }
    const token = `${this.state.wallMs}-${String(this.state.counter).padStart(4, "0")}`;
    return { state: this.now(), token };
  }
}


