import { defineConfig } from "tsup"

export default defineConfig([
    {
        entry: ["src/core/index.ts"],
        format: ["cjs", "esm"],
        sourcemap: true,
        dts: true,
        outDir: "dist/core"
    },
])