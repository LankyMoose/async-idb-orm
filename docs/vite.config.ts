import { defineConfig } from "vite"
import kiru from "vite-plugin-kiru"
import mdx from "@mdx-js/rollup"
import shiki from "@shikijs/rehype"

export default defineConfig({
  plugins: [
    {
      //enforce: "pre",
      ...mdx({
        jsx: false,
        jsxImportSource: "kiru",
        jsxRuntime: "automatic",
        rehypePlugins: [[shiki, { theme: "min-dark" }]],
      }),
    },
    kiru({
      ssg: {
        baseUrl: "/",
        dir: "src/pages",
        document: "document.tsx",
        page: "index.{tsx,mdx}",
        layout: "layout.tsx",
        // sitemap: {
        //   domain: "https://lankymoose.github.io",
        //   overrides: {
        //     "/": {
        //       changefreq: "daily",
        //       priority: 0.9,
        //     },
        //   },
        // },
      },
    }),
  ],
})
