import { describe, it, expect } from './_expect';
import { buildCampKeys, normalizeCampCode } from '../src/services/campKey';

describe('캠프 열쇠 변환표', () => {
  it('id ↔ code 양쪽으로', () => {
    const k = buildCampKeys([{ id: 'a1', code: 'J29' }, { id: 'b2', code: ' S29 ' }, { id: 'c3', code: 'F25_2' }]);
    expect(k.byId.get('a1')).toBe('J29');
    expect(k.byId.get('b2')).toBe('S29');
    expect(k.byCode.get('S29')).toBe('b2');
    expect(k.byCode.get('F25_2')).toBe('c3');
  });
  it('코드 없는 문서는 뺀다 · 같은 코드가 둘이면 처음 것', () => {
    const k = buildCampKeys([{ id: 'x', code: '' }, { id: 'y' }, { id: 'p', code: 'E29' }, { id: 'q', code: 'E29' }]);
    expect(k.byId.has('x')).toBe(false);
    expect(k.byId.has('y')).toBe(false);
    expect(k.byCode.get('E29')).toBe('p');
    expect(k.byId.get('q')).toBe('E29');
  });
  it('코드 정리 — 공백만 뺀다', () => {
    expect(normalizeCampCode(' J24S ')).toBe('J24S');
    expect(normalizeCampCode(null)).toBe('');
  });
});
