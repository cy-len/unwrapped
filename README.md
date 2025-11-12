# Unwrapped

A TypeScript library for handling more gracefully synchronous and asynchronous operations that can fail via Result types. Provides also utilities for caching and binding for popular web frameworks.

## Overview

Error handling in TypeScript is fundamentally built around throwing exceptions and catching them with try/catch blocks. This works fine for simple scripts where an unexpected error should crash the program, but modern applications—especially frontends—need to handle errors gracefully without crashing the entire app.

**Unwrapped** provides a different approach by providing Result types, with variants for both synchronous and asynchronous operations.
While their primary and most basic use are for describing the result of operations that may fail, they can be chained to describe chains of operations, with build-in short-circuiting when encoutering an error. These chains can be described either by successively calling methods like `.chain()`, or by using a generator syntax inspired by Effect (although much simplified).

Without **Unwrapped**, the traditional approach leads to scattered state management: separate variables for loading, error, and data, manual state transitions, and the ever-present risk of forgetting to set loading = false in a finally block. Error types are unknown, forcing type assertions everywhere. Chaining multiple async operations that can each fail becomes a mess of nested try/catch blocks or promise chains with multiple .catch() handlers.

On the contrary, **Unwrapped**'s AsyncResult type wraps loading, error, and success states in one type allowing for a much leaner and less error prone way of writing. Unsettled asynchronous operations will always give you an AsyncResult in a loading state, and when this work finishes, the AsyncResult will always be in a settled state, being either error or success.

**Unwrapped** is composed of multiple sub-modules :

- **Core**: Framework-agnostic utilities for managing results and async operations
- **Vue**: Vue 3 composables and components for reactive async state management

You can take a look at the Real world example section at the end of this document to see how Unwrapped can simplify your development.

A brief comparison with other libraries can be found at the "Why Unwrapped ?" section at the end of the document.

## Installation

```bash
npm install unwrapped
```

## API Reference

### Core Module (`unwrapped/core`)

- **`Result<T, E>`**: Synchronous result type
- **`AsyncResult<T, E>`**: Asynchronous result with state tracking
- **`ErrorBase`**: Base error class with structured logging
- **`KeyedAsyncCache<P, V, E>`**: Cache for async operations

### Vue Module (`unwrapped/vue`)

- **Composables**: `useAsyncResultRef`, `useAction`, `useLazyAction`, `useReactiveChain`, `useGenerator`, `useLazyGenerator`, `useReactiveGenerator`
- **Components**: `AsyncResultLoader`, `buildCustomAsyncResultLoader`


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

### Simple data fetching (Vue 3)

#### **Without** Unwrapped

```vue
<template>
    <div>
        <!-- Manually handle each state -->
        <div v-if="loading">Loading user...</div>
        <div v-else-if="error" class="error">
            Error: {{ error.message }}
        </div>
        <div v-else-if="user">
            <h2>{{ user.name }}</h2>
            <p>{{ user.email }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

// Need separate refs for each state
const user = ref(null);
const loading = ref(false);
const error = ref(null);

onMounted(async () => {
    // Manually manage loading state
    loading.value = true;
    error.value = null;

    try {
        const response = await fetch('/api/user/1');
        if (!response.ok) throw new Error('Failed to fetch');
        user.value = await response.json();
    } catch (e) {
        // Manually handle errors
        error.value = e;
    } finally {
        // Don't forget to set loading to false!
        loading.value = false;
    }
});
</script>
```

#### **With** Unwrapped

```vue
<template>
    <div>
        <!-- Single component handles all states automatically -->
        <!-- You can make your own custom reusable version with buildCustomAsyncResultLoader to avoid repeating the loading and error slots -->
        <AsyncResultLoader :result="userResult">
            <template #loading>Loading user...</template>
            
            <template #error="{ error }">
                <div class="error">Error: {{ error.message }}</div>
            </template>
            
            <!-- Only renders when data is successfully loaded -->
            <template #default="{ value: user }">
                <h2>{{ user.name }}</h2>
                <p>{{ user.email }}</p>
            </template>
        </AsyncResultLoader>
    </div>
</template>

<script setup>
import { AsyncResultLoader, useAction } from 'unwrapped/vue';
import { Result, ErrorBase } from 'unwrapped/core';

// Single composable handles loading, success, and error states automatically
// No need for separate refs or manual state management
const userResult = useAction(async () => 
    Result.tryFunction(
        async () => {
            const response = await fetch('/api/user/1');
            if (!response.ok) return Result.errTag("fetch_error", "response.ok is false");
            return response.json();
        },
        (e) => new ErrorBase('unknown_fetch_error', 'Failed to load user', e)
    )
);

// That's it! Loading state, error handling, and success state are all managed
// userResult automatically transitions: idle -> loading -> success/error
</script>
```


