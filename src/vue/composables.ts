import { onUnmounted, ref, triggerRef, watch, type Ref, type WatchSource } from "vue";
import { AsyncResult, AsyncResultCollection, ErrorBase, type Action, type AsyncResultGenerator, type FlatChainStep, type Result } from "unwrapped/core";


// === Vue specific types ===

interface ReactiveProcessOptions {
    immediate: boolean;
}



// === Vue Composables for AsyncResult ===

/**
 * Makes a ref to the given AsyncResult. Whenever the state of the AsyncResult changes,
 * the ref gets retriggered, making those changes visible to Vue's reactivity system.
 * 
 * @param asyncResult the result to make reactive
 * @returns the ref to the result
 */
export function useAsyncResultRef<T, E extends ErrorBase = ErrorBase, P = unknown>(asyncResult?: AsyncResult<T, E, P>) {
    if (!asyncResult) {
        asyncResult = new AsyncResult<T, E, P>();
    }
    const state = ref<AsyncResult<T, E, P>>(asyncResult) as Ref<AsyncResult<T, E, P>>;

    const unsub = asyncResult.listen(() => {
        triggerRef(state);
    });

    onUnmounted(() => {
        unsub();
    });

    return state;
}

/**
 * Creates an AsyncResult ref from a promise returning a Result.
 * @param promise the promise returning a Result
 * @returns the ref to the AsyncResult
 */
export function useAsyncResultRefFromPromise<T, E extends ErrorBase = ErrorBase>(promise: Promise<Result<T, E>>) {
    return useAsyncResultRef(AsyncResult.fromResultPromise(promise));
}



// === Vue Composables for Chains ===

/**
 * Watches a source, gives it as inputs to the function provided, and updates the result contained in the ref accordingly.
 * 
 * @param source the inputs to react to
 * @param pipe the function to run when the inputs change
 * @param options optional settings
 * @returns ref to the result
 */
export function useReactiveChain<Inputs, T, E extends ErrorBase = ErrorBase>(source: WatchSource<Inputs>, pipe: FlatChainStep<Inputs, T, E>, options: ReactiveProcessOptions = { immediate: true }): Ref<AsyncResult<T, E>> {
    const result = new AsyncResult<T, E>();
    const resultRef = useAsyncResultRef(result);

    let unsub: (() => void) | null = null;

    watch(source, (newInputs) => {
        unsub?.();
        unsub = result.mirror(pipe(newInputs));
    }, { immediate: options.immediate });

    onUnmounted(() => {
        unsub?.();
    });

    return resultRef;
}


// === Vue Composables for Actions ===

/**
 * The return type of useLazyAction.
 */
export interface LazyActionRef<T, E extends ErrorBase = ErrorBase, P = unknown> {
    resultRef: Ref<AsyncResult<T, E, P>>;
    trigger: () => void;
}

/**
 * Executes an action immediately and returns a ref to the AsyncResult representing the action's state.
 * 
 * Same as useAsyncResultRefFromPromise(action()).
 * 
 * @param action the action to execute immediately
 * @returns a ref to the AsyncResult representing the action's state
 */
export function useAction<T, E extends ErrorBase = ErrorBase, P = unknown>(action: Action<T, E, P>): Ref<AsyncResult<T, E, P>> {
    return useAsyncResultRef(AsyncResult.fromAction(action));
}

/**
 * Creates a lazy action that can be triggered manually.
 * 
 * Same as AsyncResult.makeLazyAction(action), but the AsyncResult is wrapped in a ref for Vue reactivity.
 * 
 * @param action the action to execute when triggered
 * @returns an object containing a ref to the AsyncResult and a trigger function
 */
export function useLazyAction<T, E extends ErrorBase = ErrorBase, P = unknown>(action: Action<T, E, P>): LazyActionRef<T, E, P> {
    const lazyAction = AsyncResult.makeLazyAction<T, E, P>(action);
    const resultRef = useAsyncResultRef(lazyAction.result);

    return { resultRef, trigger: lazyAction.trigger };
}


// === Vue Composables for Generators ===

/**
 * Runs a generator function immediately and returns a ref to the AsyncResult representing the generator's state.
 * @param generatorFunc the generator function to run immediately
 * @returns a ref to the AsyncResult representing the generator's state
 */
export function useGenerator<T, P = unknown>(generatorFunc: (notifyProgress?: (progress: P) => void) => AsyncResultGenerator<T>): Ref<AsyncResult<T, any, P>> {
    const resultRef = useAsyncResultRef(AsyncResult.run(generatorFunc));
    return resultRef;
}

/**
 * Creates a lazy generator that can be triggered manually.
 * 
 * @param generatorFunc the generator function to run when triggered
 * @returns an object containing a ref to the AsyncResult and a trigger function
 */
export function useLazyGenerator<T, P = unknown>(generatorFunc: (notifyProgress: (progress: P) => void) => AsyncResultGenerator<T>): { resultRef: Ref<AsyncResult<T, any, P>>, trigger: () => void } {
    const result = new AsyncResult<T, any, P>();
    const resultRef = useAsyncResultRef(result);

    const trigger = () => {
        result.runInPlace((notifyProgress) => generatorFunc(notifyProgress));
    }

    return { resultRef, trigger };
}

/**
 * Watches a source, gives it as inputs to the generator function provided, and updates the result contained in the ref accordingly.
 * 
 * @param source the inputs to react to
 * @param generatorFunc the generator function to run when the inputs change
 * @param options optional settings
 * @returns ref to the result
 */
export function useReactiveGenerator<Inputs, T, E extends ErrorBase = ErrorBase, P = unknown>(source: WatchSource<Inputs>, generatorFunc: (args: Inputs, notifyProgress: (progress: P) => void) => AsyncResultGenerator<T>, options: ReactiveProcessOptions = { immediate: true }): Ref<AsyncResult<T, E, P>> {
    const resultRef = useAsyncResultRef(new AsyncResult<T, E, P>());

    watch(source, (newInputs) => {
        resultRef.value.runInPlace((notifyProgress) => generatorFunc(newInputs, notifyProgress));
    }, { immediate: options.immediate });

    return resultRef;
}


// === Vue Composables for AsyncResultCollection ===

/**
 * Creates a reactive AsyncResultCollection wrapped in a Vue ref.
 * The AsyncResultCollection notifies Vue's reactivity system whenever its state changes.
 * 
 * @template T - The type of the values in the AsyncResultCollection.
 * @template E - The type of the error, extending ErrorBase (default is ErrorBase).
 * @returns a ref to the AsyncResultCollection
 */
export function useAsyncResultCollection<T = any, E extends ErrorBase = ErrorBase>() {
    const list = new AsyncResultCollection<T, E>();
    const listRef = ref(list);

    list.listen(() => {
        triggerRef(listRef);
    });

    return listRef;
}