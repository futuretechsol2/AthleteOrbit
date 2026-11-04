import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// DEMO_BUNDLE=1 builds one JS file (used for the single-page demo).
export default defineConfig({ plugins: [react()], build: { outDir: process.env.DEMO_OUT || "dist", emptyOutDir: true, sourcemap: false,
  rollupOptions: process.env.DEMO_BUNDLE ? { output: { inlineDynamicImports: true } } : {} } });
