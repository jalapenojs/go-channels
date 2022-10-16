# @jalapenojs/go-channels

@jalapenojs/go-channels is a library for handling asynchronous messages using
`channels`, which are message queues. See below for more details.

## Installation

```bash
yarn add @jalapenojs/go-channels
```

## Basic Usage

```typescript
import { close, go, newChannel } from "@jalapenojs/go-channels";

// create a channel
const ch = newChannel();

go(function* () {
  // put messages into the channel, which is an infinite queue
  yield ch.put("hello");
  yield ch.put("world");

  // close the channel
  close(ch);
});

go<typeof ch>(function* () {
  while (true) {
    const msg = yield ch.take();
    if (msg.done) break;
    console.log(msg.value);
  }
  // outputs:
  // "hello"
  // "world"
});
```

See
[CodeSandbox](https://codesandbox.io/s/jalepenojs-go-channels-5wh0d0?file=/src/basic-usage.ts)

### Select

```typescript
import { go, newChannel, select, InferResult } from "@jalapenojs/go-channels";

const ch1 = newChannel();
const ch2 = newChannel();

go(function* () {
  yield ch1.put("hello");
});

go(function* () {
  yield ch2.put("world");
});

type C1 = InferResult<typeof ch1>;
type C2 = InferResult<typeof ch2>;

go(function* () {
  while (true) {
    const [msg1, msg2]: [C1, C2] = yield select(ch1, ch2);
    if (msg1) {
      console.log(msg1); //`{value: hello, done: false}
    }
    if (msg2) {
      console.log(msg2); //`{value: world, done: false}
    }
  }
});
```

See
[CodeSandbox](https://codesandbox.io/s/jalepenojs-go-channels-5wh0d0?file=/src/select.ts)

### Range

```typescript
import { go, newChannel, range } from "@jalapenojs/go-channels";

const ch = newChannel<number>();

go(function* () {
  for (let i = 1; i < 10; i++) {
    yield ch.put(i);
  }
});

range(ch).forEach((msg) => {
  console.log(msg);
  if (msg === 5) {
    // return false to stop receiving messages
    return false;
  }
});

// output: 1,2,3,4,5
```

See
[CodeSandbox](https://codesandbox.io/s/jalepenojs-go-channels-5wh0d0?file=/src/range.ts:0-344)

## Overview

### What

As stated in the introduction, @jalapenojs/go-channels is a library for handling
asynchronous messages.However, unlike browser events, two key differences are:

1. Subscribers are automatically unregistered after the first event.
2. Messages are sent to subscribers in a round-robbing fashion, based on
   registration order.

```typescript
const ch = newChannel<number>();

go<typeof ch>(function* subscriber1() {
  while (true) console.log(yield ch.take()); //0, 2, 4, 6, 8, ...
});

go<typeof ch>(function* subscriber2() {
  while (true) console.log(yield ch.take()); //1, 3, 5, 7, ...
});

go(function* producer() {
  let len = 0;
  while (true) yield ch.put(len++);
});
```

See
[CodeSandbox](https://codesandbox.io/s/jalepenojs-go-channels-5wh0d0?file=/src/round-robbin.ts)

### Why

To be perfectly honest, at the time (almost 5 years ago), generators seemed
really cool and GoLang concurrency was way easier than anything I had worked
back then (including async/await). I resurrected this project because perhaps
channels can provide an easier mental model for working with asynchronous events
than React hooks 😄.

The inspiration comes from
[GoLang Channels](https://golangdocs.com/channels-in-golang) and
[redux-saga](https://redux-saga.js.org/).

GoLang Channels are +30 year technology for concurrency that provides a simpler
mental model than standard concurrency patterns. See
[the Wikipedia Article](<https://en.wikipedia.org/wiki/Go_(programming_language)#Concurrency:_goroutines_and_channels>)
for more details.

## Redux Integration

Use:

- [redux-thunk](https://github.com/gaearon/redux-thunk)
- [redux-saga](https://redux-saga.js.org/), or
- redux-go-workflows (TBD)

## React Integration

Coming soon!

## Gotchas and Limitations

In no particular order:

### No deadlock-detection support 😢

GoLang tells you when there is
[deadlock](https://en.wikipedia.org/wiki/Deadlock). That would be really cool to
add but I'm not even sure if it's possible.

### You can't `yield` inside a callback

Fortunately, the following will _not_ compile:

```typescript
const elem = //... some DOM element
const ch = newChannel()
elem.addEventListener('mouseup', function() {
  yield ch.put('mouseup'); // compile error
});
```

Instead you should use an async version of `put` (which can be a good idea since
blocking UI events doesn't really make sense).

```typescript
elem.addEventListener("mouseup", function () {
  ch.asyncPut("mouseup"); // this works!
});
```

### This common golang synchronization pattern won't work.

```typescript
function main() {
  const messages = newChannel();
  go(function* () {
    yield messages.put("ping");
  });
  // The desired behavior is to stop execution until a message
  // is received and exit *after* the ping
  const { value: msg } = messages.take();
  console.log(msg);
  // unfortunately, this never prints ping and
  // always exits immediately 😞
}
```

The reason is because Javascript is synchronous. (And also because you have to
`yield` the `take` inside a generator for it to have an effect.)

However, the following will work just fine. And by "fine", we mean that even
though `main` finishes before the generators execute, the generators will still
print out the ping.

```typescript
function main() {
  const messages = newChannel();
  go(function* () {
    yield messages.put("ping");
  });
  go<typeof messages>(function* () {
    const { value: msg } = yield messages.take();
    console.log(msg); // prints "ping"
  });
}
```

### Don't forget to `yield`

Can you spot the bug?

```typescript
const output = newChannel();
const input = newChannel();
go(function* () {
  output.put("out");
  const { value: msg } = yield input.take();
});
```

To make `put`/`take` work, you need to `yield` inside of a "go" routine. As is,
this code will run but _silently fail_. Currently, the only workaround is to
write a custom eslint rule that aggressively checks for `take`/`put` usage.

### No asynchronous generator support (coming soon!)

In go, the code below is valid.

```go
ch := make(chan int)
go func() {
	ch <- 0
	time.Sleep(1*time.Second)
	ch <- 1
	close(ch)
}()
```

This library does not (yet) support asynchronous generators, and so you can do
the following:

```typescript
const ch = newChannel();
go(function* () {
  yield ch.put(0);
  setTimeout(() => {
    ch.asyncPut(1);
    close(ch);
  }, 1000);
});
```

## Roadmap

- asynchronous generator support
- React support 🚀
- An eslint plugin for detect missing `yield`s.
- `for-of` support for `range`.
