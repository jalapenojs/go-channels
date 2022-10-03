var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { newChannel, go, select, close, range } from "./index";
const tick = (timeoutCounts = 5) => __awaiter(void 0, void 0, void 0, function* () {
    for (let i = 0; i < timeoutCounts; i++) {
        yield new Promise((resolve) => setTimeout(resolve));
    }
});
beforeAll(() => {
    // console.debug = vitest.fn();
});
test("go needs a generator", () => {
    // @ts-ignore
    expect(() => go("25")).toThrowError(/Need a generator/i);
    expect(() => 
    // @ts-ignore
    go(function () {
        return 35;
    })).toThrowError(/Need an iterator/i);
});
// basic usage
// =====================================
test("basic go usage", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const ch = newChannel();
    go(function* () {
        yield ch.put("hello");
    });
    go(function* () {
        const { value: msg } = yield ch.take();
        expect(msg).toEqual("hello");
    });
    yield tick();
}));
test("go with multiple puts", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const ch = newChannel();
    go(function* () {
        yield ch.put("hello");
        yield ch.put("world");
    });
    go(function* () {
        const { value: msg1 } = yield ch.take();
        expect(msg1).toEqual("hello");
        const { value: msg2 } = yield ch.take();
        expect(msg2).toEqual("world");
    });
    yield tick();
}));
test("go with two channels", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const ch1 = newChannel();
    const ch2 = newChannel();
    go(function* () {
        yield ch1.put("hello");
    });
    go(function* () {
        yield ch2.put("world");
    });
    go(function* () {
        const { value: msg1 } = yield ch1.take();
        expect(msg1).toEqual("hello");
        const { value: msg2 } = yield ch2.take();
        expect(msg2).toEqual("world");
    });
    yield tick();
}));
test("go with multiple puts and delayed takes", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const ch = newChannel();
    go(function* () {
        yield ch.put("hello");
    });
    go(function* () {
        yield ch.put("world");
    });
    go(function* () {
        const { value: msg1 } = yield ch.take();
        expect(msg1).toEqual("hello");
    });
    go(function* () {
        const { value: msg2 } = yield ch.take();
        expect(msg2).toEqual("world");
    });
    yield tick();
}));
test("asyncPut works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const ch = newChannel();
    const ch2 = newChannel();
    ch.asyncPut("before");
    go(function* () {
        const { value: msg } = yield ch.take();
        expect(msg).toEqual("before");
    });
    go(function* () {
        const { value: msg } = yield ch2.take();
        expect(msg).toEqual("after");
    });
    ch2.asyncPut("after");
    yield tick();
}));
// putting on a pending consumer
// ===================================
test("putting a pending take works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const c1 = newChannel();
    go(function* () {
        const val = yield c1.take();
        expect(val).toEqual({ value: "hi", done: false });
    });
    go(function* () {
        yield c1.put("hi");
    });
    yield tick();
}));
test("put on a pending select works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const c1 = newChannel();
    go(function* () {
        const [val1] = yield select(c1);
        expect(typeof val1).not.toBe("undefined");
        expect(val1).toEqual({ value: "hi", done: false });
    });
    go(function* () {
        yield c1.put("hi");
    });
    yield tick();
}));
test("async putting a pending take works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const c1 = newChannel();
    go(function* () {
        const val = yield c1.take();
        expect(val).toEqual({ value: "hi", done: false });
    });
    c1.asyncPut("hi");
    yield tick();
}));
test("async put on a pending select works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const c1 = newChannel();
    go(function* () {
        const [val1] = yield select(c1);
        expect(typeof val1).not.toBe("undefined");
        expect(val1).toEqual({ value: "hi", done: false });
    });
    c1.asyncPut("hi");
    yield tick();
}));
// close
// ====================================
test("close should work", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(6);
    const chan = newChannel();
    go(function* () {
        const { value: val1, done: done1 } = yield chan.take();
        expect(done1).toEqual(false);
        expect(val1).toEqual("hi");
        const { value: val2, done: done2 } = yield chan.take();
        expect(done2).toEqual(false);
        expect(val2).toEqual("good");
        const { value: val3, done: done3 } = yield chan.take();
        expect(done3).toEqual(true);
        expect(val3).toEqual(undefined);
    });
    go(function* () {
        yield chan.put("hi");
        yield chan.put("good");
        close(chan);
    });
    yield tick();
}));
test("close should work with repl example", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const ch = newChannel();
    go(function* () {
        const { value, done } = yield ch.take();
        expect(value).toBeUndefined();
        expect(done).toBeTruthy();
    });
    setTimeout(() => close(ch), 0);
    yield tick();
}));
test("pending producers throw error on close", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const ch = newChannel();
    let err;
    go(function* () {
        try {
            yield ch.put("it's pending until someone takes");
        }
        catch (e) {
            err = e;
        }
        expect(err === null || err === void 0 ? void 0 : err.message).toMatch(/Cannot put on a closed channel/i);
    });
    close(ch);
    yield tick();
}));
test("closing twice throws an error", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const chan = newChannel();
    let err;
    go(function* () {
        try {
            yield close(chan);
            yield close(chan);
        }
        catch (e) {
            err = e;
        }
        finally {
            expect(err === null || err === void 0 ? void 0 : err.message).toMatch(/channel already closed/i);
        }
    });
    yield tick();
}));
test("putting on a closed channel throws an error", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const chan = newChannel();
    let err;
    close(chan);
    go(function* () {
        try {
            yield chan.put("something");
        }
        catch (e) {
            err = e;
        }
        finally {
            expect(err === null || err === void 0 ? void 0 : err.message).toMatch(/Cannot put on a closed channel/i);
        }
    });
    yield tick();
}));
test("async putting on a closed channel throws error", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const chan = newChannel();
    let err;
    close(chan);
    go(function* () {
        try {
            chan.asyncPut("something");
        }
        catch (e) {
            err = e;
        }
        finally {
            expect(err === null || err === void 0 ? void 0 : err.message).toMatch(/Cannot put on a closed channel/i);
        }
    });
    yield tick();
}));
test("async putting before channel closed is fine", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const chan = newChannel();
    expect(() => chan.asyncPut("something")).not.toThrowError(/closed channel/i);
    close(chan);
    yield tick();
}));
test("close works with select", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const c1 = newChannel();
    const c2 = newChannel();
    close(c1);
    go(function* () {
        yield c2.put("two");
    });
    go(function* () {
        for (let i = 1; i <= 2; i++) {
            const [val1, val2] = yield select(c1, c2);
            if (typeof val1 !== "undefined") {
                expect(val1).toEqual({ value: undefined, done: true });
            }
            else if (typeof val2 !== "undefined") {
                expect(val2).toEqual({ value: "two", done: false });
            }
        }
    });
    yield tick();
}));
// closing pending consumer
test("closing a pending take works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(1);
    const c1 = newChannel();
    go(function* () {
        const val = yield c1.take();
        expect(val).toEqual({ value: undefined, done: true });
    });
    close(c1);
    yield tick();
}));
test("closing a pending select works", () => __awaiter(void 0, void 0, void 0, function* () {
    expect.assertions(2);
    const c1 = newChannel();
    go(function* () {
        const [val1] = yield select(c1);
        expect(typeof val1).not.toBe("undefined");
        expect(val1).toEqual({ value: undefined, done: true });
    });
    close(c1);
    yield tick();
}));
// misc
// ====================================
describe("misc", () => {
    test("go with timeout", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(1);
        const c1 = newChannel();
        go(function* () {
            setTimeout(() => c1.asyncPut("one"), 100);
        });
        go(function* () {
            const { value: msg } = yield c1.take();
            expect(msg).toEqual("one");
        });
        // TODO remove timeout
        yield new Promise((resolve) => setTimeout(resolve, 100));
        yield tick();
    }));
});
describe("select", () => {
    test("select", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(2);
        const c1 = newChannel();
        const c2 = newChannel();
        go(function* () {
            yield c1.put("one");
            yield c2.put("two");
        });
        go(function* () {
            for (let i = 1; i <= 2; i++) {
                const [val1, val2] = yield select(c1, c2);
                if (typeof val1 !== "undefined") {
                    expect(val1).toEqual({ value: "one", done: false });
                }
                else if (typeof val2 !== "undefined") {
                    expect(val2).toEqual({ value: "two", done: false });
                }
            }
        });
        yield tick();
    }));
    test("select round robin", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(2);
        const c1 = newChannel();
        const c2 = newChannel();
        go(function* () {
            yield c1.put("one");
        });
        go(function* () {
            yield c2.put("two");
        });
        go(function* () {
            for (let i = 1; i <= 2; i++) {
                const [val1, val2] = yield select(c1, c2);
                if (typeof val1 !== "undefined") {
                    expect(val1).toEqual({ value: "one", done: false });
                }
                else if (typeof val2 !== "undefined") {
                    expect(val2).toEqual({ value: "two", done: false });
                }
            }
        });
        yield tick();
    }));
    test("select round robin with closed channels", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(2);
        const c1 = newChannel();
        const c2 = newChannel();
        close(c1);
        close(c2);
        go(function* () {
            for (let i = 1; i <= 2; i++) {
                const [val1, val2] = yield select(c1, c2);
                if (typeof val1 !== "undefined") {
                    expect(val1).toEqual({ value: undefined, done: true });
                }
                else if (typeof val2 !== "undefined") {
                    expect(val2).toEqual({ value: undefined, done: true });
                }
            }
        });
        yield tick();
    }));
    test("selecting the same channels works across go routines", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(3);
        const c1 = newChannel();
        const c2 = newChannel();
        close(c1);
        close(c2);
        go(function* () {
            yield c1.take();
            yield c2.take();
            // wait for the close to happen
            const [val1, val2] = yield select(c1, c2);
            expect(val1).toEqual({ value: undefined, done: true });
        });
        go(function* () {
            yield c1.take();
            yield c2.take();
            // wait for the close to happen
            for (let i = 1; i <= 2; i++) {
                const [val1, val2] = yield select(c1, c2);
                if (i === 1) {
                    expect(val1).toEqual({ value: undefined, done: true });
                }
                else if (i === 2) {
                    expect(val2).toEqual({ value: undefined, done: true });
                }
            }
        });
        yield tick();
    }));
});
describe("range", () => {
    test("range works", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(2);
        const c1 = newChannel();
        let i = 0;
        go(function* () {
            yield c1.put("hello");
        });
        range(c1).forEach((value) => {
            if (i === 0) {
                expect(value).toEqual("hello");
            }
            else if (i === 1) {
                expect(value).toEqual("goodbye");
            }
            else {
                throw new Error("should not be here");
            }
            i++;
        });
        go(function* () {
            yield c1.put("goodbye");
            close(c1);
        });
        yield tick();
    }));
    test("range unsubscribe works", () => __awaiter(void 0, void 0, void 0, function* () {
        expect.assertions(1);
        const c1 = newChannel();
        let i = 0;
        go(function* () {
            yield c1.put("hello");
        });
        range(c1).forEach((value) => {
            if (i === 0) {
                expect(value).toEqual("hello");
                i++;
                return false;
            }
            throw new Error("should not be here");
        });
        go(function* () {
            yield c1.put("goodbye");
            close(c1);
        });
        yield tick();
    }));
});
