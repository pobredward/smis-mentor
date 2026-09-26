import { describe, expect, it } from './_expect';
import { SYMPTOM_GUIDES, calcTotalDoses, getHospitalPresets, isKoreanStaff, makeMedTimeKey, schedActiveOn } from '../src/utils/patient';

describe('환자 탭 공용', () => {
  it('증상 가이드 — 라벨 중복 없음, 18개', () => {
    const labels = SYMPTOM_GUIDES.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBe(18);
  });
  it('병원 프리셋은 캠프 코드 첫 글자로', () => {
    expect(getHospitalPresets('j29').length > 0).toBe(true);
    expect(getHospitalPresets('S29')).toEqual([]);
    expect(getHospitalPresets('X1')).toEqual([]);
  });
  it('원어민 제외', () => {
    expect(isKoreanStaff({ role: 'mentor' })).toBe(true);
    expect(isKoreanStaff({ role: 'foreign_temp' })).toBe(false);
  });
  it('복약 키·기간', () => {
    expect(makeMedTimeKey('아침' as never, '2026-07-27')).toBe('아침_20260727');
    expect(schedActiveOn({ startDate: '2026-07-27', endDate: '2026-07-29' }, '2026-07-30')).toBe(false);
    expect(schedActiveOn({ startDate: '2026-07-27', endDate: '2026-07-29', endDateAuto: true }, '2026-08-05')).toBe(true);
  });
  it('총 복용 횟수 — 휴약일 제외, 주 N일 올림', () => {
    const base = { startDate: '2026-07-27', endDate: '2026-08-02', times: ['a', 'b'] as never[] };
    expect(calcTotalDoses(base)).toBe(14);
    expect(calcTotalDoses({ ...base, skipDates: ['2026-07-28', '2026-09-01'] })).toBe(12);
    expect(calcTotalDoses({ ...base, daysPerWeek: 3 })).toBe(6);
    expect(calcTotalDoses({ ...base, times: [] })).toBe(0);
  });
});
