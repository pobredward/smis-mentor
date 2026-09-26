/**
 * node:test 용 최소 expect — vitest/jest 와 같은 모양으로 써서 나중에 옮기기 쉽게.
 * (vitest 는 네이티브 rollup 바이너리가 필요해 이 저장소의 lockfile·CI 에서 설치가 불안정하다)
 */
import assert from 'node:assert/strict';

export { describe, it } from 'node:test';

const ARRAY_CONTAINING = Symbol('arrayContaining');
type Containing = { [ARRAY_CONTAINING]: unknown[] };

function matchers(actual: unknown, negate = false) {
  const check = (ok: boolean, msg: string) => {
    if (negate ? ok : !ok) assert.fail(`${negate ? 'NOT ' : ''}${msg}\n  actual: ${JSON.stringify(actual)}`);
  };
  const deepEq = (a: unknown, b: unknown) => {
    try {
      assert.deepStrictEqual(a, b);
      return true;
    } catch {
      return false;
    }
  };
  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), `toBe ${JSON.stringify(expected)}`),
    toEqual: (expected: unknown) => {
      if (expected && typeof expected === 'object' && ARRAY_CONTAINING in (expected as object)) {
        const want = (expected as Containing)[ARRAY_CONTAINING];
        check(Array.isArray(actual) && want.every((w) => (actual as unknown[]).some((a) => deepEq(a, w))), `arrayContaining ${JSON.stringify(want)}`);
        return;
      }
      check(deepEq(actual, expected), `toEqual ${JSON.stringify(expected)}`);
    },
    toContain: (item: unknown) => check(Array.isArray(actual) ? actual.includes(item) : String(actual).includes(String(item)), `toContain ${JSON.stringify(item)}`),
    toBeNull: () => check(actual === null, 'toBeNull'),
    toBeUndefined: () => check(actual === undefined, 'toBeUndefined'),
    toBeTruthy: () => check(!!actual, 'toBeTruthy'),
    toBeLessThanOrEqual: (n: number) => check((actual as number) <= n, `<= ${n}`),
  };
}

export function expect(actual: unknown) {
  return { ...matchers(actual), not: matchers(actual, true) };
}
expect.arrayContaining = (items: unknown[]): Containing => ({ [ARRAY_CONTAINING]: items });
