import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    // @paddleocr/paddleocr-js pulls in OpenCV.js, whose Node branch requires fs/path. Never reached in a browser.
    // The SDK's prebuilt worker also points at an ort.bundle.min.mjs that is not shipped beside it; that is only
    // used in worker mode, which we do not enable (ONNX Runtime's WASM comes from the CDN via wasmPaths).
    resolveAlias: { fs: "./lib/empty.ts", path: "./lib/empty.ts", "ort.bundle.min.mjs": "./lib/empty.ts" },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
