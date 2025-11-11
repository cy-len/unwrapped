import { defineComponent, watch, h, type VNode } from "vue"
import type { AsyncResult, ErrorBase } from "unwrapped/core"
import { useAsyncResultRef } from "../composables"

/**
 * A Vue component that displays different content based on the state of an AsyncResult.
 * It supports slots for 'loading', 'error', 'success' (default), and 'idle' states.
 * 
 * @example
 * <AsyncResultLoader :result="myAsyncResult">
 *   <template #loading>
 *     <div>Loading data...</div>
 *   </template>
 *   <template #error="{ error }">
 *     <div>Error occurred: {{ error.message }}</div>
 *   </template>
 *   <template #default="{ value }">
 *     <div>Data loaded: {{ value }}</div>
 *   </template>
 *   <template #idle>
 *     <div>Waiting to start...</div>
 *   </template>
 * </AsyncResultLoader>
 */
export const AsyncResultLoader = defineComponent({
    name: "AsyncResultLoader",

    props: {
        result: {
            type: Object as () => AsyncResult<unknown>,
            required: true
        }
    },

    setup(props, { slots }) {
        let resultRef = useAsyncResultRef(props.result);

        // Watch for prop changes & update listener
        watch(
            () => props.result,
            (newResult, oldResult) => {
                if (newResult === oldResult) return;
                resultRef = useAsyncResultRef(newResult);
            },
            { immediate: true }
        )

        return () => {
            const s = resultRef.value.state;

            // Choose what to render based on status
            switch (s.status) {
                case "loading":
                    return slots.loading
                        ? slots.loading()
                        : h("div", { class: "loading" }, "Loading…");

                case "error":
                    return slots.error
                        ? slots.error({ error: s.error })
                        : h("div", { class: "error" }, `Error: ${s.error}`);

                case "success":
                    return slots.default
                        ? slots.default({ value: s.value })
                        : null;

                default:
                    // "idle"
                    return slots.idle
                        ? slots.idle()
                        : h("div", { class: "idle" }, "Idle");
            }
        }
    }
})



interface CustomSlots<E extends ErrorBase = ErrorBase> {
    loading?: () => VNode;
    error?: (props: { error: E }) => VNode;
}

/**
 * Builds a custom AsyncResultLoader component with predefined slots for loading and error states.
 * 
 * Useful for creating reusable components with consistent loading and error handling UI (eg. framework-specific spinners, etc...).
 * 
 * @param slots the custom slots for loading and error states
 * @returns a Vue component that uses the provided slots
 */
export function buildCustomAsyncResultLoader<T, E extends ErrorBase = ErrorBase>(slots: CustomSlots<E>) {
    const comp = defineComponent({
        name: "CustomAsyncResultLoader",
        props: {
            result: {
                type: Object as () => AsyncResult<T, E>,
                required: true
            }
        },
        setup(props, context) {
            return () => {
                const renderLoading = context.slots.loading ?? slots.loading ?? (() => undefined);
                const renderError = context.slots.error ?? slots.error ?? (() => undefined);
                return h(
                    AsyncResultLoader,
                    { result: props.result },
                    {
                        default: context.slots.default ? (propsDefault: { value: T }) => context.slots.default!(propsDefault) : undefined,

                        loading: () => renderLoading(),
                        error: ((propsError: { error: E }) => renderError(propsError))
                    }
                )
            }
        }
    });

    return comp;
}
