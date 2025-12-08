import { AsyncResult } from "./asyncResult";

export function delay(ms: number): AsyncResult<true> {
    return AsyncResult.fromValuePromise(new Promise(resolve => {
        setTimeout(() => resolve(true), ms);
    }));
}