import { ErrorBase } from "./error";
import { DebounceStrategies } from "./internals/listenerWrappers";
import { Result, type ResultState } from "./result";

/**
 * Type representing the state of an AsyncResult.
 * It can be 'idle', 'loading' with a promise and an optional progress information of type P, or a settled ResultState (success or error).
 */
export type AsyncResultState<T, E extends ErrorBase = ErrorBase, P = unknown> =
    | { status: 'idle' }
    | { status: 'loading'; promise: Promise<Result<T, E>>; progress?: P }
    | ResultState<T, E>;


/**
 * An Action is a function returning a Promise of a Result.
 */
export type Action<T, E extends ErrorBase = ErrorBase, P = unknown> = (notifyProgress: (progress: P) => void) => Promise<Result<T, E>>;

/**
 * A LazyAction is an object containing a trigger function to start the action, and the AsyncResult representing the action's state.
 */
export type LazyAction<T, E extends ErrorBase = ErrorBase, P = unknown> = {
    trigger: () => void;
    result: AsyncResult<T, E, P>;
};

/**
 * A ChainStep is a function that takes an arbitrary input and returns a Result or a Promise of a Result.
 * It takes an input of type I and returns either a Result<O, E> or a Promise<Result<O, E>>.
 * 
 * Used for chaining operations on AsyncResult.
 */
export type ChainStep<I, O, E extends ErrorBase = ErrorBase> = (input: I) => Result<O, E> | Promise<Result<O, E>>;

/**
 * A FlatChainStep is a function that takes an arbitrary input and returns an AsyncResult.
 * It takes an input of type I and returns an AsyncResult<O, E>.
 * 
 * Used for flat-chaining operations on AsyncResult.
 */
export type FlatChainStep<I, O, E extends ErrorBase = ErrorBase, P = unknown> = (input: I) => AsyncResult<O, E, P>;

/**
 * Type representing a generator function that yields AsyncResult instances and returns a final value of type T.
 * 
 * Used for running generators with AsyncResult.run().
 */
export type AsyncResultGenerator<T> = Generator<AsyncResult<any, any, any>, T, any>;

/**
 * Type representing a listener function for AsyncResult state changes.
 * The listener receives the AsyncResult instance and the previous state (if available).
 */
export type AsyncResultListener<T, E extends ErrorBase = ErrorBase, P = unknown> = (result: AsyncResult<T, E, P>, oldState?: AsyncResultState<T, E, P>) => any;

export interface AsyncResultListenerOptions {
    immediate?: boolean;
    callOnProgressUpdates?: boolean;
    debounceLoadingMs?: number;
}

interface AsyncResultListenerEntry<T, E extends ErrorBase, P> {
    listener: AsyncResultListener<T, E, P>;
    options: AsyncResultListenerOptions;
}

interface ParentalLink<T, E extends ErrorBase, P> {
    parent: AsyncResult<T, E, P>;
    stopListening: () => void;
}

/**
 * Class representing the asynchronous result of an operation that can be idle, loading, successful, or failed.
 * Provides methods for listening to state changes, updating state, chaining operations, and converting to and from promises.
 * @class AsyncResult
 * @template T - The type of the successful result value.
 * @template E - The type of the error, extending ErrorBase (default is ErrorBase).
 * @template P - The type of the progress information for loading state (default is unknown).
 */
export class AsyncResult<T, E extends ErrorBase = ErrorBase, P = unknown> {
    private _state: AsyncResultState<T, E, P>;
    private _listeners: Set<AsyncResultListenerEntry<T, E, P>> = new Set();
    private _parentalLink: ParentalLink<any, any, any> | null = null; // For derived results

    constructor(state?: AsyncResultState<T, E, P>) {
        this._state = state || { status: 'idle' };
    }



    // === Getting current state ===

    /**
     * Returns the internal state of the AsyncResult.
     */
    get state() {
        return this._state;
    }

    /**
     * Checks if the AsyncResult is successful.
     * @returns whether or not the result is successful
     */
    isSuccess() {
        return this._state.status === 'success';
    }

    /**
     * Checks if the AsyncResult is an error.
     * @returns whether or not the result is an error
     */
    isError() {
        return this._state.status === 'error';
    }

