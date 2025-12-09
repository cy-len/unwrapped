import type { AsyncResult } from "./asyncResult";
import type { ErrorBase } from "./error";
import type { Result } from "./result";

/**
 * The possible states of an AsyncResultList.
 */
export type AsyncResultCollectionState = "any-loading" | "all-settled";

export interface AsyncResultCollectionItem<T = any, E extends ErrorBase = ErrorBase> {
    key: string;
    result: AsyncResult<T, E>;
    unsub: () => void;
}

/**
 * Manages a collection of AsyncResult tasks with state tracking and listener support.
 * 
 * This class provides a way to group multiple async operations, track their overall state
 * (whether any are loading or all have settled), and react to state changes through listeners.
 * 
 * @template T - The success value type for all AsyncResult tasks in this collection
 * @template E - The error type for all AsyncResult tasks, defaults to ErrorBase
 * 
 * @example
 * ```typescript
 * const collection = new AsyncResultCollection<User>();
 * const userTask = new AsyncResult<User>();
 * 
 * collection.add('user-1', userTask);
 * 
 * collection.listen((taskQueue) => {
 *   console.log('Collection state changed:', taskQueue.state);
 * });
 * ```
 * 
 * @remarks
 * - Tasks can be automatically removed when they settle or kept in the collection
 * - The collection state is either "any-loading" (at least one task is loading) or "all-settled" (no tasks loading)
 * - Listeners are notified whenever the collection state changes
 * - Use filtering methods to query tasks by their state (success, error, loading)
 */
export class AsyncResultCollection<T = any, E extends ErrorBase = ErrorBase> {
    private _list = new Map<string, AsyncResultCollectionItem<T, E>>();
    private _listeners: Set<(taskQueue: AsyncResultCollection<T, E>) => void> = new Set();
    private _state: AsyncResultCollectionState = "all-settled";

    // === Getters ===

    /**
     * Gets the current tasks in the AsyncResultList.
     */
    get tasks() {
        return this._list;
    }

    /**
     * Gets the number of tasks in the list.
     */
    get length(): number {
        return this._list.size;
    }

    /**
     * Gets all tasks in the list as an array.
     */
    get items(): AsyncResult<T, E>[] {
        return Array.from(this._list.values()).map(i => i.result);
    }

    /**
     * Gets all tasks in the list as an array of key-value pairs.
     * Each pair contains the key and the corresponding AsyncResult.
     */
    get entries(): [string, AsyncResult<T, E>][] {
        return Array.from(this._list.entries()).map(([key, item]) => [key, item.result]);
    }

    /**
     * Gets the current state of the AsyncResultList.
     */
    get state() {
        return this._state;
    }

    private set state(s: AsyncResultCollectionState) {
        this._state = s;
        this._listeners.forEach(f => f(this));
    }

    private _onTaskFinished() {
        this.state = this.anyLoading() ? "any-loading" : "all-settled";
    }

    // === Listeners ===

    /**
     * Adds a listener that gets called whenever the state of the AsyncResultList changes.
     * @param listener the function to call when the state changes
     * @returns a function to unsubscribe the listener
     */
    listen(listener: (taskQueue: AsyncResultCollection<T, E>) => void) {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }


    /**
     * Adds a listener that gets called whenever any item in the AsyncResultList succeeds.
     * @param listener the function to call when an item succeeds
     * @returns a function to unsubscribe the listener
     */
    onItemSuccess(listener: (task: AsyncResult<T, E>, key: string) => void) {
        return this.listen((taskQueue) => {
            for (const item of taskQueue._list.values()) {
                if (item.result.isSuccess()) {
                    listener(item.result, item.key);
                }
            }
        });
    }

    /**
     * Adds a listener that gets called whenever any item in the AsyncResultList errors.
     * @param listener the function to call when an item errors
     * @returns a function to unsubscribe the listener
     */
    onItemError(listener: (task: AsyncResult<T, E>, key: string) => void) {
        return this.listen((taskQueue) => {
            for (const item of taskQueue._list.values()) {
                if (item.result.isError()) {
                    listener(item.result, item.key);
                }
            }
        });
    }

    // === Managing tasks ===

