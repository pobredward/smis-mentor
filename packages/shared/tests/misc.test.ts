import { describe, expect, it } from './_expect';
import { normalizeNameForMatch, normalizePhoneForMatch, phoneQueryVariants } from '../src/utils/signup';
import { ESCORT_RECENT_MS, isActiveEscortVisit, myActiveEscortVisit } from '../src/utils/escort';
import { fromDateKey, isValidDateOfBirth, toDateKey } from '../src/utils/dateUtils';
import { getScoreGrade, getScoreGradeFromTen } from '../src/utils/scoreColor';
import { parseClipboardTable } from '../src/utils/timetableDraft';
import { notificationMasterOn, notificationMasterTogglePatch } from '../src/types/notification';

describe('가입 매칭', () => {
  it('전화번호 정규화', () => {
    expect(normalizePhoneForMatch('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizePhoneForMatch('010-1234-5678')).toBe('01012345678');
    expect(normalizePhoneForMatch(undefined)).toBe('');
  });
  it('조회 후보 (최대 10개, 흔한 저장 형식 포함)', () => {
    const v = phoneQueryVariants('010-1234-5678');
    expect(v.length).toBeLessThanOrEqual(10);
    expect(v).toEqual(expect.arrayContaining(['010-1234-5678', '01012345678', '+821012345678', '821012345678']));
  });
  it('이름 정규화', () => {
    expect(normalizeNameForMatch(' Hong Gil Dong ')).toBe('honggildong');
  });
});

describe('내원 인솔자', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const done = (msAgo: number) => ({ toMillis: () => now - msAgo });
  it('내원예정이면 인솔자', () => {
    expect(isActiveEscortVisit({ escort: '홍 길동', hospitalStatus: '내원예정' }, '홍길동', now)).toBe(true);
    expect(isActiveEscortVisit({ escort: '김철수', hospitalStatus: '내원예정' }, '홍길동', now)).toBe(false);
    expect(isActiveEscortVisit({ escort: '홍길동', hospitalStatus: '내원예정' }, '', now)).toBe(false);
  });
  it('내원완료는 48시간까지', () => {
    expect(isActiveEscortVisit({ escort: '홍길동', hospitalStatus: '내원완료', completedAt: done(ESCORT_RECENT_MS - 1000) }, '홍길동', now)).toBe(true);
    expect(isActiveEscortVisit({ escort: '홍길동', hospitalStatus: '내원완료', completedAt: done(ESCORT_RECENT_MS + 1000) }, '홍길동', now)).toBe(false);
  });
  it('여러 방문 중 찾기', () => {
    const visits = [{ escort: '김철수', hospitalStatus: '내원예정' }, { escort: '홍길동', hospitalStatus: '내원예정' }];
    expect(myActiveEscortVisit(visits, '홍길동')).toBe(visits[1]);
    expect(myActiveEscortVisit(undefined, '홍길동')).toBeUndefined();
  });
});

describe('날짜 키', () => {
  it('로컬 날짜 기준 왕복', () => {
    const d = new Date(2026, 0, 5, 0, 30);
    expect(toDateKey(d)).toBe('2026-01-05');
    expect(toDateKey(fromDateKey('2026-01-05'))).toBe('2026-01-05');
    expect(isNaN(fromDateKey('bad').getTime())).toBe(true);
  });
  it('생년월일 검증', () => {
    expect(isValidDateOfBirth('2000-02-29')).toBe(true);
    expect(isValidDateOfBirth('1899-12-31')).toBe(false);
    expect(isValidDateOfBirth('2000/01/01')).toBe(false);
    expect(isValidDateOfBirth('3000-01-01')).toBe(false);
  });
});

describe('점수 등급', () => {
  it('백분율·10점 기준', () => {
    expect(getScoreGrade(9.5)).toBe('A+');
    expect(getScoreGrade(45, 50)).toBe('A');
    expect(getScoreGrade(4)).toBe('D');
    expect(getScoreGradeFromTen(8)).toBe('B+');
  });
});

describe('붙여넣기 표 파싱', () => {
  it('엑셀 TSV → 2차원 배열', () => {
    expect(parseClipboardTable('a\tb\r\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseClipboardTable('single')).toBeNull();
    expect(parseClipboardTable('')).toBeNull();
  });
});

describe('알림 전체 스위치', () => {
  it('켤 때는 보이는 종류를 모두 켠다 (꺼 둔 종류가 남던 버그)', () => {
    const off = { generalNotifications: false, taskReminder: false } as never;
    expect(notificationMasterOn(off)).toBe(false);
    const patch = notificationMasterTogglePatch(off, ['stockLow', 'supplyRequest']);
    expect(patch).toEqual({ generalNotifications: true, stockLow: true, supplyRequest: true });
  });
  it('끌 때는 전체만 끈다', () => {
    expect(notificationMasterOn(undefined)).toBe(true);
    expect(notificationMasterTogglePatch({}, ['stockLow'])).toEqual({ generalNotifications: false });
  });
});
