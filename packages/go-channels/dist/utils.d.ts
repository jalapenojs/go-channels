export declare class BufferItem<Data> {
    data: Data;
    next: BufferItem<Data> | undefined;
    constructor(data: Data, next?: BufferItem<Data>);
}
export declare class LinkedListBuffer<Data> {
    head: BufferItem<Data> | undefined;
    tail: BufferItem<Data> | undefined;
    constructor();
    add(item: Data): void;
    pop(): Data | undefined;
}
export declare function uuid(): number;
/**
 * This is really for JS users. Not needed for Ts.
 */
export declare function checkGenerator(generator: any): any;
