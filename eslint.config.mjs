import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * 공통 ESLint 설정 (flat config).
 * 처음 도입 단계라 기존 코드에 많은 규칙은 warn — 새 오류(error)만 CI 에서 막는다.
 */
export const baseIgnores = {
  ignores: ["**/dist/**", "lib/**", "**/build/**", "**/.next/**", "**/node_modules/**", "**/*.d.ts"],
};

export const relaxedRules = {
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-require-imports": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "no-empty": "warn",
    "no-useless-escape": "warn",
    "prefer-const": "warn",
    "no-case-declarations": "warn",
    // shared 는 패키지 이름(@smis-mentor/shared)으로만 가져온다 — 상대 경로로 src/dist 를 직접 가져오면
    // web·mobile 이 서로 다른 사본을 보게 된다 (드리프트)
    // 화면 문구는 사전(shared/i18n)으로 — isForeign ? '영어' : '한국어' 를 새로 쓰지 않는다 (L('ns.key') 사용)
    "no-restricted-syntax": ["error", {
      selector: "ConditionalExpression[test.name=/^isForeign/][consequent.type=/^(Literal|TemplateLiteral)$/][alternate.type=/^(Literal|TemplateLiteral)$/]",
      message: "화면 문구는 shared i18n 사전에 넣고 L('ns.key') 로 쓰세요.",
    }, {
      selector: "ConditionalExpression[test.callee.name='isEnglishUI'][consequent.type=/^(Literal|TemplateLiteral)$/][alternate.type=/^(Literal|TemplateLiteral)$/]",
      message: "화면 문구는 shared i18n 사전에 넣고 L('ns.key') 로 쓰세요.",
    }],
    "no-restricted-imports": ["error", { patterns: [{ group: ["**/shared/src", "**/shared/src/**", "**/shared/dist/**"], message: "@smis-mentor/shared 로 가져오세요." }] }],
  },
};

export const baseConfig = [baseIgnores, js.configs.recommended, ...tseslint.configs.recommended, relaxedRules];

export default baseConfig;
