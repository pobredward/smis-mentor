import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "../../eslint.config.mjs";

export default [
  ...baseConfig,
  { ignores: ["android/**", "ios/**", ".expo/**", "scripts/**", "*.config.js", "babel.config.js", "metro.config.js"] },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node, __DEV__: "readonly" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
