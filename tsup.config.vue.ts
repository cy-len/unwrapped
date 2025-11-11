import { defineConfig } from "tsup"

export default defineConfig([
    {
        entry: ["src/vue/index.ts"],
        format: ["cjs", "esm"],
        sourcemap: true,
        dts: true,
        outDir: "dist/vue",
        external: ["vue", "unwrapped/core"],
        platform: "browser"
    }
])