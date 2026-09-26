import { describe, expect, it } from './_expect';
import { t, tr, localeOfRole, koMessages, enMessages } from '../src/i18n';

function leaves(o: Record<string, unknown>, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [`${p}${k}`] : leaves(v as Record<string, unknown>, `${p}${k}.`)));
}

describe('i18n 사전', () => {
  it('영어 사전에 한국어와 같은 키가 모두 있고 비어 있지 않다', () => {
    const ko = leaves(koMessages as never).sort();
    const en = leaves(enMessages as never).sort();
    expect(en).toEqual(ko);
    for (const k of en) expect(t('en', k as never).length > 0).toBe(true);
  });
  it('tr / 역할 → 언어 / 끼워 넣기', () => {
    expect(tr(true, 'common.cancel')).toBe('Cancel');
    expect(tr(false, 'common.cancel')).toBe('취소');
    expect(localeOfRole('foreign_temp')).toBe('en');
    expect(localeOfRole('mentor')).toBe('ko');
    expect(t('en', 'nonexistent.key' as never)).toBe('nonexistent.key');
  });
});
