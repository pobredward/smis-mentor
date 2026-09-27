/**
 * 학생 상세 모달 (web·mobile 공용) — 탭 구성과 표시 판단.
 * 탭 종류·정보는 두 플랫폼이 같고, 화면 배치만 각자 최적화한다.
 */
import type { FieldSectionConfig, STSheetFieldConfig } from '../types/fieldConfig';
import type { CampType, STSheetStudent } from '../types/student';
import type { PatientRecord } from '../types/camp';
import { getFieldValue } from '../services/fieldConfig';
import type { MessageKey } from '../i18n';
import { isDeviceSheetHeader } from '../types/studentDevice';

export const STUDENT_TAB_IDS = ['basic', 'health', 'allowance', 'devices', 'study', 'survey'] as const;
export type StudentTabId = (typeof STUDENT_TAB_IDS)[number];

/** 탭 라벨 i18n 키 */
export const STUDENT_TAB_LABEL_KEYS: Record<StudentTabId, MessageKey> = {
  basic: 'studentModal.tabBasic',
  health: 'studentModal.tabHealth',
  allowance: 'studentModal.tabAllowance',
  devices: 'studentModal.tabDevices',
  study: 'studentModal.tabStudy',
  survey: 'studentModal.tabSurvey',
};

/** 필드 설정 섹션을 넣을 수 있는 탭 (용돈·전자기기는 전용 화면) */
export const SECTION_TAB_OPTIONS = ['basic', 'health', 'study', 'survey'] as const;
export type SectionTabId = (typeof SECTION_TAB_OPTIONS)[number];

const DEFAULT_SECTION_TAB: Record<string, SectionTabId> = {
  campInfo: 'basic',
  basicInfo: 'basic',
  guardianInfo: 'health',
  detail: 'health',
  placement: 'study',
  counsel: 'study',
  survey: 'survey',
};

/** 섹션이 들어갈 탭 — 관리자가 지정한 값 우선, 없으면 섹션 id 기준, 그래도 없으면 캠프·기본 */
export function sectionTabOf(section: Pick<FieldSectionConfig, 'id' | 'tab'>): SectionTabId {
  const t = section.tab;
  if (t && (SECTION_TAB_OPTIONS as readonly string[]).includes(t)) return t;
  return DEFAULT_SECTION_TAB[section.id] ?? 'basic';
}

/** 탭에 들어갈 섹션 (표시 중인 것만, 순서대로) */
export function sectionsForTab(config: STSheetFieldConfig, tab: StudentTabId): FieldSectionConfig[] {
  return config.sections
    .filter(sec => sec.isVisible && sectionTabOf(sec) === tab)
    .sort((a, b) => a.order - b.order);
}

/** 동적 섹션에서 보일 필드 — 읽기 전용이면서 값이 없는 필드(설문 등)는 숨김 */
export function visibleDynamicFields(student: STSheetStudent, section: FieldSectionConfig) {
  return section.fields
    .filter(f => f.isVisible && !isDeviceSheetHeader(f.sheetHeader)) // 전자기기 열은 전자기기 탭(Firestore) 전용
    .sort((a, b) => a.order - b.order)
    .filter(f => {
      if (!f.isEditable && f.permission === 'readonly') {
        return !!getFieldValue(student, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: f.isLegacy });
      }
      return true;
    });
}

function tabHasContent(student: STSheetStudent, config: STSheetFieldConfig, tab: StudentTabId): boolean {
  return sectionsForTab(config, tab).some(sec => sec.isFixed || visibleDynamicFields(student, sec).length > 0);
}

/** 이 학생에게 보여줄 탭 목록 */
export function studentTabsFor(
  student: STSheetStudent,
  campType: CampType,
  config: STSheetFieldConfig,
): StudentTabId[] {
  const tabs: StudentTabId[] = ['basic', 'health'];
  if (campType !== 'F') tabs.push('allowance'); // F캠프는 용돈 없음
  tabs.push('devices');
  if (tabHasContent(student, config, 'study')) tabs.push('study');
  if (tabHasContent(student, config, 'survey')) tabs.push('survey');
  return tabs;
}

const NONE_VALUES = new Set(['', '-', 'x', 'X', '없음', '없어요', '없습니다', '해당없음', '해당 없음', 'no', 'No', 'NO', 'none', 'None', 'N/A', 'n/a']);

/** 복용약 & 알레르기에 실제 내용이 있는지 ("없음" 등은 제외) */
export function hasMedicationInfo(student: Pick<STSheetStudent, 'medication'>): boolean {
  const v = (student.medication ?? '').trim();
  return !NONE_VALUES.has(v);
}

/** 아직 완치 처리되지 않은 보건 기록 — 약복용 명단 전용(상시약) 기록은 아픈 게 아니므로 빼고 */
export function isOpenPatientRecord(r: Pick<PatientRecord, 'progressStatus' | 'medicationOnly'>): boolean {
  return r.progressStatus !== '완치' && !r.medicationOnly;
}

/** 레벨 테스트 입소 → 파이널 요약 (값이 있는 영역만) */
export interface PlacementSummaryRow {
  skill: 'Speaking' | 'Reading' | 'Writing';
  entry: number | null;
  final: number | null;
  max: number;
}

export function placementSummary(student: STSheetStudent): PlacementSummaryRow[] {
  const rec = student as unknown as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = rec[k];
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  };
  const rows: PlacementSummaryRow[] = [
    { skill: 'Speaking', entry: num('placementSpeaking'), final: num('finalSpeaking'), max: 30 },
    { skill: 'Reading', entry: num('placementReading'), final: num('finalReading'), max: 30 },
    { skill: 'Writing', entry: num('placementWriting'), final: num('finalWriting'), max: 40 },
  ];
  return rows.filter(r => r.entry !== null || r.final !== null);
}

/** 보호자 연락처 (전화·문자 버튼용) */
export function guardianContacts(student: STSheetStudent): { role: 'primary' | 'other'; name: string; phone: string }[] {
  const out: { role: 'primary' | 'other'; name: string; phone: string }[] = [];
  if (student.parentPhone?.trim()) out.push({ role: 'primary', name: student.parentName ?? '', phone: student.parentPhone.trim() });
  if (student.otherPhone?.trim()) out.push({ role: 'other', name: student.otherName ?? '', phone: student.otherPhone.trim() });
  return out;
}

/** tel:/sms: 링크용 — 숫자와 + 만 남김 */
export function dialablePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}
