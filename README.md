# Unwrapped

A TypeScript library for elegant error handling and asynchronous state management, inspired by Rust's `Result` type and designed with Vue 3 integration in mind.

## Overview

**Unwrapped** provides a robust alternative to `try/catch` blocks and promise chains, making error handling explicit, type-safe, and composable. It consists of two main parts:

- **Core**: Framework-agnostic utilities for managing results and async operations
- **Vue**: Vue 3 composables and components for reactive async state management

## Installation

```bash
npm install unwrapped
```

## Core Concepts

### `Result<T, E>`

A `Result` represents a synchronous operation that can either succeed with a value of type `T` or fail with an error of type `E`.

#### **Basic Usage:**

```typescript
import { Result, ErrorBase } from 'unwrapped/core';

function divide(a: number, b: number): Result<number> {
    if (b === 0) {
        return Result.errTag("division_by_zero", "Can't divide by 0 !");
    }

    return Result.ok(a / b);
}

const shouldSucceed = divide(10, 2);
const shouldError = divide(10, 0);

// Checking status
if (shouldSucceed.isSuccess()) {
    console.log("Success !");
}
if (shouldError.isError()) {
    console.log("Error !");
}

// Unwrapping values
const value = shouldSucceed.unwrapOrNull(); // 5
const valueOrDefault = shouldError.unwrapOr(0); // Returns 0 since it's an error
const valueOrThrow = shouldSucceed.unwrapOrThrow();
```

#### **Working with Promises:**

```typescript
// Wrap a promise and catch errors
const result = await Result.tryPromise(
    fetch("/api/data").then(r => r.json(),
    (error) => new ErrorBase("fetch_error", "Failed to fetch data", error)
);

// Execute an async function
const result = await Result.tryFunction(
    async () => {
        const response = await fetch("/api/data");
        return response.json();
    },
    (error) => new ErrorBase("fetch_error", "Failed to fetch data", error)
);
```

#### **Chaining Operations:**

```typescript
function validateAge(age: number): Result<number, ErrorBase> {
    if (age < 0) {
        return Result.err(new ErrorBase("invalid_age", "Age must be positive"));
    }
    return Result.ok(age);
}

function categorizeAge(age: number): Result<string, ErrorBase> {
    if (age < 18) return Result.ok('minor');
    if (age < 65) return Result.ok('adult');
    return Result.ok('senior');
}

// Chain operations - stops at first error
const valid = Result.ok(25)
    .flatChain(validateAge) // 25 is a valid age so execution continues
    .flatChain(categorizeAge); // 25 is passed to categorizeAge

const invalid = Result.ok(-1)
    .flatChain(validateAge) // -1 is not a valid age, so the chain short-circuits and returns a Result containing the error given by validateAge
    .flatChain(categorizeAge) // categorizeAge does not get called

console.log(valid.state); // { status: "success", value: "adult" }
console.log(invalid.state); // { status: "error", value: <ErrorBase> }
```

#### **Generator Syntax for Complex Flows:**

The same way async/await allows to write asynchronous code in a synchronous-looking way, generators can be used to write result chaining in a more imperative-looking manner via `Result.run()`.

Think of `function*` as `async function` and `yield*` as `await`. Inside a generator function executed by `Result.run()`, yielding a `Result` with `yield*` unwraps the `Result` and allows you to get its value if it is successful. If the `Result` contains an error, the whole generator will terminate and `Result.run()` will return a `Result` containing the error.

Note that in the case of `Result.run()`, everything is synchronous. For performing the same kind of operations on asynchronous tasks, use `AsyncResult.run()`.

```typescript

const valid = Result.run(function* () {
    const validatedAge = yield* validateAge(10); // 10 is a valid age so validatedAge is set to 10 and execution continues
    const category = yield* categorizeAge(validateAge); // yield* unwraps the value so category is set to "minor"
    
    return category;
});

const invalid = Result.run(function* () {
    const validatedAge = yield* validateAge(-1); // -1 is not a valid age so the run terminates early and returns a Result containing the error given by validateAge
    const category = yield* categorizeAge(validateAge); // this never gets reached
    
    return category;
})

// If any step fails, the error is automatically propagated
if (invalid.isError()) {
    console.error(result.state.error);
}
```

### `AsyncResult<T, E>`

An `AsyncResult` represents an asynchronous operation with four possible states: `idle`, `loading`, `success`, or `error`.

#### **Basic Usage:**

```typescript
import { AsyncResult, Result } from 'unwrapped/core';

// Create from a promise that returns a Result
const asyncResult = AsyncResult.fromResultPromise(
  fetch('/api/user')
    .then(r => r.json())
    .then(data => Result.ok(data))
    .catch(err => Result.err(new ErrorBase('API_ERROR', 'Failed to fetch', err)))
);

// Create from a plain promise
const asyncResult = AsyncResult.fromValuePromise(
  fetch('/api/user').then(r => r.json())
);

// Check current state
console.log(asyncResult.isLoading()); // true
console.log(asyncResult.isSuccess()); // false

// Listen to state changes
asyncResult.listen((result) => {
  if (result.isSuccess()) {
    console.log('Data loaded:', result.unwrapOrNull());
  } else if (result.isError()) {
    console.error('Error:', result.state.error);
  }
});

// Wait for completion
const settledResult = await asyncResult.waitForSettled();
const value = settledResult.unwrapOrNull();
```

