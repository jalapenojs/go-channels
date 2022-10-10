'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

class BufferItem {
    constructor(data, next) {
        this.data = data;
        this.next = next;
    }
}
class LinkedListBuffer {
    constructor() {
        this.head = undefined;
        this.tail = undefined;
    }
    add(item) {
        const bufferItem = new BufferItem(item);
        // first item ever
        if (!this.head) {
            this.head = bufferItem;
            this.tail = bufferItem;
            return;
        }
        if (this.tail)
            this.tail.next = bufferItem;
    }
    pop() {
        if (!this.head)
            return undefined;
        const item = this.head;
        this.head = this.head.next;
        return item.data;
    }
}
let id = 0;
function uuid() {
    // Note that we're not using generators to avoid having generators
    // as a library dependency.
    return id++;
}
/**
 * This is really for JS users. Not needed for Ts.
 */
function checkGenerator(generator) {
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

const initialStateFn = () => ({
    channels: {},
    dataProducers: {},
    dataConsumers: {},
    lastSelected: {},
    rangeRequests: [],
});
const state = initialStateFn();
const putCloseError = new Error("Cannot put on a closed channel");
const closeError = new Error("Channel already closed");
const dummyIterator = function* () { };
/**
 * Does what it says. Need to take into account the case when the
 * consumer is a pending select, pending take. `select`s have a
 * different signature.
 */
function _createConsumerMessage(consumer, message, chanId) {
    const { iterator: consumerIterator, type: requestType, payload } = consumer;
    switch (requestType) {
        case "select": {
            const { selectedChanIds } = payload;
            const i = selectedChanIds.indexOf(chanId);
            const response = new Array(selectedChanIds.length);
            response[i] = message;
            return [consumerIterator, response];
        }
        case "take": {
            return [consumerIterator, message];
        }
    }
}
function _addConsumer({ dataConsumers, chanId, consumer: { iterator, type, payload }, }) {
    var _a;
    (_a = dataConsumers[chanId]) === null || _a === void 0 ? void 0 : _a.add({
        chanId,
        iterator,
        type,
        payload,
    });
}
function scheduler({ state: { dataProducers, dataConsumers, channels, lastSelected }, generator: { iterator, yieldRequest }, stopScheduler, }) {
    var _a, _b, _c, _d, _e;
    // Give the iterator the iteratorMessage and pass the result to the
    // scheduler
    const nextTick = (iterator, 
    // TODO any
    iteratorMessage) => {
        const { value: yieldRequest, done: stopScheduler } = iterator.next(iteratorMessage);
        // console.debug(tag, `go: ${iterator.__goId}`, "message received", {
        //   yieldRequest,
        //   stopScheduler,
        // });
        setTimeout(() => scheduler({
            state: { dataProducers, dataConsumers, channels, lastSelected },
            generator: {
                iterator,
                yieldRequest,
            },
            stopScheduler,
        }), 0);
    };
    // Give the iterator the error and pass the result to the scheduler
    const nextTickThrow = (iterator, error) => {
        var _a, _b;
        const { value: yieldRequest, done: stopScheduler } = (_b = (_a = iterator.throw) === null || _a === void 0 ? void 0 : _a.call(iterator, error)) !== null && _b !== void 0 ? _b : {};
        setTimeout(() => scheduler({
            state: { dataProducers, dataConsumers, channels, lastSelected },
            generator: {
                iterator,
                yieldRequest,
            },
            stopScheduler,
        }), 0);
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
            const producer = (_a = dataProducers[chanId]) === null || _a === void 0 ? void 0 : _a.pop();
            if (producer) {
                const { iterator: producerIterator, payload: { msg }, } = producer;
                // give this iterator the msg
                nextTick(iterator, { value: msg, done: false });
                // also wake up the data producer
                nextTick(producerIterator);
            }
            else {
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
            let chanData = null;
            let producer = null;
            // mod by the number of selected channels so that we never get an
            // out-of-bounds exception
            const unboundedLastSelected = typeof lastSelected[lastSelectedId] !== "undefined"
                ? (_b = lastSelected[lastSelectedId]) !== null && _b !== void 0 ? _b : -1
                : -1;
            const last = (unboundedLastSelected + 1) % selectedChanIds.length;
            delete lastSelected[lastSelectedId];
            // do we have any sleeping producers? but start from the last selected
            for (let i = last; i < selectedChanIds.length; i++) {
                const _chanId = selectedChanIds[i];
                if (!channels[_chanId]) {
                    // if channel was closed then send undefined
                    chanData = { value: undefined, done: true, chanIndex: i };
                    break;
                }
                producer = (_c = dataProducers[_chanId]) === null || _c === void 0 ? void 0 : _c.pop();
                if (producer) {
                    const { payload: { msg }, } = producer;
                    chanData = { value: msg, done: false, chanIndex: i };
                    break;
                }
            }
            if (chanData) {
                // set last selected
                lastSelected[lastSelectedId] = chanData.chanIndex;
                // wake up the producer
                producer && nextTick(producer.iterator);
                const response = new Array(selectedChanIds.length);
                response[chanData.chanIndex] = {
                    value: chanData.value,
                    done: chanData.done,
                };
                nextTick(iterator, response);
            }
            else {
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
            const consumer = (_d = dataConsumers[chanId]) === null || _d === void 0 ? void 0 : _d.pop();
            if (consumer) {
                // if so, then push to the first consumer, not all
                nextTick(iterator);
                const message = _createConsumerMessage(consumer, { value: msg, done: false }, chanId);
                nextTick(message[0], message[1]);
            }
            else {
                // let's wait for a data consumer
                (_e = dataProducers[chanId]) === null || _e === void 0 ? void 0 : _e.add({
                    chanId,
                    iterator,
                    payload,
                    type: requestType,
                });
            }
            return;
        }
        case "close":
            if (!channels[chanId]) {
                nextTickThrow(iterator, closeError);
                return;
            }
            return nextTick(iterator);
    }
}
function go(generator) {
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
function newChannel() {
    const { channels, dataProducers, dataConsumers } = state;
    const chanId = uuid();
    channels[chanId] = true;
    dataProducers[chanId] = new LinkedListBuffer();
    dataConsumers[chanId] = new LinkedListBuffer();
    const channel = {
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
                    iterator: dummyIterator(),
                    yieldRequest: channel.put(msg),
                },
                stopScheduler: false,
            });
        },
    };
    return channel;
}
/**
 * Kill the channel
 */
