import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({

  root: "src/",

  build: {
    outDir: "../dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        book: resolve(__dirname, "src/book.html"),
        author: resolve(__dirname, "src/author.html"),
        dashboard: resolve(__dirname, "src/dashboard.html"),
        queue: resolve(__dirname, "src/wanttoread.html"),
        reading: resolve(__dirname, "src/progress.html"),
        archive: resolve(__dirname, "src/timeline.html"),
      },
    },
  },
});