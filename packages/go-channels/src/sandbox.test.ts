import { newChannel, go, select, close, range } from "./core";

const tick = async (timeoutCounts = 5) => {
  for (let i = 0; i < timeoutCounts; i++) {
    await new Promise((resolve) => setTimeout(resolve));
  }
};

const msgFactory = <Data = string>(): Array<{
  value: Data | undefined;
  done: boolean;
}> => [];

describe("sandbox", () => {
  it("cannot yield on close", async () => {
    const ch = newChannel();

    // @ts-expect-error Generator error
    go(function* () {
      yield close(ch);
    });

    await tick();
  });

  it("basic usage works", async () => {
    const ch = newChannel();
    const msg = msgFactory();

    go(function* () {
      yield ch.put("hello");
      yield ch.put("world");
      close(ch);
    });

    go(function* () {
      const msg1 = yield ch.take();
      msg.push(msg1);
      const msg2 = yield ch.take();
      msg.push(msg2);
      const msg3 = yield ch.take();
      msg.push(msg3);
    });

    await tick();

    expect(msg).toEqual([
      { value: "hello", done: false },
      { value: "world", done: false },
      { value: undefined, done: true },
    ]);
  });

  it("select example works", async () => {
    const ch1 = newChannel();
    const ch2 = newChannel();
    const msg = msgFactory();

    go(function* () {
      yield ch1.put("hello");
    });

    go(function* () {
      yield ch2.put("world");
    });

    go(function* () {
      for (;;) {
        const [msg1, msg2] = yield select(ch1, ch2);
        if (msg1) {
          msg.push(msg1);
        }
        if (msg2) {
          msg.push(msg2);
        }
      }
    });

    await tick();

    expect(msg).toEqual([
      { value: "hello", done: false },
      { value: "world", done: false },
    ]);
  });

  it("range example works", async () => {
    const ch = newChannel<number>();
    const msg: number[] = [];

    go(function* () {
      for (let i = 1; i < 10; i++) {
        yield ch.put(i);
      }
    });

    range(ch).forEach((value) => {
      msg.push(value);

      if (value === 5) {
        // return false to stop receiving messages
        return false;
      }
    });

    await tick();
    expect(msg).toEqual([1, 2, 3, 4, 5]);
  });
});
