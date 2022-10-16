import { LinkedListBuffer, uuid, checkGenerator } from "./utils";

interface ChannelTakeRequest {
  chanId: string;
  type: "take";
  payload: undefined;
}

export interface ChannelPutRequest<Data> {
  chanId: string;
  type: "put";
  payload: { msg: Data };
}

interface ChannelSelectRequest {
  chanId?: undefined;
  type: "select";
  payload: {
    selectedChanIds: string[];
  };
}

type ChannelYieldRequest<Data> =
  | ChannelTakeRequest
  | ChannelPutRequest<Data>
  | ChannelSelectRequest;

interface Channel<Data> {
  readonly _id: string;

  take(): ChannelTakeRequest;

  put(msg: Data): ChannelPutRequest<Data>;

  asyncPut(msg: Data): void;
}

export type GoGenerator<Data> = Generator<
  /**
   * What the generator yields to the outside. To clarify, this payload will be
   * available to the internal scheduler.
   *
   * Ex:
   *
   *     function* () {
   *      yield (msg as ChannelYieldRequest<Data>);
   *     }
   */
  ChannelYieldRequest<Data>,
  /** What the generator returns when it ends. */
  void,
  /**
   * What is yielded inside the generator, aka the yield result (called the
   * IteratorResult by TS)
   *
   * Ex:
   *
   *     function* () {
   *        const msg : IteratorResult<Data> = yield ch.take();
   *     }
   *
   * Note:
   *
   * 1. Unfortunately, TS will ignore the Data type and always type this as
   *    IteratorResult<any>. 🤷 This is a limitation of generators. See
   *    https://tech.lalilo.com/redux-saga-and-typescript-doing-it-right
   * 2. In order to get type safety that means you'll need to manually type these.
   * 3. We handle the select case by explicitly returning any
   */
  Data extends Array<infer Any> ? any : IteratorResult<Data, undefined>
> & { __goId?: string };

export type InferResult<channel> = channel extends Channel<infer Data>
  ? IteratorResult<Data, Data>
  : never;

/** "consumers" are generators that "take"/"select" from the channel */
type Consumer<Data> = (ChannelTakeRequest | ChannelSelectRequest) & {
  iterator: GoGenerator<Data>;
};

interface Consumers<Data> {
  [key: string]: LinkedListBuffer<Consumer<Data>>;
}

/** "producers" are generators that "put" into the channel. */
type Producer<Data> = ChannelPutRequest<Data> & {
  iterator: GoGenerator<Data>;
};

interface Producers<Data> {
  [key: string]: LinkedListBuffer<Producer<Data>>;
}

interface State {
  /** Map of active channels */
  channels: { [id: string]: true };

  dataProducers: Producers<any>;
  dataConsumers: Consumers<any>;

  /** Map of last selected channels */
  lastSelected: { [id: string]: number };

  /** Array of range requests */
  rangeRequests?: [];
}

const tag = "[js-go-channels]";

export const initialStateFn = (): State => ({
  channels: {},
  dataProducers: {},
  dataConsumers: {},
  lastSelected: {},
  rangeRequests: [],
});

const state = initialStateFn();

const putCloseError = new Error("Cannot put on a closed channel");
const closeError = new Error("Channel already closed");

const dummyIterator = function* () {};

/**
 * Does what it says. Need to take into account the case when the consumer is a
 * pending select, pending take. `select`s have a different signature.
 */
function _createConsumerMessage<Data, Message>(
  consumer: Consumer<Data>,
  message: { value: Message; done: false },
  chanId: string
) {
  const { iterator: consumerIterator, type: requestType, payload } = consumer;

  switch (requestType) {
    case "select": {
      const { selectedChanIds } = payload;
      const i = selectedChanIds.indexOf(chanId);
      const response: Array<{ value: Message; done: false }> = new Array(
        selectedChanIds.length
      );
      response[i] = message;
      return [consumerIterator, response] as const;
    }
    case "take": {
      return [consumerIterator, message] as const;
    }
  }
}

function _addConsumer<Data>({
  dataConsumers,
  chanId,
  consumer: { iterator, type, payload },
}: {
  dataConsumers: Consumers<Data>;
  chanId: string;
  consumer: Consumer<Data>;
}) {
  dataConsumers[chanId]?.add({
    chanId,
    iterator,
    type,
    payload,
  } as Consumer<Data>);
}