    /**
     * Checks if the AsyncResult is idle.
     * @returns whether or not the result is idle
     */
    isIdle() {
        return this._state.status === 'idle';
    }

    /**
     * Checks if the AsyncResult is loading.
     * @returns whether or not the result is loading
     */
    isLoading() {
        return this._state.status === 'loading';
    }



    // === Unwrapping values ===

    /**
     * Returns the successful value if the AsyncResult is in a success state, otherwise returns null.
     * @returns the successful value or null
     */
    unwrapOrNull(): T | null {
        if (this._state.status === 'success') {
            return this._state.value;
        }
        return null;
    }

    /**
     * Returns the successful value if the AsyncResult is in a success state, otherwise throws an error.
     * @returns the successful value
     * @throws an normal JS Error if the result is not successful
     */
    unwrapOrThrow(): T {
        if (this._state.status === 'success') {
            return this._state.value;
        }
        throw new Error('Tried to unwrap an AsyncResult that is not successful');
    }

    /**
     * Returns the error value if the AsyncResult is in an error state, otherwise returns null.
     * @returns the error value or null
     */
    unwrapErrorOrNull(): E | null {
        if (this._state.status === 'error') {
            return this._state.error;
        }
        return null;
    }

    /**
     * Returns the progress information if the AsyncResult is in a loading state, otherwise returns null.
     * @returns the progress information or null
     */
    getProgressOrNull(): P | null {
        if (this._state.status === 'loading') {
            return this._state.progress ?? null;
        }
        return null;
    }

    // === Creating/updating from settled values ===

    private set state(newState: AsyncResultState<T, E, P>) {
        const oldState = this._state;

        this._state = newState;
        this._listeners.forEach((listenerEntry) => {
            if ((oldState.status !== 'loading' || newState.status !== 'loading') || listenerEntry.options.callOnProgressUpdates) {
                listenerEntry.listener(this, oldState)
            }
        });
    }

    private setState(newState: AsyncResultState<T, E, P>) {
        this.state = newState;
    }

    /**
     * Creates a successful AsyncResult with the given value.
     * @param value the result of the successful operation
     * @returns a successful AsyncResult
     */
    static ok<T>(value: T): AsyncResult<T, never> {
        return new AsyncResult<T, never>({ status: 'success', value });
    }

    /**
     * Creates an error AsyncResult with the given error.
     * @param error the error of the failed operation
     * @returns an error AsyncResult
     */
    static err<E extends ErrorBase = ErrorBase>(error: E): AsyncResult<never, E> {
        return new AsyncResult<never, E>({ status: 'error', error });
    }

    /**
     * Creates an error AsyncResult with a new ErrorBase constructed from the given parameters.
     * @param code the error code
     * @param message the error message (optional)
     * @param thrownError the original error object, if any (optional)
     * @param log whether to log the error upon creation (default is true)
     * @returns an error AsyncResult
     */
    static errTag(code: string, message?: string, thrownError?: unknown, log: boolean = true): AsyncResult<never, ErrorBase> {
        const error = new ErrorBase(code, message, thrownError, log);
        return AsyncResult.err(error);
    }

    /**
     * Updates the AsyncResult to a successful state with the given value.
     * Like AsyncResult.ok, but in place.
     * @param value the successful value
     */
    updateFromValue(value: T) {
        this.state = { status: 'success', value };
        return this;
    }

    /**
     * Updates the AsyncResult to an error state with the given error.
     * Like AsyncResult.err, but in place.
     * @param error the error
     */
    updateFromError(error: E) {
        this.state = { status: 'error', error };
        return this;
    }

    /**
     * Updates the progress information of the AsyncResult if it is currently loading.
     * @param progress progress information to include in the loading state
     */
    updateProgress(progress: P) {
        if (this._state.status === 'loading') {
            this.state = { ...this._state, progress };
        }
        return this;
    }


    // === Creating/updating from promises ===

