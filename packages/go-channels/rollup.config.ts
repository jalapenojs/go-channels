import { RollupOptions } from "rollup";
import typescript from "@rollup/plugin-typescript";

const config: RollupOptions = {
  input: "src/index.ts",
  output: {
    file: "dist/index.bundle.js",
    format: "cjs",
  },
  plugins: [typescript()],
};

export default config;
