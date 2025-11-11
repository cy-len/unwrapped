import { ErrorBase } from "./error";

/**
 * Type representing the state of a Result, either success with a value of type T,
 * or error with an error of type E (defaulting to ErrorBase).
 */
export type ResultState<T, E extends ErrorBase = ErrorBase> =
    | { status: 'success'; value: T }
    | { status: 'error'; error: E };

/**
 * Class representing the result of an operation that can either succeed with a value of type T,
 * or fail with an error of type E (defaulting to ErrorBase).
 * Provides methods for unwrapping the result, chaining operations, and handling errors.
 * @class Result
 * @template T - The type of the successful result value.
 * @template E - The type of the error, extending ErrorBase (default is ErrorBase).
 */
export class Result<T, E extends ErrorBase = ErrorBase> {
    private _state: ResultState<T, E>;

    /**
     * Creates a new Result instance with the given state.
     * @param state the state of the created Result
     */
    constructor(state: ResultState<T, E>) {
        this._state = state;
    }

    /** Returns the internal state of the Result. */
    get state() {
        return this._state;
    }

    /**
     * Checks if the Result is successful.
     * @returns whether or not the result is successful
     */
    isSuccess(): boolean {
        return this._state.status === 'success';
    }

    /**
     * Checks if the Result is an error.
     * @returns whether or not the result is an error
     */
    isError(): boolean {
        return this._state.status === 'error';
    }

    /**
     * Creates a successful Result with the given value.
     * @param value the result of the successful operation
     * @returns a successful Result
     */
    static ok<T, E extends ErrorBase = ErrorBase>(value: T): Result<T, E> {
        return new Result({ status: 'success', value });
    }

    /**
     * Creates an error Result with the given error.
     * @param error the error of the failed operation
     * @returns an error Result
     */
    static err<E extends ErrorBase = ErrorBase>(error: E): Result<never, E> {
        return new Result({ status: 'error', error });
    }

    /**
     * Creates an error Result (containing an ErrorBase) with the given error code and optional message.
     * @param code the error code
     * @param message an optional error message
     * @returns an error Result
     */
    static errTag(code: string, message?: string, thrownError?: unknown): Result<never, ErrorBase> {
        return Result.err(new ErrorBase(code, message, thrownError));
    }

    /**
     * Returns the successful value (if the Result is successful) or null (if it is an error).
     * @returns either the successful value or null
     */
    unwrapOrNull(): T | null {
        if (this._state.status === 'success') {
            return this._state.value;
        }
        return null;
    }

    /**
     * Returns the successful value (if the Result is successful) or throws an error (if it is an error).
     * @returns the successful value
     * @throws an normal JS Error if the result is not successful
     */
    unwrapOrThrow(): T {
        if (this._state.status === 'success') {
            return this._state.value;
        }
        throw new Error('Tried to unwrap a Result that is not successful');
    }

    /**
     * Returns the successful value (if the Result is successful) or a default value (if it is an error).
     * @param defaultValue the default value to return if the Result is an error
     * @returns either the successful value or the default value
     */
    unwrapOr<O>(defaultValue: O): T | O {
        if (this._state.status === 'success') {
            return this._state.value;
        }
        return defaultValue;
    }

    /**
     * Transforms a Promise of a successful value into a Promise of a Result,
     * catching any thrown errors and mapping them using the provided errorMapper function.
     * @param promise the promise to execute
     * @param errorMapper a function that maps a thrown error to a Result error
     * @returns a Promise resolving to a Result containing either the successful value or the mapped error
     */
    static tryPromise<T, E extends ErrorBase = ErrorBase>(promise: Promise<T>, errorMapper: (error: unknown) => E): Promise<Result<T, E>> {
        return promise
            .then((value) => Result.ok<T, E>(value))
            .catch((error) => Result.err(errorMapper(error)));
    }

    /**
     * Executes an asynchronous function and transforms its result into a Result,
     * catching any thrown errors and mapping them using the provided errorMapper function.
     * Same as Result.tryPromise(fn(), errorMapper).
     * @param fn the asynchronous function to execute
     * @param errorMapper a function that maps a thrown error to a Result error
     * @returns a Promise resolving to a Result containing either the successful value or the mapped error
     */
    static tryFunction<T, E extends ErrorBase = ErrorBase>(fn: () => Promise<T>, errorMapper: (error: unknown) => E): Promise<Result<T, E>> {
        return Result.tryPromise(fn(), errorMapper);
    }

    /**
     * Chains the current Result with another operation that returns a ResultState.
     * If the current Result is successful, applies the provided function to its value.
     * Otherwise, returns the current error.
     * Useful to describe a sequence of operations that can each fail, and short-circuit on the first failure.
     * @param fn a function taking as input the successful value of the result, and returning a ResultState describing the result of its own operation
     * @returns a new Result that has either the successful value of the operation, or either the error of the current result or the error returned by fn
     */
    chain<O, E2 extends ErrorBase = ErrorBase>(fn: (input: T) => ResultState<O, E | E2>): Result<O, E | E2> {
        if (this._state.status === 'success') {
            return new Result<O, E | E2>(fn(this._state.value));
        }
        return Result.err<E>(this._state.error);
    }

    /**
     * Chains the current Result with another operation that returns a Result.
     * If the current Result is successful, applies the provided function to its value.
     * Otherwise, returns the current error.
     * Useful to describe a sequence of operations that can each fail, and short-circuit on the first failure.
     * Same as chain, but the function returns a Result directly instead of a ResultState.
     * @param fn a function taking as input the successful value of the result, and returning a Result describing the result of its own operation
     * @returns a new Result that has either the successful value of the operation, or either the error of the current result or the error returned by fn
     */
    flatChain<O, E2 extends ErrorBase = ErrorBase>(fn: (input: T) => Result<O, E | E2>): Result<O, E | E2> {
        if (this._state.status === 'success') {
            return fn(this._state.value);
        }
        return Result.err<E>(this._state.error);
    }

    /**
     * @yields the current Result, and if it is successful, returns its value.
     * This allows using Result instances in generator functions to simplify error handling and propagation.
     * @example
     * function* example(): Generator<Result<number>, number, any> {
     *     const result1 = yield* Result.ok(5);
     *     const result2 = yield* Result.ok(10);
     *     return result1 + result2;
     * }
     */
    *[Symbol.iterator](): Generator<Result<T, E>, T, any> {
        yield this;

        if (this._state.status === 'success') {
            return this._state.value;
        }
        return undefined as T;
    }

    /**
     * Runs a generator function that yields Result instances, propagating errors automatically.
     * If any yielded Result is an error, the execution stops and the error is returned.
     * If all yielded Results are successful, returns a successful Result with the final returned value.
     * 
     * This serves the same purpose as chain/flatChain, but allows for a more linear and readable style of coding.
     * Think of it as "async/await" but for Result handling in generator functions.
     * 
     * @param generator a generator function that yields Result instances
     * @returns a Result containing either the final successful value or the first encountered error
     * 
     * @example
     * const result = Result.run(function* () {
     *     const value1 = yield* Result.ok(5);
     *     const value2 = yield* Result.ok(10);
     *     return value1 + value2;
     * });
     */
    static run<T, E extends ErrorBase = ErrorBase>(generator: () => Generator<Result<any, E>, T, any>): Result<T, E> {
        const iterator = generator();
        let result = iterator.next();

        while (!result.done) {
            const yielded = result.value;
            if (yielded._state.status === 'error') {
                return Result.err(yielded._state.error);
            }
            result = iterator.next(yielded._state.value);
        }

        return Result.ok(result.value);
    }
}
