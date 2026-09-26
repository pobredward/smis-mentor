import { baseConfig } from "../eslint.config.mjs";

export default [
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "name", "length"],
    },
  },
];
