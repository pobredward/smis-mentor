import { describe, expect, it } from './_expect';
import {
  sectionTabOf, studentTabsFor, hasMedicationInfo, placementSummary, guardianContacts, dialablePhone,
} from '../src/utils/studentModal';
import { getDefaultFieldConfig } from '../src/services/fieldConfig';
import type { STSheetStudent } from '../src/types/student';

const stu = (p: Partial<STSheetStudent> = {}) => ({ studentId: 'J.001', name: '홍길동', gender: 'M', ...p }) as STSheetStudent;

describe('studentModal', () => {
  it('섹션 기본 탭 매핑 + 관리자 지정 우선', () => {
    expect(sectionTabOf({ id: 'campInfo' })).toBe('basic');
    expect(sectionTabOf({ id: 'guardianInfo' })).toBe('health');
    expect(sectionTabOf({ id: 'detail' })).toBe('health');
    expect(sectionTabOf({ id: 'counsel' })).toBe('study');
    expect(sectionTabOf({ id: 'survey' })).toBe('survey');
    expect(sectionTabOf({ id: 'custom_x' })).toBe('basic');
    expect(sectionTabOf({ id: 'custom_x', tab: 'health' })).toBe('health');
  });

  it('F캠프는 용돈 탭 없음, 설문 값이 없으면 설문 탭 숨김', () => {
    const f = studentTabsFor(stu(), 'F', getDefaultFieldConfig('F'));
    expect(f.includes('allowance')).toBe(false);
    const ej = studentTabsFor(stu(), 'EJ', getDefaultFieldConfig('EJ'));
    expect(ej.includes('allowance')).toBe(true);
    expect(ej.includes('survey')).toBe(false);
    const ej2 = studentTabsFor(stu({ surveyMbti: 'INTJ' } as Partial<STSheetStudent>), 'EJ', getDefaultFieldConfig('EJ'));
    expect(ej2.includes('survey')).toBe(true);
  });

  it('복용약 "없음" 류는 경고 안 함', () => {
    expect(hasMedicationInfo({ medication: '없음' })).toBe(false);
    expect(hasMedicationInfo({ medication: ' - ' })).toBe(false);
    expect(hasMedicationInfo({ medication: '땅콩 알레르기' })).toBe(true);
  });

  it('레벨 테스트 요약·연락처', () => {
    const rows = placementSummary(stu({ placementSpeaking: '12', finalSpeaking: '18' } as Partial<STSheetStudent>));
    expect(rows.length).toBe(1);
    expect(rows[0].final! - rows[0].entry!).toBe(6);
    expect(guardianContacts(stu({ parentPhone: '010-1234-5678', parentName: '엄마' })).length).toBe(1);
    expect(dialablePhone('010-1234-5678')).toBe('01012345678');
  });
});