### Reactive search (Vue 3)

#### **Without** Unwrapped

```vue
<template>
    <div>
        <input v-model="searchQuery" placeholder="Search users..." />
        
        <!-- Multiple loading states to manage -->
        <div v-if="isSearching">Searching...</div>
        <div v-else-if="isLoadingDetails">Loading user details...</div>
        
        <div v-if="searchError" class="error">{{ searchError }}</div>
        <div v-if="detailsError" class="error">{{ detailsError }}</div>
        
        <div v-if="searchResults && !selectedUser">
            <div v-for="user in searchResults" :key="user.id" 
                @click="loadUserDetails(user.id)">
                {{ user.name }}
            </div>
        </div>
        
        <div v-if="selectedUser">
            <h2>{{ selectedUser.name }}</h2>
            <p>Posts: {{ selectedUser.posts?.length || 0 }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const searchQuery = ref('');
const searchResults = ref(null);
const selectedUser = ref(null);

// Separate loading/error states for each operation
const isSearching = ref(false);
const isLoadingDetails = ref(false);
const searchError = ref(null);
const detailsError = ref(null);

// Watch for search query changes
watch(searchQuery, async (query) => {
    if (!query) {
        searchResults.value = null;
        return;
    }
    
    isSearching.value = true;
    searchError.value = null;
    
    try {
        const response = await fetch(`/api/users/search?q=${query}`);
        searchResults.value = await response.json();
    } catch (e) {
        searchError.value = e.message;
    } finally {
        isSearching.value = false;
    }
});

async function loadUserDetails(userId) {
    isLoadingDetails.value = true;
    detailsError.value = null;
    
    try {
        // Chain two requests manually
        const userRes = await fetch(`/api/users/${userId}`);
        const user = await userRes.json();
        
        const postsRes = await fetch(`/api/posts?userId=${userId}`);
        const posts = await postsRes.json();
        
        selectedUser.value = { ...user, posts };
    } catch (e) {
        detailsError.value = e.message;
    } finally {
        isLoadingDetails.value = false;
    }
}
</script>
```


#### **With** Unwrapped

```vue
<template>
  <div>
    <input v-model="searchQuery" placeholder="Search users..." />
    
    <!-- Search results with automatic state management -->
    <CustomAsyncResultLoader :result="searchResults">
        <template #default="{ value: users }">
            <div v-for="user in users" :key="user.id" 
                @click="selectedUserId = user.id">
            {{ user.name }}
            </div>
        </template>
        
        <template #idle>
            <div>Enter a search query</div>
        </template>
    </CustomAsyncResultLoader>
    
    <!-- User details with chained operations -->
    <CustomAsyncResultLoader v-if="selectedUserId" :result="userDetails">
        <template #default="{ value: userData }">
            <h2>{{ userData.user.name }}</h2>
            <p>Email: {{ userData.user.email }}</p>
            <p>Posts: {{ userData.posts.length }}</p>
        </template>
    </CustomAsyncResultLoader>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { AsyncResultLoader, useReactiveChain, useReactiveGenerator } 
  from 'unwrapped/vue';
import { AsyncResult, ErrorBase } from 'unwrapped/core';
import CustomAsyncResultLoader from 'src/your/own/component'; // Made with buildCustomAsyncResultLoader()

const searchQuery = ref('');
const selectedUserId = ref(null);

// Automatically re-fetches when searchQuery changes
// No need for manual watch() or state management
const searchResults = useReactiveChain(
    () => searchQuery.value, // Reactive source
    (query) => {
        // Return idle state if no query
        if (!query) return AsyncResult.idle();
        
        // Otherwise fetch - loading/error states handled automatically
        return AsyncResult.fromValuePromise(
            fetch(`/api/users/search?q=${query}`).then(r => r.json())
        );
    },
    { immediate: true }
);

// Generator syntax makes chaining multiple async operations elegant
// Automatically re-runs when selectedUserId changes
const userDetails = useReactiveGenerator(
    () => selectedUserId.value, // Reactive source
    function* (userId) {
        if (!userId) return null;
        
        // yield* unwraps AsyncResults - if any fail, whole chain fails
        // No manual error handling needed for each step!
        const user = yield* AsyncResult.fromValuePromise(
            fetch(`/api/users/${userId}`).then(r => r.json())
        );
        
        const posts = yield* AsyncResult.fromValuePromise(
            fetch(`/api/posts?userId=${userId}`).then(r => r.json())
        );
        
        // Return combined result - automatically wrapped in success state
        return { user, posts };
    }
);

// That's it! No manual:
// - loading state tracking
// - error state tracking  
// - try/catch blocks
// - watch() cleanup
// - state reset on new requests
// All handled automatically by Unwrapped!
</script>
```