function scheduler<Data>({
  state: { dataProducers, dataConsumers, channels, lastSelected },
  generator: { iterator, yieldRequest },
  stopScheduler,
}: {
  state: State;
  generator: {
    iterator: GoGenerator<Data>;
    yieldRequest: ChannelYieldRequest<Data> | void;
    done?: false;
  };
  stopScheduler?: boolean | undefined;
}) {
  // Give the iterator the iteratorMessage and pass the result to the
  // scheduler
  const nextTick = (
    iterator: GoGenerator<Data>,
    // TODO any
    iteratorMessage?: any
  ) => {
    const { value: yieldRequest, done: stopScheduler } =
      iterator.next(iteratorMessage);

    // console.debug(tag, `go: ${iterator.__goId}`, "message received", {
    //   yieldRequest,
    //   stopScheduler,
    // });

    setTimeout(
      () =>
        scheduler({
          state: { dataProducers, dataConsumers, channels, lastSelected },
          generator: {
            iterator,
            yieldRequest,
          },
          stopScheduler,
        }),
      0
    );
  };

  // Give the iterator the error and pass the result to the scheduler
  const nextTickThrow = (iterator: GoGenerator<Data>, error: unknown) => {
    const { value: yieldRequest, done: stopScheduler } =
      iterator.throw?.(error) ?? {};

    setTimeout(
      () =>
        scheduler({
          state: { dataProducers, dataConsumers, channels, lastSelected },
          generator: {
            iterator,
            yieldRequest,
          },
          stopScheduler,
        }),
      0
    );
  };

  // if no yield request, then at start of generator, so get one
  if (!yieldRequest && !stopScheduler) {
    //  console.debug(tag, `go: ${iterator.__goId}`, "asking for first message");
    return nextTick(iterator);
  }
  // if this generator is done, then goodbye
  if (stopScheduler || !yieldRequest) {
    //  console.debug(tag, `go: ${iterator.__goId}`, "stopping scheduler");
    return;
  }

  const { type: requestType, chanId, payload } = yieldRequest;

  switch (requestType) {
    case "take": {
      // check if the channel is closed
      if (!channels[chanId]) {
        // if the channel is closed (buffer doesn't exist), then pass
        // back undefined, done = true to the iterator.
        return nextTick(iterator, { value: undefined, done: true });
      }

      // do we have any sleeping data producers?
      const producer = dataProducers[chanId]?.pop();

      if (producer) {
        const {
          iterator: producerIterator,
          payload: { msg },
        } = producer;

        // give this iterator the msg
        nextTick(iterator, { value: msg, done: false });
        // also wake up the data producer
        nextTick(producerIterator);
      } else {
        // add ourselves to the waiting list and hopefully we'll be
        // woken up in the future
        _addConsumer({
          dataConsumers,
          chanId,
          consumer: {
            chanId,
            iterator,
            type: requestType,
            payload,
          },
        });
      }
      return;
    }

    // select returns the first data producer that fires. Sends back
    // an array to the iterator. Just fire the first channel that
    // receives a message: go thru the selected channels and try to
    // get values. stop at the first that has a value.
    case "select": {
      const { selectedChanIds } = payload;
      const lastSelectedId = `${iterator.__goId}:${selectedChanIds}`;

      let chanData: {
        value: undefined;
        done: boolean;
        chanIndex: number;
      } | null = null;

      let producer = null;

      // mod by the number of selected channels so that we never get an
      // out-of-bounds exception
      const unboundedLastSelected =
        typeof lastSelected[lastSelectedId] !== "undefined"
          ? lastSelected[lastSelectedId] ?? -1
          : -1;

      const last = (unboundedLastSelected + 1) % selectedChanIds.length;
      delete lastSelected[lastSelectedId];

      // do we have any sleeping producers? but start from the last selected
      for (let i = last; i < selectedChanIds.length; i++) {
        const _chanId = selectedChanIds[i]!;

        if (!channels[_chanId]) {
          // if channel was closed then send undefined
          chanData = { value: undefined, done: true, chanIndex: i };
          break;
        }

        producer = dataProducers[_chanId]?.pop();

        if (producer) {
          const {
            payload: { msg },
          } = producer;
          chanData = { value: msg, done: false, chanIndex: i };
          break;
        }
      }

      if (chanData) {
        // set last selected
        lastSelected[lastSelectedId] = chanData.chanIndex;
        // wake up the producer
        producer && nextTick(producer.iterator);
        const response: Array<Pick<typeof chanData, "done" | "value">> =
          new Array(selectedChanIds.length);

        response[chanData.chanIndex] = {
          value: chanData.value,
          done: chanData.done,
        };
        nextTick(iterator, response);
      } else {
        // There were no sleeping producers, so add ourselves to the
        // waiting list of all the non-closed producers.
        for (const selectedChanId of selectedChanIds) {
          if (dataConsumers[selectedChanId]) {
            _addConsumer({
              dataConsumers,
              chanId: selectedChanId,
              consumer: {
                iterator,
                type: requestType,
                payload: { selectedChanIds },
              },
            });
          }
        }
      }
      return;
    }

    case "put": {
      // First check if the channel is closed.
      if (!channels[chanId]) {
        nextTickThrow(iterator, putCloseError);
        return;
      }

      const { msg } = payload;
      // do we have any takers?
      const consumer = dataConsumers[chanId]?.pop();

      if (consumer) {
        // if so, then push to the first consumer, not all
        nextTick(iterator);
        const message = _createConsumerMessage(
          consumer,
          { value: msg, done: false },
          chanId
        );
        nextTick(message[0], message[1]);
      } else {
        // let's wait for a data consumer
        dataProducers[chanId]?.add({
          chanId,
          iterator,
          payload,
          type: requestType,
        });
      }
      return;
    }

    default: {
      const x: never = requestType;
    }
  }
}

