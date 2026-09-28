/**
 * 처방약·상시약 날짜 로직 — 약복용 명단 · 학생 카드가 같은 규칙으로 보여야 한다
 */
import { describe, it, expect } from './_expect';
import {
  schedActiveOn, addDaysYmd, DEFAULT_MED_DAYS, medListScheduleOf, emptyMedListForm, campEndYmd,
  isVideoUrl, calcTotalDoses, isOpenPatientRecord,
} from '../src';

describe('처방약 기본 3일', () => {
  const today = '2026-07-30';
  const s = { startDate: today, endDate: addDaysYmd(today, DEFAULT_MED_DAYS - 1), times: ['조식후', '석식후'] as never };
  it('오늘·내일·모레만 복용', () => {
    expect(s.endDate).toBe('2026-08-01');
    expect(schedActiveOn(s, '2026-07-29')).toBe(false);
    expect(schedActiveOn(s, '2026-07-30')).toBe(true);
    expect(schedActiveOn(s, '2026-08-01')).toBe(true);
    expect(schedActiveOn(s, '2026-08-02')).toBe(false);
    expect(calcTotalDoses(s)).toBe(6);
  });
  it('월말 넘어가도 날짜가 맞다', () => {
    expect(addDaysYmd('2026-07-31', 2)).toBe('2026-08-02');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('상시약 퇴소까지', () => {
  it('캠프 종료일(jobCodes.endDate, 00:00 UTC/KST 어느 쪽이든)을 날짜로', () => {
    expect(campEndYmd(new Date('2026-08-14T00:00:00Z'))).toBe('2026-08-14');
    expect(campEndYmd(new Date('2026-08-14T00:00:00+09:00'))).toBe('2026-08-14');
    expect(campEndYmd(undefined)).toBe('');
  });
  it('퇴소까지면 종료일 = 캠프 종료일, 그 뒤로는 복용 없음', () => {
    const f = { ...emptyMedListForm('2026-07-26'), name: 'ADHD약', times: ['기상후'] as never };
    const s = medListScheduleOf(f, '2026-08-14');
    expect(s.endDateAuto).toBe(true);
    expect(s.endDate).toBe('2026-08-14');
    expect(s.totalDoses).toBe(20);
    expect(schedActiveOn(s, '2026-08-14')).toBe(true);
  });
  it('캠프 종료일을 모르면 시작일로 (그래도 퇴소까지 표시로 매일 복용)', () => {
    const f = { ...emptyMedListForm('2026-07-26'), name: 'x', times: ['기상후'] as never };
    const s = medListScheduleOf(f, '');
    expect(s.endDate).toBe('2026-07-26');
    expect(schedActiveOn(s, '2026-08-10')).toBe(true);
  });
  it('날짜 지정 + 건너뛸 날은 기간 안의 것만', () => {
    const f = { ...emptyMedListForm('2026-07-26'), name: 'x', times: ['기상후'] as never, untilEnd: false, endDate: '2026-07-28', skipDates: ['2026-07-27', '2026-08-01'] };
    const s = medListScheduleOf(f, '2026-08-14');
    expect(s.skipDates).toEqual(['2026-07-27']);
    expect(s.totalDoses).toBe(2);
  });
});

describe('기타', () => {
  it('영상 주소 판별 (Storage 주소 인코딩 포함)', () => {
    expect(isVideoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/patientRecords%2Fa%2Fprescriptions%2F1_clip.MOV?alt=media&token=t')).toBe(true);
    expect(isVideoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/patientRecords%2Fa%2Fprescriptions%2F1_p.jpg?alt=media')).toBe(false);
  });
  it('상시약 기록은 보건 진행 중이 아니다', () => {
    expect(isOpenPatientRecord({ progressStatus: '최초보고', medicationOnly: true } as never)).toBe(false);
    expect(isOpenPatientRecord({ progressStatus: '중간보고' } as never)).toBe(true);
  });
});
