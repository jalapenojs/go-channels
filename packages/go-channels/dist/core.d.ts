import { LinkedListBuffer } from "./utils";
interface ChannelTakeRequest {
    chanId: string;
    type: "take";
    payload: undefined;
}
interface ChannelPutRequest<Data> {
    chanId: string;
    type: "put";
    payload: {
        msg: Data;
    };
}
interface ChannelSelectRequest {
    chanId?: undefined;
    type: "select";
    payload: {
        selectedChanIds: string[];
    };
}
declare type ChannelYieldRequest<Data> = ChannelTakeRequest | ChannelPutRequest<Data> | ChannelSelectRequest;
interface Channel<Data> {
    readonly _id: string;
    take(): ChannelTakeRequest;
    put(msg: Data): ChannelPutRequest<Data>;
    asyncPut(msg: Data): void;
}
export declare type GoGenerator<Data> = Generator<
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
Data extends Array<infer Any> ? any : IteratorResult<Data, undefined>> & {
    __goId?: string;
};
export declare type InferResult<channel> = channel extends Channel<infer Data> ? IteratorResult<Data, Data> : never;
/** "consumers" are generators that "take"/"select" from the channel */
declare type Consumer<Data> = (ChannelTakeRequest | ChannelSelectRequest) & {
    iterator: GoGenerator<Data>;
};
interface Consumers<Data> {
    [key: string]: LinkedListBuffer<Consumer<Data>>;
}
/** "producers" are generators that "put" into the channel. */
declare type Producer<Data> = ChannelPutRequest<Data> & {
    iterator: GoGenerator<Data>;
};
interface Producers<Data> {
    [key: string]: LinkedListBuffer<Producer<Data>>;
}
interface State {
    /** Map of active channels */
    channels: {
        [id: string]: true;
    };
    dataProducers: Producers<any>;
    dataConsumers: Consumers<any>;
    /** Map of last selected channels */
    lastSelected: {
        [id: string]: number;
    };
    /** Array of range requests */
    rangeRequests?: [];
}
export declare const initialStateFn: () => State;
export declare function go<ThisChannel>(generator: () => ThisChannel extends Channel<infer Data> ? GoGenerator<Data> : GoGenerator<any>): void;
export declare function newChannel<Data = string>(): Channel<Data>;
/** Kill the channel */
export declare function close<Data>(channel: Channel<Data>): void;
export declare function select<Data1>(...channel: [Channel<Data1>]): ChannelSelectRequest;
export declare function select<Data1, Data2>(...channel: [Channel<Data1>, Channel<Data2>]): ChannelSelectRequest;
export declare function select<Data1, Data2, Data3>(...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>]): ChannelSelectRequest;
export declare function select<Data1, Data2, Data3, Data4>(...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>, Channel<Data4>]): ChannelSelectRequest;
export declare function select<Data1, Data2, Data3, Data4, Data5>(...channel: [
    Channel<Data1>,
    Channel<Data2>,
    Channel<Data3>,
    Channel<Data4>,
    Channel<Data5>
]): ChannelSelectRequest;
/** ForEach will be called each time someone `put`s to the Channel. */
export declare function range<Data>(channel: Channel<Data>): {
    forEach(callback: (value: Data) => boolean | void): void;
};
export {};
