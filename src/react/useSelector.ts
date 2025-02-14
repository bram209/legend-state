import { computeSelector, isPromise, Selector, trackSelector } from '@legendapp/state';
import React, { useRef } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import { reactGlobals } from './react-globals';
import type { UseSelectorOptions } from './reactInterfaces';

interface SelectorFunctions<T> {
    subscribe: (onStoreChange: () => void) => () => void;
    getVersion: () => number;
    run: (selector: Selector<T>) => T;
}

function createSelectorFunctions<T>(): SelectorFunctions<T> {
    let version = 0;
    let notify: () => void;
    let dispose: (() => void) | undefined;
    let resubscribe: (() => void) | undefined;

    const _update = () => {
        version++;
        notify?.();
    };

    return {
        subscribe: (onStoreChange: () => void) => {
            notify = onStoreChange;

            // Workaround for React 18 running twice in dev (part 2)
            if (
                (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
                !dispose &&
                resubscribe
            ) {
                resubscribe();
            }

            return () => {
                dispose?.();
                dispose = undefined;
            };
        },
        getVersion: () => version,
        run: (selector: Selector<T>) => {
            // Dispose if already listening
            dispose?.();

            const {
                value,
                dispose: _dispose,
                resubscribe: _resubscribe,
            } = trackSelector(selector, _update, undefined, undefined, /*createResubscribe*/ true);

            dispose = _dispose;
            resubscribe = _resubscribe;

            return value;
        },
    };
}

export function useSelector<T>(selector: Selector<T>, options?: UseSelectorOptions): T {
    // Short-circuit to skip creating the hook if the parent component is an observer
    if (reactGlobals.inObserver) {
        return computeSelector(selector);
    }

    const ref = useRef<SelectorFunctions<T>>();
    if (!ref.current) {
        ref.current = createSelectorFunctions<T>();
    }
    const { subscribe, getVersion, run } = ref.current;

    const value = run(selector) as any;

    useSyncExternalStore(subscribe, getVersion, getVersion);

    // Suspense support
    if (options?.suspense) {
        if (isPromise(value)) {
            if (React.use) {
                React.use(value);
            } else {
                throw value;
            }
        }
    }

    return value;
}
