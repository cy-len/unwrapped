import { defineComponent, watch, h, type VNode, type SlotsType } from "vue"
import { ErrorBase, type AsyncResult } from "unwrapped/core"
import { useAsyncResultRef } from "../composables"

interface CustomSlots<E extends ErrorBase = ErrorBase> {
    loading?: () => VNode;
    error?: (props: { error: E }) => VNode;
    idle?: () => VNode;
}

/**
 * Factory function to create a component that displays different content based on an AsyncResult's state. Provides slots for loading, error, idle, and success states and passes the relevant data to each slot, and are typed appropriately.
 * @param slots predefined slots for loading, error, and idle states. Useful for not having to repeat the same template for displaying a framework-specific spinner while in loading state, or a custom error message.
 * @param name Optional internal name for the component
 * @returns An instantiable component that accepts an AsyncResult prop and a default slot for the success state.
 * 
 * @example
 * // loaders.ts - Create reusable loader with default loading/error UI
 * const MyLoader = makeAsyncResultLoader({
 *   loading: () => h(Spinner),
 *   error: ({ error }) => h(ErrorDisplay, { error }),
 *   idle: () => h('div', 'Ready')
 * });
 * 
 * // MyPage.vue - Use the loader with custom success content
 * <MyLoader :result="myAsyncResult">
 *   <template #default="{ value }">
 *     <UserProfile :user="value" />
 *   </template>
 * </MyLoader>
 */
export function makeAsyncResultLoader<T, E extends ErrorBase = ErrorBase>(slots: CustomSlots<E>, name = "AsyncResultLoader") {
    return defineComponent({
        name,
        props: {
            result: {
                type: Object as () => AsyncResult<T, E>,
                required: true
            }
        },
        slots: Object as SlotsType<CustomSlots<E> & { default: { value: T } }>,
        setup(props, context) {
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

                const renderDefault = context.slots.default ?? (() => h("div", { class: "success" }, "Success"));
                const renderError = context.slots.error ?? slots.error ?? (() => h("div", { class: "error" }, "Error"));
                const renderLoading = context.slots.loading ?? slots.loading ?? (() => h("div", { class: "loading" }, "Loading…"));
                const renderIdle = context.slots.idle ?? slots.idle ?? (() => h("div", { class: "idle" }, "Idle"));

                // Choose what to render based on status
                switch (s.status) {
                    case "loading":
                        return renderLoading();

                    case "error":
                        return renderError({ error: s.error });

                    case "success":
                        return renderDefault({ value: s.value });

                    default:
                        return renderIdle();
                }
            }
        }
    })
}