#### **Lazy Actions:**

```typescript
// Create an action that doesn't execute until triggered
const { trigger, result } = AsyncResult.makeLazyAction(async () => {
    const response = await fetch('/api/data');
    const data = await response.json();
    return Result.ok(data);
});

// Listen for changes
result.listen((r) => {
    console.log('State:', r.state.status);
});

// Trigger execution
trigger();
```

#### **Chaining Async Operations:**

```typescript
const userResult = AsyncResult.fromValuePromise(fetch('/api/user/1').then(r => r.json()));

// Chain with another async operation
const postsResult = userResult.chain(async (user) => {
    const response = await fetch(`/api/posts?userId=${user.id}`);
    const posts = await response.json();
    return Result.ok(posts);
});

// FlatChain with AsyncResult
const enrichedPosts = postsResult.flatChain((posts) => {
    return AsyncResult.fromValuePromise(
        Promise.all(posts.map(p => enrichPost(p)))
    );
});
```

#### **Generator Syntax for Async Operations:**

```typescript
function fetchUser(id: string): AsyncResult<User> {
    // ...
}

function fetchProfile(id: string): AsyncResult<Profile> {
    // ...
}

const result = AsyncResult.run(function* () {
    const user = yield* fetchUser(userId);
    const profile = yield* fetchProfile(user.profileId);

    return { user, profile };
});

// result is an AsyncResult that automatically tracks loading/success/error states
result.debug("Profile fetcher");
```

#### **Ensuring Multiple AsyncResults:**

```typescript
// Wait for multiple AsyncResults to complete
const user: AsyncResult<User> = fetchUser(userId);
const settings: AsyncResult<Settings> = AsyncResult.fromValuePromise(fetchSettings());

const all = AsyncResult.ensureAvailable([user, settings]);

all.listen((result) => {
  if (result.isSuccess()) {
    const [userData, settingsData] = result.unwrapOrThrow();
    console.log('All data loaded', { userData, settingsData });
  }
});
```

### `KeyedAsyncCache<P, V, E>`

A cache for asynchronous operations that maps parameters to their results, with support for automatic refetching.

**Usage:**

```typescript
import { KeyedAsyncCache, Result } from 'unwrapped/core';

// Create a cache with a fetcher function
const userCache = new KeyedAsyncCache(
    async (userId: number) => Result.tryFunction(
        async () => {
            const response = await fetch(`/api/users/${userId}`);
            const data = await response.json();
            return data;
        },
        (e) => new ErrorBase("fetch_error", "Error on fetch", e)
    ),
    (userId) => `user-${userId}`, // Key generator
    60000 // TTL: 60 seconds
);

// Get cached or fetch
const userResult = userCache.get(123); // Returns AsyncResult

// Get with refetch policy
const freshUser = userCache.get(123, { policy: 'refetch' });
const errorRetry = userCache.get(456, { policy: 'if-error' });

// Check if any request is loading
if (userCache.anyLoading()) {
    console.log('Loading data...');
}

// Invalidate cache
userCache.invalidateParams(123);
userCache.invalidateAll();
userCache.clear();
```

### `ErrorBase`

A structured error class that provides consistent error handling with codes, messages, and automatic logging.

```typescript
import { ErrorBase } from 'unwrapped/core';

// Create an error
const error = new ErrorBase(
    'VALIDATION_ERROR',
    'Email address is invalid',
    originalError, // Optional: the caught error
    true // Optional: whether to log immediately (default: true)
);

// Access error properties
console.log(error.code); // 'VALIDATION_ERROR'
console.log(error.message); // 'Email address is invalid'
console.log(error.toString()); // 'Error VALIDATION_ERROR: Email address is invalid'

// Log the error
error.logError();

// Use with Result
const result = Result.err(error);
```

## Vue Integration

The Vue package provides composables and components for seamless integration with Vue 3's reactivity system.

### Composables

#### `useAsyncResultRef(asyncResult)`

Makes an `AsyncResult` reactive by wrapping it in a Vue ref:

```typescript
import { AsyncResult } from 'unwrapped/core';
import { useAsyncResultRef } from 'unwrapped/vue';

const asyncResult = AsyncResult.fromValuePromise(fetch('/api/data').then(r => r.json()));
const resultRef = useAsyncResultRef(asyncResult);
```

```vue
<template>
  <div v-if="resultRef.isLoading()">Loading...</div>
  <div v-else-if="resultRef.isSuccess()">
    Data: {{ resultRef.unwrapOrNull() }}
  </div>
  <div v-else-if="resultRef.isError()">
    Error: {{ resultRef.state.error.message }}
  </div>
</template>
```

#### `useAction(action)`

Executes an action immediately and returns a reactive AsyncResult:

