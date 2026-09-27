import { describe, expect, it } from './_expect';
import { parsePattern, patternToCode, nextDeviceLocation, isDeviceUncollected, isDeviceSheetHeader, deviceLocationDetail } from '../src/types/studentDevice';

describe('studentDevice', () => {
  it('패턴 문자열 ↔ 점 순서', () => {
    expect(parsePattern('1-2-3-6-9').join(',')).toBe('1,2,3,6,9');
    expect(parsePattern('1 5 0 12 9').join(',')).toBe('1,5,9');
    expect(parsePattern(undefined).length).toBe(0);
    expect(patternToCode([7, 4, 1])).toBe('7-4-1');
  });
  it('보관 흐름', () => {
    expect(nextDeviceLocation('student')).toBe('unit');
    expect(nextDeviceLocation('unit')).toBe('office');
    expect(nextDeviceLocation('office')).toBe('returned');
    expect(nextDeviceLocation('returned')).toBe(null);
    expect(isDeviceUncollected({ location: 'student' })).toBe(true);
  });
  it('시트 전자기기 열 판별', () => {
    expect(isDeviceSheetHeader('기기1모델')).toBe(true);
    expect(isDeviceSheetHeader('기기 3 잠금')).toBe(true);
    expect(isDeviceSheetHeader('기기')).toBe(false);
    expect(isDeviceSheetHeader('복용약 & 알레르기')).toBe(false);
  });
  it('보관 위치 상세 — 방 담당 방·그룹 교무실 호수·선생님', () => {
    const ctx = {
      groups: [{ name: 'Spring', classCodes: ['J01', 'J02'] }],
      rooms: { '222': { purpose: '교무실', label: 'Spring 교무실' }, '311': { purpose: '멘토방', teachers: ['윤수빈 멘토'] }, '405': { teachers: ['김선생'] }, '220': { purpose: '교실', teachers: ['윤수빈'] } },
    };
    const st = { unitMentor: '윤수빈', classNumber: 'J01.02' };
    expect(deviceLocationDetail('unit', st, ctx)).toBe('윤수빈 · 311호');
    expect(deviceLocationDetail('office', st, ctx)).toBe('Spring · 222호');
    expect(deviceLocationDetail('teacher', st, ctx, '김선생')).toBe('김선생 · 405호');
    expect(deviceLocationDetail('office', { classNumber: 'J09.01' }, ctx)).toBe('');
  });
});