## Why Unwrapped ?

Traditional error handling in TypeScript relies on thrown errors with try/catch blocks. While this is great for "catstrophic failures" to make the whole app explode. This is great for simple scripts (which was, to be fair, the original intended purpose of JavaScript), but having your whole app panic because of a random JSON.parse() burried in your code is not ideal. Since the advent of Promises, this basic pattern basically became an absolute requirement for every serious app, and we're stuck developping complex apps with sub-par tools for handling the state of our asynchronous operations, having no really good way to track loading and error states provided by the language.Forgetting to set loading = false in a finally block, or missing an error case, are common sources of bugs. Complex async flows with multiple dependent operations become nested and difficult to follow.

Unwrapped addresses these pain points by making error handling explicit and composable through Result types, inspired by the more modern takes on these issues offered by newer languages/tools. A Result<T, E> forces you to acknowledge both success and error cases, with full type safety for both. For async operations, AsyncResult automatically manages the full lifecycle (idle → loading → success/error) so you don't need separate state variables. Generator syntax (yield*) lets you write complex async flows that read sequentially while remaining fully type-safe and composable.

The goal is not to reinvent TypeScript or impose a new paradigm, but to reduce boilerplate and eliminate common error-handling bugs while staying close to familiar patterns. If you already use async/await and promises, Unwrapped feels natural—just more robust and explicit about errors.


### Why not use Tanstack Query instead ?

On the frontend, errors and pending states are encountered while fetching data. A very good library for this is Tanstack Query, which has versions for most front-end frameworks. It's great at handling what we talked about earlier, from the basics of loading and error states, to more advanced concepts like caching, invalidation, and retries. It's however not meant as a general purpose error handling mechanism and lacks a proper Result type able to be used in other contexts in your codebase, and instead leans on the thrown errors pattern. It's thus more focused on a very specific part of your frontend application.

Unwrapped takes a more general approach, and instead of starting from the top (the useQuery primitive of Tanstack Query), starts from the bottom, with error and result types. These build primitives that can be easily built upon to compose features that catch up with the capabilities of Tanstack Query, especially via the framework specific bindings (`unwrapped/vue` for instance). Results and AsyncResults can be chained (via their `.chain()` and `.flatChain()` methods) for general synchronous or asynchronous computations that may fail at each step, and those chains can be written in a more imperative-looking way with the generators. These features get composed to allow the `KeyedAsyncCache` to perform automatically deduping, invalidations, and retries of any asynchronous operations, which can be easily used in your state management library of choice, like zustand or pinia. While Unwrapped is not yet at feature parity with Tanstack Query for the specific area it covers, its primitives are more composables and can be used in every context when needed. In fact, while first thought for front-end development, the `unwrapped/core` sub-module is pure typescript and can be used on the backend.

### Why not use Effect instead ?

Effect is an incredibly powerful library (that could even be called a framework) that has the ambition to "Fix TypeScript". It succeeds very well in this in its own way, but at the cost of almost becoming its own language. Some projects can benefit immensly from this, but it is overkill for simpler, smaller projects. Sometimes you just want your existing tools (TypeScript), but made a little more convenient, and that's where Unwrapped comes into play.

Unwrapped draws a lot of inspiration from Effect and its concepts (especially for the generators) while trying to make them more accessible, with a much more minimal set of APIs. Unwrapped also aims to play nicely with the existing UI frameworks (React, Vue, etc...) by providing integrations that bring Unwrapped's features into the common way of writing apps in those frameworks. In short, it aims to bring some of Effect's concepts to the Vue/React/Svelte way of writing, without disrupting existing patterns.

## Next planned features

Unwrapped is in very active development and a lot of features are still planned, such as :
- Abort and retries on AsyncResult
- Better support for concurrency
- Common utilities (like fetch()) using AsyncResult so you don't have to wrap them in a AsyncResult.fromValuePromise()
- Debounce on relevant utilities


## License

LGPL-3.0-or-later

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.