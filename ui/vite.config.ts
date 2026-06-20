import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The UI imports the engine straight from its TypeScript source — ONE source of
// truth for game logic, nothing copied. Vite/esbuild compiles the engine .ts on
// the fly. `server.fs.allow` lets the dev server read the sibling engine/ dir.
const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@engine": path.resolve(root, "../engine/src/index.ts"),
      "@fixtures": path.resolve(root, "../engine/fixtures/warriors.ts"),
    },
  },
  server: { fs: { allow: [path.resolve(root, "..")] } },
});
