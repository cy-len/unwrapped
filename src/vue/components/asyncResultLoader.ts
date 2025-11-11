import { defineComponent, ref, watch, onUnmounted, h, type VNode } from "vue"
import type { AsyncResult, AsyncResultState } from "unwrapped/core"

export const AsyncResultLoader = defineComponent({
    name: "AsyncResultLoader",

    props: {
        result: {
            type: Object as () => AsyncResult<unknown, unknown>,
            required: true
        }
    },

    setup(props, { slots }) {
        const state = ref<AsyncResultState<unknown, unknown>>(props.result.state)
        let unlisten: (() => void) | null = null

        // Unsubscribe on destroy
        onUnmounted(() => {
            if (unlisten) unlisten()
        })

        // Watch for prop changes & update listener
        watch(
            () => props.result,
            (newResult) => {
                if (unlisten) unlisten()
                state.value = newResult.state
                unlisten = newResult.listen((res) => {
                    state.value = res.state
                })
            },
            { immediate: true }
        )

        return () => {
            const s = state.value

            // Choose what to render based on status
            switch (s.status) {
                case "loading":
                    return slots.loading
                        ? slots.loading()
                        : h("div", { class: "loading" }, "Loading…")

                case "error":
                    return slots.error
                        ? slots.error({ error: s.error })
                        : h("div", { class: "error" }, `Error: ${s.error}`)

                case "success":
                    return slots.default
                        ? slots.default({ value: s.value })
                        : null

                default:
                    // "idle"
                    return slots.idle
                        ? slots.idle()
                        : h("div", { class: "idle" }, "Idle")
            }
        }
    }
})

interface CustomSlots<E> {
    loading?: () => VNode;
    error?: (props: { error: E }) => VNode;
}

export function buildCustomAsyncResultLoader<T, E>(slots: CustomSlots<E>) {
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