function close(channel) {
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
    let consumer = consumers === null || consumers === void 0 ? void 0 : consumers.pop();
    while (consumer) {
        const { iterator } = consumer, yieldRequest = __rest(consumer, ["iterator"]);
        scheduler({
            state,
            generator: {
                iterator,
                yieldRequest,
            },
        });
        consumer = consumers === null || consumers === void 0 ? void 0 : consumers.pop();
    }
    delete dataConsumers[chanId];
    // hope we don't have pending producers
    const producers = dataProducers[chanId];
    let producer = producers === null || producers === void 0 ? void 0 : producers.pop();
    while (producer) {
        const { iterator } = producer;
        const { value: request, done: stopScheduler } = iterator.throw(putCloseError);
        scheduler({
            state,
            generator: {
                iterator,
                yieldRequest: request,
            },
            stopScheduler,
        });
        producer = producers === null || producers === void 0 ? void 0 : producers.pop();
    }
    delete dataProducers[chanId];
    return {
        chanId,
        type: "close",
        payload: undefined,
    };
}
/**
 * Allows you to yield for the values of the selected channels.
 */
function select(...channels) {
    return {
        type: "select",
        payload: { selectedChanIds: channels.map((x) => x._id) || [] },
    };
}
/**
 * forEach will be called each time someone `put`s to the Channel.
 */
function range(channel) {
    return {
        // This actually registers the callback
        forEach(callback) {
            // Internally, it's an iterator
            const iterator = Object.assign(dummyIterator(), {
                next: ({ value, done }) => {
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

exports.close = close;
exports.go = go;
exports.newChannel = newChannel;
exports.range = range;
exports.select = select;
