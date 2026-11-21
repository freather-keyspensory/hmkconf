import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import { localStudioBluetooth } from "./scripts/bluetooth/local-studio.ts"

export default defineConfig({
  server: {
    proxy: {
      [(process.env.CONFIG_BASE_PATH || "/hmkconf") + "/api/firmware/"]: {
        target: "http://127.0.0.1:4187",
        rewrite: (path) => path.slice(path.indexOf("/api/firmware/")),
      },
    },
  },
  plugins: [localStudioBluetooth(), tailwindcss(), sveltekit()],
})
