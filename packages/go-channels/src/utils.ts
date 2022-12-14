export class BufferItem<Data> {
  data: Data;
  next: BufferItem<Data> | undefined;

  constructor(data: Data, next?: BufferItem<Data>) {
    this.data = data;
    this.next = next;
  }
}

export class LinkedListBuffer<Data> {
  head: BufferItem<Data> | undefined;
  tail: BufferItem<Data> | undefined;

  constructor() {
    this.head = undefined;
    this.tail = undefined;
  }

  add(item: Data) {
    const bufferItem = new BufferItem(item);
    // first item ever
    if (!this.head) {
      this.head = bufferItem;
      this.tail = bufferItem;
      return;
    }
    if (this.tail) this.tail.next = bufferItem;
  }

  pop() {
    if (!this.head) return undefined;

    const item = this.head;
    this.head = this.head.next;
    return item.data;
  }
}

let id = 0;

export function uuid() {
  // Note that we're not using generators to avoid having generators
  // as a library dependency.
  return id++;
}

/**
 * This is really for JS users. Not needed for Ts.
 */
export function checkGenerator(generator: any) {
  // check if generator
  if (!generator || typeof generator !== "function") {
    throw new Error("Need a generator");
  }
  const iterator = generator();
  if (!iterator || typeof iterator[Symbol.iterator] !== "function") {
    throw new Error("Need an iterator");
  }
  return iterator;
}
