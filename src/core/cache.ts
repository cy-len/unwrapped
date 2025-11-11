import { AsyncResult, type AsyncResultState, type ChainStep } from "./asyncResult";
import type { ErrorBase } from "./error";

type KeyedAsyncCacheRefetchOptions = {
    policy: 'refetch' | 'if-error' | 'no-refetch';
};

type CacheItem<P, V, E extends ErrorBase = ErrorBase> = {
    result: AsyncResult<V, E>;
    fetcherParams: P;
    valid: boolean;
    lastFetched?: number;
    ttl?: number;
};

const _defaultRefetchOptions: KeyedAsyncCacheRefetchOptions = { policy: 'no-refetch' };

function defaultParamsToKey<P>(params: P): string {
    if (typeof params === 'object') {
        return JSON.stringify(params);
    }
    return String(params);
}

/**
 * A cache for asynchronous operations that maps parameter sets to their corresponding AsyncResult.
 * Supports automatic refetching based on specified policies.
 * 
 * @template P - The type of the parameters used to fetch values.
 * @template V - The type of the values being fetched.
 * @template E - The type of the error, extending ErrorBase (default is ErrorBase).
 */
export class KeyedAsyncCache<P, V, E extends ErrorBase = ErrorBase> {
    private _cache: Map<string, CacheItem<P, V, E>> = new Map();
    private _fetcher: ChainStep<P, V, E>;
    private _paramsToKey: (params: P) => string;
    private _cacheTTL?: number;

    /**
     * Creates a new KeyedAsyncCache instance.
     * @param fetcher the function used to fetch values based on parameters
     * @param paramsToKey a function that converts parameters to a unique string key (default uses JSON.stringify for objects)
     * @param cacheTTL optional time-to-live for cache entries in milliseconds
     */
    constructor(fetcher: ChainStep<P, V, E>, paramsToKey: (params: P) => string = defaultParamsToKey, cacheTTL: number = Infinity) {
        this._fetcher = fetcher;
        this._paramsToKey = paramsToKey;
        this._cacheTTL = cacheTTL;
    }

    private makeCacheItem(result: AsyncResult<V, E>, fetcherParams: P, ttl?: number | undefined): CacheItem<P, V, E> {
        return {
            result,
            fetcherParams,
            ttl: ttl ?? this._cacheTTL,
            valid: true,
        };
    }

    private shouldRefetch(existingResult: CacheItem<P, V, E>, refetch: KeyedAsyncCacheRefetchOptions): boolean {
        if (!existingResult.valid) {
            return true;
        }
        if (refetch.policy === 'refetch') {
            return true;
        }
        if (refetch.policy === 'if-error') {
            return existingResult.result.state.status === 'error';
        }
        if (existingResult.ttl !== undefined && existingResult.lastFetched !== undefined) {
            const now = Date.now();
            if (now - existingResult.lastFetched > existingResult.ttl) {
                return true;
            }
        }
        return false;
    }

    private updateOrCreateCacheItemFromParams(params: P, cacheItem?: CacheItem<P, V, E>) {
        const promise = Promise.resolve(this._fetcher(params));
        let result = cacheItem?.result.updateFromResultPromise(promise) ?? AsyncResult.fromResultPromise(promise);
        cacheItem = cacheItem ?? this.makeCacheItem(result, params);
        
        promise.then(() => {
            cacheItem.lastFetched = Date.now();
        });

        return cacheItem;
    }

    /**
     * Gets the AsyncResult for the given parameters, fetching it if not cached or if refetching is required.
     * @param params the parameters to fetch the value
     * @param refetch options determining whether to refetch the value
     * @returns the AsyncResult corresponding to the given parameters
     */
    get(params: P, refetch: KeyedAsyncCacheRefetchOptions = _defaultRefetchOptions): AsyncResult<V, E> {
        const key = this._paramsToKey(params);
        if (this._cache.has(key)) {
            const cacheItem = this._cache.get(key)!;
            if (!this.shouldRefetch(cacheItem, refetch)) {
                return cacheItem.result;
            } else {
                this.updateOrCreateCacheItemFromParams(params, cacheItem);
                return cacheItem.result;
            }
        }
        
        const cacheItem = this.updateOrCreateCacheItemFromParams(params);
        this._cache.set(key, cacheItem);
        return cacheItem.result;
    }

    /**
     * Gets the settled state of the AsyncResult for the given parameters, fetching it if not cached or if refetching is required.
     * Waits for the AsyncResult to settle before returning its state.
     * @param params the parameters to fetch the value
     * @param refetch options determining whether to refetch the value
     * @returns a promise resolving to the settled state of the AsyncResult
     */
    async getSettledState(params: P, refetch: KeyedAsyncCacheRefetchOptions = _defaultRefetchOptions): Promise<AsyncResultState<V, E>> {
        const asyncResult = this.get(params, refetch);
        await asyncResult.waitForSettled();
        return asyncResult.state;
    }

    /**
     * Checks if any cached AsyncResult is currently loading.
     * @returns whether any cached AsyncResult is loading
     */
    anyLoading(): boolean {
        for (const cacheItem of this._cache.values()) {
            if (cacheItem.result.isLoading()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Clears the entire cache.
     */
    clear() {
        this._cache.clear();
    }

    /**
     * Invalidates the cache entry for the given key.
     * @param key the key of the cache entry to invalidate
     */
    invalidateKey(key: string) {
        if (this._cache.has(key)) {
            const cacheItem = this._cache.get(key)!;
            cacheItem.valid = false;
        }
    }

    /**
     * Invalidates the cache entry for the given parameters.
     * @param params the parameters of the cache entry to invalidate
     */
    invalidateParams(params: P) {
        const key = this._paramsToKey(params);
        this.invalidateKey(key);
    }

    /**
     * Invalidates all cache entries.
     */
    invalidateAll() {
        for (const cacheItem of this._cache.values()) {
            cacheItem.valid = false;
        }
    }
}