    /**
     * Adds an AsyncResult task to the list.
     * @param key the unique key for the task
     * @param task the AsyncResult task to add
     * @param removeOnSettle whether to remove the task from the list once it settles (defaults to true)
     * @returns the added AsyncResult task
     */
    add(key: string, task: AsyncResult<T, E>, removeOnSettle: boolean = true): AsyncResult<T, E> {
        let unsub = null;
        if (removeOnSettle) {
            unsub = task.listenUntilSettled((r) => {
                if (r.isLoading() || r.isIdle()) return;
                this._onTaskFinished();
                this._list.delete(key);
            }, true)
        } else {
            unsub = task.listen((r) => {
                if (r.isLoading() || r.isIdle()) return;
                this._onTaskFinished();
            }, true);
        }

        this._list.set(key, { key, result: task, unsub });
        this.state = "any-loading";

        return task;
    }

    /**
     * Removes a task from the list by its key.
     * @param key the unique key of the task to remove
     * @returns true if the task was removed, false if it was not found
     */
    remove(key: string): boolean {
        const item = this._list.get(key);
        if (!item) return false;

        item.unsub();
        this._list.delete(key);
        this._onTaskFinished(); // We may have terminated the last loading task, so we need to update the state.
        return true;
    }

    /**
     * Clears all tasks from the list and sets the state to "all-settled".
     */
    clear() {
        this._list.forEach(({ unsub }) => unsub());
        this._list.clear();
        this.state = "all-settled";
    }

    // === Querying tasks ===

    /**
     * Checks if any task in the list is currently loading.
     * @returns true if any task is loading, false otherwise
     */
    anyLoading(): boolean {
        for (const item of this._list.values()) {
            if (item.result.isLoading()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Gets all tasks that satisfy the given predicate.
     * @param predicate the function to test each task
     * @returns an array of tasks that satisfy the predicate
     */
    getAllFiltered(predicate: (task: AsyncResult<T, E>) => boolean): AsyncResult<T, E>[] {
        const filtered: AsyncResult<T, E>[] = [];
        for (const item of this._list.values()) {
            if (predicate(item.result)) {
                filtered.push(item.result);
            }
        }
        return filtered;
    }

    /**
     * Gets all tasks that satisfy the given predicate and maps them using the provided function.
     * @param filterPredicate the function to test each task
     * @param mapFunc the function to map each task
     * @returns an array of mapped values
     */
    getAllFilteredAndMap<U>(filterPredicate: (task: AsyncResult<T, E>) => boolean, mapFunc: (task: AsyncResult<T, E>) => U): U[] {
        const results: U[] = [];
        for (const item of this._list.values()) {
            if (filterPredicate(item.result)) {
                results.push(mapFunc(item.result));
            }
        }
        return results;
    }

    /**
     * Gets all tasks that have succeeded.
     * @returns an array of successful AsyncResult tasks
     */
    getAllSuccess(): AsyncResult<T, E>[] {
        return this.getAllFiltered((task) => task.isSuccess());
    }

    /**
     * Gets the success values of all tasks that have succeeded.
     * @returns an array of successful values
     */
    getAllSuccessValues(): T[] {
        return this.getAllFilteredAndMap((task) => task.isSuccess(), (task) => task.unwrapOrThrow());
    }

    /**
     * Gets all tasks that have errored.
     * @returns an array of error AsyncResult tasks
     */
    getAllErrors(): AsyncResult<T, E>[] {
        return this.getAllFiltered((task) => task.isError());
    }

    /**
     * Gets the error values of all tasks that have errored.
     * @returns an array of error values
     */
    getAllErrorValues(): E[] {
        return this.getAllFilteredAndMap((task) => task.isError(), (task) => task.unwrapErrorOrNull()!);
    }

    /**
     * Gets all tasks that are currently loading.
     * @returns an array of loading AsyncResult tasks
     */
    getAllLoading(): AsyncResult<T, E>[] {
        return this.getAllFiltered((task) => task.isLoading());
    }

    /**
     * Gets the promises of all tasks that are currently loading.
     * @returns an array of promises for loading tasks
     */
    getAllLoadingPromises(): Promise<Result<T, E>>[] {
        return this.getAllFilteredAndMap((task) => task.isLoading(), (task) => task.toResultPromise());
    }

    // === Debugging utilities ===

    /**
     * Logs the current state and tasks of the AsyncResultList to the console.
     * @param name an optional name to identify the log
     */
    log(name?: string) {
        const time = (new Date()).toTimeString().slice(0, 8);
        console.log(`${name ?? '<Anonymous TaskQueue>'} ; State at ${time} :`, this.state, this._list);
    }

    /**
     * Sets up a listener to log the state and tasks of the AsyncResultList whenever it changes.
     * @param name an optional name to identify the log
     * @returns a function to unsubscribe the debug listener
     */
    debug(name?: string) {
        return this.listen(() => {
            this.log(name);
        });
    }
}