import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { baseIgnores, relaxedRules } from "../../eslint.config.mjs";

const eslintConfig = [
  baseIgnores,
  { ignores: ["public/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  relaxedRules,
  {
    rules: {
      // React 19 컴파일러 계열 규칙 — 기존 코드에 많아 우선 경고로
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/incompatible-library": "warn",
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react/no-unescaped-entities": "warn",
      "jsx-a11y/alt-text": "warn",
    },
  },
];

export default eslintConfig;