    /**
     * Creates an AsyncResult from a promise that resolves to a value.
     * The AsyncResult is initially in a loading state, and updates to a successful state once the promise resolves.
     * If the promise rejects, the AsyncResult is updated to an error state with the caught error.
     * 
     * Like AsyncResult.fromResultPromise, but for promise that only resolves to a successful value and not a Result.
     * 
     * @param promise the promise that resolves to a value
     * @returns an AsyncResult representing the state of the promise
     */
    static fromValuePromise<T, E extends ErrorBase = ErrorBase>(promise: Promise<T>): AsyncResult<T, E> {
        const result = new AsyncResult<T, E>();
        result.updateFromValuePromise(promise);
        return result;
    }

    /**
     * Updates the AsyncResult to a loading state with the given promise.
     * The AsyncResult is initially in a loading state, and updates to a successful state once the promise resolves.
     * If the promise rejects, the AsyncResult is updated to an error state with the caught error.
     * 
     * Like AsyncResult.fromValuePromise, but in place.
     * 
     * @param promise the promise that resolves to a value
     */
    updateFromValuePromise(promise: Promise<T>) {
        const resultStatePromise = async (): Promise<Result<T, E>> => {
            try {
                const value = await promise;
                return Result.ok(value);
            } catch (error) {
                return Result.err(error as E);
            }
        };
        return this.updateFromResultPromise(resultStatePromise());
    }


    // === Waiting for settled state and get result ===

    /**
     * Waits for the AsyncResult to settle (either success or error) if it is currently loading.
     * @returns itself once settled
     */
    async waitForSettled(): Promise<AsyncResult<T, E, P>> {
        if (this._state.status === 'loading') {
            try {
                const value = await this._state.promise;
                this._state = value.state;
            } catch (error) {
                this._state = { status: 'error', error: error as E };
            }
        }
        return this;
    }

    /**
     * Waits for the AsyncResult to settle (either success or error) if it is currently loading, and returns a Result representing the settled state.
     * @returns a Result representing the settled state
     */
    async toResultPromise(): Promise<Result<T, E>> {
        const settled = await this.waitForSettled();
        if (settled.state.status === 'idle' || settled.state.status === 'loading') {
            throw new Error('Cannot convert idle or loading AsyncResult to ResultState');
        }
        if (settled.state.status === 'error') {
            return Result.err(settled.state.error);
        }
        return Result.ok(settled.state.value);
    }

    /**
     * Waits for the AsyncResult to settle (either success or error) if it is currently loading, and returns the successful value or throws an error.
     * @returns the successful value
     * @throws an normal JS Error if the result is not successful
     */
    async toValueOrThrowPromise(): Promise<T> {
        const settled = await this.waitForSettled();
        return settled.unwrapOrThrow();
    }

    /**
     * Waits for the AsyncResult to settle (either success or error) if it is currently loading, and returns the successful value or null.
     * @returns either the successful value or null
     */
    async toValueOrNullPromise(): Promise<T | null> {
        const settled = await this.waitForSettled();
        return settled.unwrapOrNull();
    }

    /**
     * Creates an AsyncResult from a promise that resolves to a Result.
     * The AsyncResult is initially in a loading state, and updates to the settled state once the promise resolves.
     * If the promise rejects, the AsyncResult is updated to an error state with a default ErrorBase.
     * 
     * @param promise the promise that resolves to a Result
     * @returns an AsyncResult representing the state of the promise
     */
    static fromResultPromise<T, E extends ErrorBase = ErrorBase>(promise: Promise<Result<T, E>>): AsyncResult<T, E> {
        const result = new AsyncResult<T, E>();
        result.updateFromResultPromise(promise);
        return result;
    }

    /**
     * Updates the AsyncResult to a loading state with the given promise.
     * The promise must produce a Result once settled (meaning it should return the error in the result when possible).
     * If the promise rejects, the AsyncResult is updated to an error state with a default ErrorBase.
     * 
     * Like AsyncResult.fromResultPromise, but in place.
     * 
     * @param promise the promise that resolves to a Result
     */
    updateFromResultPromise(promise: Promise<Result<T, E>>) {
        this.state = { status: 'loading', promise };
        promise
            .then((res) => {
                this.state = res.state;
            })
            .catch((error) => {
                this.updateFromError(new ErrorBase('defect_on_updateFromResultPromise', 'The promise provided to AsyncResult rejected', error) as E);
            });
        return this;
    }