type InferData<DataOrChannel> = DataOrChannel extends Channel<infer Data>
  ? Data
  : DataOrChannel;

export function go<DataOrChannel>(
  generator: () => DataOrChannel extends Channel<infer Data>
    ? GoGenerator<Data>
    : GoGenerator<any>
) {
  const iterator = checkGenerator(generator);
  iterator.__goId = uuid();

  // so `go` kicks off the scheduler
  scheduler({
    state,
    generator: {
      iterator,
      yieldRequest: undefined,
      done: false,
    },
  });
}

export function newChannel<Data = string>() {
  const { channels, dataProducers, dataConsumers } = state;
  const chanId = uuid();
  channels[chanId] = true;
  dataProducers[chanId] = new LinkedListBuffer();
  dataConsumers[chanId] = new LinkedListBuffer();

  const channel: Channel<Data> = {
    get _id() {
      return chanId.toString();
    },
    take() {
      return {
        chanId: chanId.toString(),
        type: "take",
        payload: undefined,
      };
    },
    put(msg) {
      return {
        chanId: chanId.toString(),
        type: "put",
        payload: { msg },
      };
    },
    asyncPut(msg) {
      if (!channels[chanId]) {
        throw putCloseError;
      }
      scheduler({
        state,
        generator: {
          // pass a dummyIterator. We don't care about any errors that
          // may happen down the road, nor do we need any messages
          // from the scheduler
          iterator: dummyIterator() as GoGenerator<any>,
          yieldRequest: channel.put(msg),
        },
        stopScheduler: false,
      });
    },
  };

  return channel;
}

/** Kill the channel */
export function close<Data>(channel: Channel<Data>): void {
  const { channels, dataProducers, dataConsumers } = state;
  const chanId = channel._id;

  // console.debug(tag, `channel: ${chanId}`, "closing");

  if (!channels[chanId]) {
    // console.debug(tag, `channel: ${chanId}`, "aborting close");
    throw closeError;
  }

  // turn off channel
  delete channels[chanId];

  // awaken any pending consumers, now that the channel is closed
  const consumers = dataConsumers[chanId];
  let consumer = consumers?.pop();

  while (consumer) {
    const { iterator, ...yieldRequest } = consumer;

    scheduler({
      state,
      generator: {
        iterator,
        yieldRequest,
      },
    });

    consumer = consumers?.pop();
  }

  delete dataConsumers[chanId];

  // hope we don't have pending producers
  const producers = dataProducers[chanId];
  let producer = producers?.pop();

  while (producer) {
    const { iterator } = producer;
    const { value: request, done: stopScheduler } =
      iterator.throw(putCloseError);

    scheduler({
      state,
      generator: {
        iterator,
        yieldRequest: request,
      },
      stopScheduler,
    });

    producer = producers?.pop();
  }

  delete dataProducers[chanId];
}

export function select<Data1>(
  ...channel: [Channel<Data1>]
): ChannelSelectRequest;

export function select<Data1, Data2>(
  ...channel: [Channel<Data1>, Channel<Data2>]
): ChannelSelectRequest;

export function select<Data1, Data2, Data3>(
  ...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>]
): ChannelSelectRequest;

export function select<Data1, Data2, Data3, Data4>(
  ...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>, Channel<Data4>]
): ChannelSelectRequest;

export function select<Data1, Data2, Data3, Data4, Data5>(
  ...channel: [
    Channel<Data1>,
    Channel<Data2>,
    Channel<Data3>,
    Channel<Data4>,
    Channel<Data5>
  ]
): ChannelSelectRequest;

/** Allows you to yield for the values of the selected channels. */
export function select(...channels: Channel<any>[]): ChannelSelectRequest {
  return {
    type: "select",
    payload: { selectedChanIds: channels.map((x) => x._id) || [] },
  };
}

/** ForEach will be called each time someone `put`s to the Channel. */
export function range<Data>(channel: Channel<Data>) {
  return {
    // This actually registers the callback
    forEach(callback: (value: Data) => boolean | void) {
      // Internally, it's an iterator
      const iterator = Object.assign(dummyIterator(), {
        next: ({ value, done }: { value: Data; done: boolean }) => {
          if (done) {
            // tell the scheduler we're done and don't update
            // callback
            return { value: undefined, done: true };
          }
          // pass the value to the callback
          const unsubscribe = callback(value);
          if (unsubscribe === false) {
            // tell the scheduler we're done if callback requests to
            // unsubscribe
            return { value: undefined, done: true };
          }
          // tell the scheduler that the next request is for another
          // take
          return { value: channel.take(), done: false };
        },
      });
      // queue self
      scheduler({
        state,
        generator: {
          iterator,
          yieldRequest: channel.take(),
        },
        stopScheduler: false,
      });
    },
  };
}
