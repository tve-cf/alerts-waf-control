import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";
import { getPlatformProxy } from 'wrangler';

const { env, dispose } = await getPlatformProxy({ configPath: './wrangler.toml' })

// Change the import to use your runtime specific build
import build from "@hono/vite-build/cloudflare-workers";

export default defineConfig(async ({ mode }) => {
  const { env, dispose } = await getPlatformProxy();
  if (mode === "client")
    return {
      esbuild: {
        jsxImportSource: "hono/jsx/dom", // Optimized for hono/jsx/dom
      },
      build: {
        rollupOptions: {
          input: "./src/client.tsx",
          output: {
            entryFileNames: "static/client.js",
          },
        },
      },
    };

  return {
    plugins: [
      build({
        entry: "src/index.tsx",
      }),
      devServer({
        adapter: {
          env,
          onServerClose: dispose,
        },
        entry: "src/index.tsx",
      }),
    ],
  };
});