    // === Listeners ===

    /**
     * Adds a listener that is called whenever the AsyncResult state changes.
     * @param listener the listener function to add
     * @param immediate whether to call the listener immediately with the current state (default is true)
     * @returns a function to remove the listener
     */
    listen(listener: AsyncResultListener<T, E, P>, options: AsyncResultListenerOptions = { immediate: true, callOnProgressUpdates: true }) {
        let extraCleanup: (() => void) | null = null;
        let timeoutId: any = null;

        let strategy: AsyncResultListener<T, E, P>;

        const wait = options.debounceLoadingMs ?? 0;

        if (wait <= 0) {
            strategy = (r, o) => DebounceStrategies.immediate(r, o, listener);
        } else if (wait === Infinity) {
            strategy = (r, o) => DebounceStrategies.ignoreLoading(r, o, listener);
        } else {
            const timedWrapper = DebounceStrategies.timed(wait);
            extraCleanup = () => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };
            strategy = (r, o) =>
                timedWrapper(
                    r,
                    o,
                    listener,
                    extraCleanup!,
                    (id) => (timeoutId = id)
                );
        }

        const entry: AsyncResultListenerEntry<T, E, P> = { listener, options };
        this._listeners.add(entry);

        if (options.immediate) {
            listener(this);
        }

