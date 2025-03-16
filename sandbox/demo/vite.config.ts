import { defineConfig } from "vite"
import kaiokenPlugin from "vite-plugin-kaioken"

export default defineConfig({
  esbuild: {
    supported: {
      "top-level-await": true, //browsers can handle top-level-await features
    },
  },
  plugins: [kaiokenPlugin()],
})
