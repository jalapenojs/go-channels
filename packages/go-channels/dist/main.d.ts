import { LinkedListBuffer, checkGenerator } from "./utils";
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
interface ChannelCloseRequest {
    chanId: string;
    type: "close";
    payload: undefined;
}
declare type ChannelYieldRequest<Data> = ChannelTakeRequest | ChannelPutRequest<Data> | ChannelSelectRequest | ChannelCloseRequest;
interface Channel<Data> {
    readonly _id: string;
    take(): ChannelTakeRequest;
    put(msg: Data): ChannelPutRequest<Data>;
    asyncPut(msg: Data): void;
}
declare type GoGenerator<Data> = Generator<ChannelYieldRequest<Data> | void, // yield result
void, // return type
any> & {
    __goId?: string;
};
/**
 * "consumers" are generators that "take"/"select" from the channel
 */
declare type Consumer<Data> = (ChannelTakeRequest | ChannelSelectRequest) & {
    iterator: GoGenerator<Data>;
};
interface Consumers<Data> {
    [key: string]: LinkedListBuffer<Consumer<Data>>;
}
/**
 * "producers" are generators that "put" into the channel.
 */
declare type Producer<Data> = ChannelPutRequest<Data> & {
    iterator: GoGenerator<Data>;
};
interface Producers<Data> {
    [key: string]: LinkedListBuffer<Producer<Data>>;
}
interface State {
    /**
     * map of active channels
     */
    channels: {
        [id: string]: true;
    };
    dataProducers: Producers<any>;
    dataConsumers: Consumers<any>;
    /**
     * map of last selected channels
     */
    lastSelected: {
        [id: string]: number;
    };
    /**
     * array of range requests
     */
    rangeRequests?: [];
}
export declare const initialStateFn: () => State;
export declare function go<Data>(generator: () => GoGenerator<Data>): void;
export declare function newChannel<Data = string>(): Channel<Data>;
/**
 * Kill the channel
 */
export declare function close<Data>(channel: Channel<Data>): ChannelCloseRequest | void;
interface Selection {
    type: "select";
    payload: {
        selectedChanIds: string[];
    };
}
export declare function select<Data1>(...channel: [Channel<Data1>]): Selection;
export declare function select<Data1, Data2>(...channel: [Channel<Data1>, Channel<Data2>]): Selection;
export declare function select<Data1, Data2, Data3>(...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>]): Selection;
export declare function select<Data1, Data2, Data3, Data4>(...channel: [Channel<Data1>, Channel<Data2>, Channel<Data3>, Channel<Data4>]): Selection;
export declare function select<Data1, Data2, Data3, Data4, Data5>(...channel: [
    Channel<Data1>,
    Channel<Data2>,
    Channel<Data3>,
    Channel<Data4>,
    Channel<Data5>
]): Selection;
/**
 * forEach will be called each time someone `put`s to the Channel.
 */
export declare function range<Data>(channel: Channel<Data>): {
    forEach(callback: (value: Data) => boolean | void): void;
};
export { LinkedListBuffer, checkGenerator };
