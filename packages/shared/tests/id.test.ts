import { describe, expect, it } from './_expect';
import { newId } from '../src/utils/id';

describe('newId', () => {
  it('uuid v4 형식, 매번 다름', () => {
    const a = newId();
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a)).toBe(true);
    expect(a === newId()).toBe(false);
  });
});
