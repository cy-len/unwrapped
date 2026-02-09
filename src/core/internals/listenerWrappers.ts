import type { AsyncResult, AsyncResultListener, AsyncResultState } from "../asyncResult";
import type { ErrorBase } from "../error";

export type ListenerWrapper<T, E extends ErrorBase, P> = (
    result: AsyncResult<T, E, P>,
    oldState: AsyncResultState<T, E, P> | undefined,
    actualListener: AsyncResultListener<T, E, P>,
    cancelTimer: () => void,
    setTimer: (id: any) => void
) => void;

export const DebounceStrategies = {
    /** 0ms: Direct execution */
    immediate: <T, E extends ErrorBase, P>(
        result: AsyncResult<T, E, P>,
        oldState: AsyncResultState<T, E, P> | undefined,
        listener: AsyncResultListener<T, E, P>
    ) => listener(result, oldState),

    /** Infinity: Never transitions to loading, just waits for success/error */
    ignoreLoading: <T, E extends ErrorBase, P>(
        result: AsyncResult<T, E, P>,
        oldState: AsyncResultState<T, E, P> | undefined,
        listener: AsyncResultListener<T, E, P>
    ) => {
        if (result.state.status !== "loading") {
            listener(result, oldState);
        }
    },

    /** X ms: The standard debounce logic */
    timed: (ms: number) => {
        return <T, E extends ErrorBase, P>(
            result: AsyncResult<T, E, P>,
            oldState: AsyncResultState<T, E, P> | undefined,
            listener: AsyncResultListener<T, E, P>,
            cancelTimer: () => void,
            setTimer: (id: any) => void
        ) => {
            if (result.state.status === "loading") {
                setTimer(
                    setTimeout(() => {
                        setTimer(null);
                        if (result.state.status === "loading") listener(result, oldState);
                    }, ms)
                );
                return;
            }
            cancelTimer();
            listener(result, oldState);
        };
    },
};