        return () => {
            extraCleanup?.();
            this._listeners.delete(entry);
        };
    }

    /**
     * Adds a listener that is called whenever the AsyncResult state changes, and automatically unsubscribes once it is settled (success or error).
     * @param listener the listener function to add
     * @param immediate whether to call the listener immediately with the current state (default is true)
     * @returns a function to remove the listener
     */
    listenUntilSettled(listener: AsyncResultListener<T, E, P>, options: AsyncResultListenerOptions = { immediate: true, callOnProgressUpdates: true }) {
        const unsub = this.listen((result) => {
            listener(result);
            if (result.state.status === 'success' || result.state.status === 'error') {
                unsub();
            }
        }, options);

        return unsub;
    }

    /**
     * Adds a one-time listener that is called once the AsyncResult settles on a success.
     * @param callback callback called once the AsyncResult settled on a success
     * @returns A function to unsubscribe early
     */
    onSuccessOnce(callback: (value: T) => void) {
        return this.listenUntilSettled((result) => {
            if (result.isSuccess()) {
                callback(result.unwrapOrThrow());
            }
        });
    }

    /**
     * Adds a perpetual listener that is called every time the AsyncResult settles on a success.
     * @param callback callback called every time the AsyncResult settles on a success
     * @returns A function to unsubscribe
     */
    onSuccessPerpetual(callback: (value: T) => void) {
        return this.listen((result) => {
            if (result.isSuccess()) {
                callback(result.unwrapOrThrow());
            }
        });
    }

    /**
     * Adds a one-time listener that is called once the AsyncResult settles on an error.
     * @param callback callback called once the AsyncResult settled on an error
     * @returns A function to unsubscribe early
     */
    onErrorOnce(callback: (error: E) => void) {
        return this.listenUntilSettled((result) => {
            if (result.isError()) {
                callback(result.unwrapErrorOrNull()!);
            }
        });
    }

    /**
     * Adds a perpetual listener that is called every time the AsyncResult settles on an error.
     * @param callback callback called every time the AsyncResult settles on an error
     * @returns A function to unsubscribe
     */
    onErrorPerpetual(callback: (error: E) => void) {
        return this.listen((result) => {
            if (result.isError()) {
                callback(result.unwrapErrorOrNull()!);
            }
        });
    }

    protected setParentalLink<TP, EP extends ErrorBase, PP>(parent: AsyncResult<TP, EP, PP>, stopListening: () => void) {
        this._parentalLink = { parent, stopListening };
    }

    detachFromParent() {
        if (this._parentalLink) {
            this._parentalLink.stopListening();
            this._parentalLink = null;
        }
    }

    // === Mirroring ===

    /**
     * Mirrors the state of another AsyncResult into this one.
     * Whenever the other AsyncResult changes state, this AsyncResult is updated to match.
     * When a debounceLoadingMs option is provided, this can be used to create a debounced version of an AsyncResult that only updates to loading after a certain delay, while still updating immediately for success and error states.
     * @param other the AsyncResult to mirror
     * @returns a function to stop mirroring
     */
    mirror(other: AsyncResult<T, E, P>, options: AsyncResultListenerOptions = { immediate: true, callOnProgressUpdates: true }) {
        const unsub = other.listen((newState) => {
            this.setState(newState.state);
        }, options);
        this.setParentalLink(other, unsub);

        return unsub;
    }

    /**
     * Mirrors the state of another AsyncResult into this one, until the other AsyncResult is settled (success or error).
     * Whenever the other AsyncResult changes state, this AsyncResult is updated to match, until the other AsyncResult is settled.
     * @param other the AsyncResult to mirror
     * @returns a function to stop mirroring
     */
    mirrorUntilSettled(other: AsyncResult<T, E, P>, options: AsyncResultListenerOptions = { immediate: true, callOnProgressUpdates: true }) {
        const unsub = other.listenUntilSettled((newState) => {
            this.setState(newState.state);
        }, options);
        this.setParentalLink(other, unsub);

        return unsub;
    }

    /**
     * Creates a debounced version of an AsyncResult that only updates to loading after a certain delay, while still updating immediately for success and error states.
     * @param ms debounce time, can be Infinity for skipping loading states and always hold the previous settled value
     * @returns the debounced AsyncResult
     */
    toDebounced(ms: number) {
        const debouncedResult = new AsyncResult<T, E, P>();
        debouncedResult.mirror(this, { debounceLoadingMs: ms });
        return debouncedResult;
    }


    // === Derived results ===


    /**
     * Creates a new AsyncResult that listens to this AsyncResult and runs the given generator function whenever this AsyncResult changes to a successful state.
     * @param generatorFunc the generator to run when the parent changed to a successful state
     */
    derivedGenerator<T2, E2 extends ErrorBase = ErrorBase, P2 = unknown>(generatorFunc: (input: T, notifyProgress: (progress: P2) => void) => AsyncResultGenerator<T2>): AsyncResult<T2, E | E2, P | P2> {
        return AsyncResult.derivedFromParent(this, generatorFunc);
    }

    protected static derivedFromParent<T, E extends ErrorBase, P, T2, E2 extends ErrorBase, P2>(
        parent: AsyncResult<T, E, P>,
        generatorFunc: (parentResult: T, notifyProgress: (progress: P2) => void) => AsyncResultGenerator<T2>,
    ): AsyncResult<T2, E | E2, P | P2> {
        const result = new AsyncResult<T2, E | E2, P | P2>();
        const unsub = parent.listen((parent) => {
            const state = parent.state;
            if (state.status === 'success') {
                result.runInPlace((notifyProgress) => generatorFunc(state.value, notifyProgress));
            } else {
                result.setState(state as AsyncResultState<T2, E | E2, P | P2>); // Ignore type check as T is not relevant when not in success, and E is compatible with E | E2
            }
        });
        result.setParentalLink(parent, unsub);
        return result;
    }


    // === Actions ===

    /**
     * Creates an AsyncResult from an Action.
     * The AsyncResult is initially in a loading state, and updates to the settled state once the Action's promise resolves.
     * If the Action's promise rejects, the AsyncResult is updated to an error state with a default ErrorBase.
     * 
     * Like AsyncResult.fromResultPromise, but for Actions.
     * 
     * @param action the Action to run to produce the AsyncResult
     * @return an AsyncResult representing the state of the Action
     */
    static fromAction<T, E extends ErrorBase = ErrorBase, P = unknown>(action: Action<T, E, P>): AsyncResult<T, E, P> {
        return new AsyncResult<T, E, P>().updateFromAction(action);
    }

    /**
     * Updates the AsyncResult based on the given Action.
     * Like AsyncResult.fromAction, but in place.
     * @param action an action that will be called directly
     * @returns itself
     */
    updateFromAction(action: Action<T, E, P>) {
        const promise = action((progress) => this.updateProgress(progress));
        return this.updateFromResultPromise(promise);
    }

    /**
     * Creates a LazyAction that can be triggered to run the given Action.
     * @param action the Action to run when triggered
     * @returns an object containing the trigger function and the associated AsyncResult
     */
    static makeLazyAction<T, E extends ErrorBase = ErrorBase, P = unknown>(action: Action<T, E, P>): LazyAction<T, E, P> {
        const result = new AsyncResult<T, E, P>();
        const trigger = () => {
            result.updateFromAction(action);
        };

        return { trigger, result };
    }

    // === Chaining ===

    /**
     * Chains the current AsyncResult with another operation that returns a Result or a Promise of a Result.
     * 
     * If the current AsyncResult is loading, waits for it to settle first, then applies the provided function to its value.
     * If the current AsyncResult is successful, applies the provided function to its value.
     * Otherwise, returns the current error.
     * 
     * Useful to describe a sequence of operations that can each fail, and short-circuit on the first failure.
     * 
     * @param fn a function taking as input the successful value of the result, and returning a Result or a Promise of a Result describing the result of its own operation
     * @returns a new AsyncResult that has either the successful value of the operation, or either the error of the current result or the error returned by fn
     */
    chain<O, E2 extends ErrorBase = ErrorBase>(fn: ChainStep<T, O, E | E2>): AsyncResult<O, E | E2> {
        const newResultBuilder = async (): Promise<Result<O, E | E2>> => {
            const settled = await this.waitForSettled();
            if (settled.state.status === 'loading' || settled.state.status === 'idle') {
                throw new Error('Unexpected state after waitForSettled'); // TODO handle this case properly
            }
            if (settled.state.status === 'error') {
                return Result.err(settled.state.error);
            }

            return fn(settled.state.value);
        };

        return AsyncResult.fromResultPromise<O, E | E2>(newResultBuilder());
    }

    /**
     * Chains the current AsyncResult with another operation that returns an AsyncResult.
     * 
     * If the current AsyncResult is loading, waits for it to settle first, then applies the provided function to its value.
     * If the current AsyncResult is successful, applies the provided function to its value.
     * Otherwise, returns the current error.
     * 
     * Useful to describe a sequence of operations that can each fail, and short-circuit on the first failure.
     * 
     * Like chain, but for functions returning AsyncResult instead of Result.
     * 
     * @param fn a function taking as input the successful value of the result, and returning an AsyncResult describing the result of its own operation
     * @returns a new AsyncResult that has either the successful value of the operation, or either the error of the current result or the error returned by fn
     */
    flatChain<O, E2 extends ErrorBase = ErrorBase>(fn: FlatChainStep<T, O, E | E2>): AsyncResult<O, E | E2> {
        const newResultBuilder = async (): Promise<Result<O, E | E2>> => {
            const settled = await this.toResultPromise();
            if (settled.state.status === 'error') {
                return Result.err(settled.state.error);
            }

            const nextAsyncResult = fn(settled.state.value);
            const nextSettled = await nextAsyncResult.toResultPromise();
            return nextSettled;
        }

        return AsyncResult.fromResultPromise<O, E | E2>(newResultBuilder());
    }

    // pipeParallel PipeFunction[] -> AsyncResult<T, E>[]
    // pipeParallelAndCollapse PipeFunction[] -> AsyncResult<T[], E>

    /**
     * Ensures that all provided AsyncResults are successful.
     * If all are successful, returns an AsyncResult containing an array of their values.
     * If any AsyncResult is an error, returns an AsyncResult with the first encountered error.
     * @param results an array of AsyncResults to check
     * @returns an AsyncResult containing either an array of successful values or the first encountered error
     */
    static ensureAvailable<R extends readonly AsyncResult<any, any>[]>(results: R): AsyncResult<{ [K in keyof R]: R[K] extends AsyncResult<infer T, any> ? T : never }, R[number] extends AsyncResult<any, infer E> ? E : never> {
        type ReturnT = { [K in keyof R]: R[K] extends AsyncResult<infer T, any> ? T : never };
        type ReturnE = R[number] extends AsyncResult<any, infer E> ? E : never;

        if (results.length === 0) {
            return AsyncResult.ok([] as unknown as ReturnT) as unknown as AsyncResult<ReturnT, ReturnE>;
        }

        const promise = Promise.all(results.map((r) => r.waitForSettled())).then(
            (settledResults) => {
                for (const res of settledResults) {
                    if (res.state.status === 'error') {
                        return Result.err(res.state.error);
                    }
                }

                const values = settledResults.map((r) => r.unwrapOrNull()!) as ReturnT;

                return Result.ok(values);
            }
        );

        return AsyncResult.fromResultPromise(promise) as AsyncResult<ReturnT, ReturnE>;
    }

    // === Generator support ===

    /**
     * Yields the current AsyncResult, and if it is successful, returns its value.
     * This allows using AsyncResult instances in generator functions to simplify error handling and propagation.
     * @example
     * function* example(): Generator<AsyncResult<number>, number, any> {
     *     const result1 = yield* AsyncResult.ok(5);
     *     const result2 = yield* AsyncResult.ok(10);
     *     return result1 + result2;
     * }
     */
    *[Symbol.iterator](): Generator<AsyncResult<T, E, P>, T, any> {
        yield this;

        if (this._state.status === 'success') {
            return this._state.value;
        }
        return undefined as T;
    }

    private static _runGeneratorProcessor<T, E extends ErrorBase>(iterator: AsyncResultGenerator<T>): () => Promise<Result<T, E>> {
        return async (): Promise<Result<T, E>> => {
            let result = iterator.next();

            while (!result.done) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const yielded = result.value as AsyncResult<any, E>;
                const settled = await yielded.toResultPromise();
                if (settled.state.status === 'error') {
                    return Result.err(settled.state.error);
                }
                result = iterator.next(settled.state.value);
            }

            return Result.ok(result.value);
        }
    }

    /**
     * Runs a generator function that yields AsyncResult instances, propagating errors automatically.
     * If any yielded AsyncResult is an error, the execution stops and the error is returned.
     * If all yielded AsyncResults are successful, returns a successful AsyncResult with the final returned value.
     * 
     * This serves the same purpose as chain/flatChain, but allows for a more linear and readable style of coding.
     * Think of it as "async/await" but for AsyncResult handling in generator functions.
     * 
     * @param generatorFunc a generator function that yields AsyncResult instances
     * @returns a AsyncResult containing either the final successful value or the first encountered error
     * 
     * @example
     * const result = AsyncResult.run(function* () {
     *     const value1 = yield* AsyncResult.ok(5);
     *     const value2 = yield* AsyncResult.ok(10);
     *     return value1 + value2;
     * }
     */
    static run<T, E extends ErrorBase = ErrorBase, P = unknown>(generatorFunc: (notifyProgress: (progress: P) => void) => AsyncResultGenerator<T>): AsyncResult<T, E, P> {
        return AsyncResult.fromAction(async (notifyProgress: (progress: P) => void) => {
            const iterator = generatorFunc(notifyProgress);
            return AsyncResult._runGeneratorProcessor<T, E>(iterator)();
        });
    }


    /**
     * Runs a generator function that yields AsyncResult instances, propagating errors automatically, and updates this AsyncResult in place.
     * If any yielded AsyncResult is an error, the execution stops and this AsyncResult is updated to that error.
     * If all yielded AsyncResults are successful, this AsyncResult is updated to a successful state with the final returned value.
     * 
     * This serves the same purpose as chain/flatChain, but allows for a more linear and readable style of coding.
     * Think of it as "async/await" but for AsyncResult handling in generator functions.
     * 
     * @param generatorFunc a generator function that yields AsyncResult instances
     */
    runInPlace(generatorFunc: (notifyProgress: (progress: P) => void) => AsyncResultGenerator<T>) {
        return this.updateFromAction((notify) => {
            const iterator = generatorFunc(notify);
            return AsyncResult._runGeneratorProcessor<T, E>(iterator)();
        });
    }


    // === Debuging ===


    log(name?: string) {
        const time = (new Date()).toTimeString().slice(0, 8);
        console.log(`${name ?? "<Anonymous AsyncResult>"} ; State at ${time} :`, this.state);
    }

    debug(name?: string) {
        return this.listen((r) => r.log(name));
    }
}