```typescript
import { useAction } from 'unwrapped/vue';
import { Result } from 'unwrapped/core';

const resultRef = useAction(async () => Result.tryFunction(
    async () => {
        const response = await fetch('/api/data');
        const data = await response.json();
        return data;
    },
    (e) => new ErrorBase("fetch_error", "Error on fetch", e)
));
    
```

#### `useLazyAction(action)`

Creates a lazy action that can be triggered manually:

```typescript
import { useLazyAction } from 'unwrapped/vue';
import { Result } from 'unwrapped/core';

const { resultRef, trigger } = useLazyAction(async () => Result.tryFunction(
    async () => {
        const response = await fetch('/api/data');
        const data = await response.json();
        return data;
    },
    (e) => new ErrorBase("fetch_error", "Error on fetch", e)
));
```

```vue
<template>
  <button @click="trigger">Load Data</button>
  <div v-if="resultRef.isLoading()">Loading...</div>
  <div v-else-if="resultRef.isSuccess()">{{ resultRef.unwrapOrNull() }}</div>
</template>
```

#### `useReactiveChain(source, pipe, options)`

Creates a reactive pipeline that automatically updates when the source changes:

```typescript
import { ref } from 'vue';
import { useReactiveChain } from 'unwrapped/vue';
import { AsyncResult, Result } from 'unwrapped/core';

const userId = ref(1);

const userResultRef = useReactiveChain(
    () => userId.value,
    (id) => AsyncResult.fromValuePromise(
    fetch(`/api/users/${id}`).then(r => r.json())
    ),
    { immediate: true }
);
```

#### `useGenerator(generatorFunc)` / `useLazyGenerator(generatorFunc)`

Run generator functions with reactive AsyncResults:

```typescript
import { useGenerator } from 'unwrapped/vue';
import { AsyncResult } from 'unwrapped/core';

const resultRef = useGenerator(function* () {
    const user = yield* AsyncResult.fromValuePromise(fetchUser());
    const posts = yield* AsyncResult.fromValuePromise(fetchPosts(user.id));
    return { user, posts };
});
```

#### `useReactiveGenerator(source, generatorFunc, options)`

Reactive generator that reruns when source changes:

```typescript
import { ref } from 'vue';
import { useReactiveGenerator } from 'unwrapped/vue';
import { AsyncResult } from 'unwrapped/core';

const searchQuery = ref('');

const resultsRef = useReactiveGenerator(
    () => searchQuery.value,
    function* (query) {
    if (!query) return [];
    
    const results = yield* AsyncResult.fromValuePromise(
        fetch(`/api/search?q=${query}`).then(r => r.json())
    );
    
    return results;
    }
);
```

### Components

#### `<AsyncResultLoader>`

A component that renders different content based on AsyncResult state:

```vue
<template>
  <AsyncResultLoader :result="dataResult">
    <template #loading>
      <div class="spinner">Loading...</div>
    </template>
    
    <template #error="{ error }">
      <div class="error-message">
        Error {{ error.code }}: {{ error.message }}
      </div>
    </template>
    
    <template #default="{ value }">
      <div class="data">{{ value }}</div>
    </template>
    
    <template #idle>
      <div>Click the button to load data</div>
    </template>
  </AsyncResultLoader>
</template>

<script setup>
import { AsyncResultLoader } from 'unwrapped/vue';
import { useLazyAction } from 'unwrapped/vue';
import { Result } from 'unwrapped/core';

const { resultRef: dataResult, trigger: loadData } = useLazyAction(async () => {
    const response = await fetch('/api/data');
    const data = await response.json();
    return Result.ok(data);
});
</script>
```

#### `buildCustomAsyncResultLoader(slots)`

Create reusable loaders with consistent loading and error UI:

```typescript
import { buildCustomAsyncResultLoader } from 'unwrapped/vue';
import { h } from 'vue';
import Spinner from './Spinner.vue';
import ErrorAlert from './ErrorAlert.vue';

export const CustomLoader = buildCustomAsyncResultLoader({
    loading: () => h(Spinner),
    error: ({ error }) => h(ErrorAlert, { error })
});
```

```vue
<template>
  <CustomLoader :result="myAsyncResult">
    <template #default="{ value }">
      <!-- Your success content -->
      <div>{{ value }}</div>
    </template>
  </CustomLoader>
</template>
```

## Real-World Examples

TODO

## Why Unwrapped ?

Todo

### Why not Effect ?
todo

## API Reference

### Core Module (`unwrapped/core`)

- **`Result<T, E>`**: Synchronous result type
- **`AsyncResult<T, E>`**: Asynchronous result with state tracking
- **`ErrorBase`**: Base error class with structured logging
- **`KeyedAsyncCache<P, V, E>`**: Cache for async operations

### Vue Module (`unwrapped/vue`)

- **Composables**: `useAsyncResultRef`, `useAction`, `useLazyAction`, `useReactiveChain`, `useGenerator`, `useLazyGenerator`, `useReactiveGenerator`
- **Components**: `AsyncResultLoader`, `buildCustomAsyncResultLoader`

## License

LGPL-3.0-or-later

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.