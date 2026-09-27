import { describe, expect, it } from './_expect';
import { parsePattern, patternToCode, nextDeviceLocation, isDeviceUncollected, isDeviceSheetHeader } from '../src/types/studentDevice';

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
});
