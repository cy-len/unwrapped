import { computed, onUnmounted, ref, toRef, triggerRef, watch, type Ref, type WatchSource } from "vue";
import { AsyncResult, type FlatChainFunction, type Result } from "unwrapped/core";

export function useAsyncResultRef<T, E>(asyncResult: AsyncResult<T, E>) {
  const state = ref<AsyncResult<T, E>>(asyncResult) as Ref<AsyncResult<T, E>>;

  const unsub = asyncResult.listen(() => {
    triggerRef(state);
  });

  onUnmounted(() => {
    unsub();
  });

  return state;
}

export function useReactiveResult<T, E, Inputs>(source: WatchSource<Inputs>, pipe: FlatChainFunction<Inputs, T, E>, options:{ immediate: boolean } = { immediate: true }): Ref<AsyncResult<T, E>> {
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

export function useAsyncResultRefFromPromise<T, E>(promise: Promise<Result<T, E>>) {
  return useAsyncResultRef(AsyncResult.fromResultPromise(promise));
}

export type Action<T,E> = () => Promise<Result<T, E>>;
export function useImmediateAction<T, E>(action: Action<T, E>): Ref<AsyncResult<T, E>> {
  return useAsyncResultRefFromPromise(action());
}
export interface LazyActionReturn<T, E> {
  resultRef: Ref<AsyncResult<T, E>>;
  trigger: () => void;
}

export function useLazyAction<T, E>(action: Action<T, E>): LazyActionReturn<T, E> {
  const result = new AsyncResult<T, E>();
  const resultRef = useAsyncResultRef(result);

  const trigger = () => {
    result.updateFromResultPromise(action());
  }

  return { resultRef, trigger };
}

export function useReactiveAction<I, O, E>(input: I | Ref<I> | (() => I), pipe: FlatChainFunction<I, O, E>, options:{ immediate: boolean } = { immediate: true }): Ref<AsyncResult<O, E>> {
  const source = typeof input === 'function' ? computed(input as () => I) : toRef(input)

  const outputRef = ref<AsyncResult<O, E>>(new AsyncResult()) as Ref<AsyncResult<O, E>>;
  let unsub: (() => void) | null = null;

  watch(source, () => {
    unsub?.();
    const newOutput = pipe(source.value);
    unsub = newOutput.listen((newState) => {
      outputRef.value.setState(newState.state);
      triggerRef(outputRef);
    });
  }, { immediate: options.immediate });

  onUnmounted(() => {
    unsub?.();
  });

  return outputRef;
}

export function useGenerator<T>(generatorFunc: () => Generator<AsyncResult<any, any>, T, any>): Ref<AsyncResult<T, any>> {
  const resultRef = useAsyncResultRef(AsyncResult.run(generatorFunc));
  return resultRef;
}

export function useLazyGenerator<T>(generatorFunc: () => Generator<AsyncResult<any, any>, T, any>): { resultRef: Ref<AsyncResult<T, any>>, trigger: () => void } {
  const result = new AsyncResult<T, any>();
  const resultRef = useAsyncResultRef(result);

  const trigger = () => {
    result.runInPlace(generatorFunc);
  }

  return { resultRef, trigger };
}

export function useReactiveGenerator<T, E, Inputs>(source: WatchSource<Inputs>, generatorFunc: (args: Inputs) => Generator<AsyncResult<any, any>, T, any>, options:{ immediate: boolean } = { immediate: true }): Ref<AsyncResult<T, E>> {
  const resultRef = useAsyncResultRef(new AsyncResult<T, E>());

  watch(source, (newInputs) => {
    resultRef.value.runInPlace(() => generatorFunc(newInputs));
  }, { immediate: options.immediate });

  return resultRef;
}