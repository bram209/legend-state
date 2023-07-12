import { createObservable } from './createObservable';
import { getNode, symbolGetNode } from './globals';
import type { ObservableEvent } from './observableInterfaces';

export function event(): ObservableEvent {
    // event simply wraps around a number observable
    // which increments its value to dispatch change events
    const obs = createObservable(0);
    const node = getNode(obs);
    node.isEvent = true;
    return {
        fire: function () {
            // Notify increments the value so that the observable changes
            obs.set((v) => v + 1);
        },
        on: function (cb?: () => void) {
            return obs.onChange(cb);
        },
        get: function () {
            // Need to return undefined
            obs.get();
        },
        // @ts-expect-error eslint doesn't like adding symbols to the object but this does work
        [symbolGetNode]: node,
    };
}
