/**
 * 환자 탭 공용 도메인 상수·순수 함수 (web PatientContent · mobile PatientScreen)
 * 예전에는 두 화면에 각각 복사돼 있어 증상 가이드가 17개 / 18개로 어긋나 있었다.
 */
import type { MedicationSchedule, MedicationTime } from '../types/camp';

// ==================== 증상별 기본 처치 가이드 ====================

export interface SymptomGuide {
  label: string;
  emoji: string;
  category: '내과' | '외과' | '응급';
  treatment: string; // 기본 처치
  medication: string; // 추천 약
  notes?: string; // 추가 안내
}

export const SYMPTOM_GUIDES: SymptomGuide[] = [
  // ── 내과/소아과 ──
  { label: '두통/발열', emoji: '🌡️', category: '내과', treatment: '타이레놀(해열제) 투여 후 안정, 미지근한 물 충분히 섭취, 서늘한 환경에서 휴식', medication: '해열제 (타이레놀 / 어린이용 부루펜)', notes: '37.2°C 이상이면 해열제, 38.5°C 이상이면 즉시 보고. 10분 간격으로 체온 체크.' },
  { label: '인후통 (목)', emoji: '😮', category: '내과', treatment: '소금물 가글, 따뜻한 물 섭취, 안정', medication: '목감기약 (용각산, 페니라민)', notes: '38°C 이상 동반 시 내원 고려.' },
  { label: '코막힘/콧물', emoji: '🤧', category: '내과', treatment: '코 세척(생리식염수), 충분한 수분 섭취', medication: '코감기약 (페니라민, 지르텍)' },
  { label: '알레르기 (재채기/콧물)', emoji: '🌿', category: '내과', treatment: '알레르기 유발 환경 제거, 냉찜질 (두드러기)', medication: '항히스타민제 (지르텍, 페니라민)' },
  { label: '복통', emoji: '🤢', category: '내과', treatment: '배를 따뜻하게 하고 안정, 식사 중단, 수분 보충', medication: '소화제 (훼스탈, 베아제), 설사 → 정로환, 변비 → 둘코락스', notes: '구토 동반 시 음식·물 섭취 중단 후 즉시 보고.' },
  { label: '구토/메스꺼움', emoji: '🤮', category: '내과', treatment: '옆으로 눕히기, 음식물 섭취 중단, 수분 서서히 보충', medication: '소화제, 정로환' },
  { label: '두드러기', emoji: '🔴', category: '내과', treatment: '알레르기 원인 제거, 냉찜질, 긁지 않기', medication: '항히스타민제 (지르텍, 페니라민)', notes: '호흡 곤란 동반 시 즉시 119 및 운영진 연락.' },
  { label: '구내염', emoji: '👄', category: '내과', treatment: '구강 위생 유지, 자극적 음식 금지, 충분한 수분', medication: '알보칠, 구강연고' },
  // ── 외과 ──
  { label: '근육통', emoji: '💪', category: '외과', treatment: '냉찜질(24시간 내) → 온찜질(24시간 후), 충분한 휴식', medication: '에어파스, 멘소래담' },
  { label: '코피', emoji: '🩸', category: '외과', treatment: '고개를 앞으로 숙이고 코날개 양쪽을 5~10분 압박. 절대 뒤로 젖히지 않기.', medication: '(약 불필요)', notes: '10분 이상 지속되면 즉시 내원.' },
  { label: '베임/찰과상', emoji: '🩹', category: '외과', treatment: '흐르는 물로 세척 → 소독약 → 밴드 또는 후시딘/마데카솔 도포', medication: '소독약, 후시딘(항생 연고), 마데카솔(재생 연고)', notes: '깊은 상처나 출혈이 멈추지 않으면 내원.' },
  { label: '화상', emoji: '🔥', category: '외과', treatment: '즉시 흐르는 찬물에 10~20분 냉각. 얼음 직접 금지. 물집 터뜨리지 않기.', medication: '실바딘크림 (처방 시), 마데카솔', notes: '2도 이상이거나 범위가 넓으면 즉시 내원.' },
  { label: '눈에 이물질', emoji: '👁️', category: '외과', treatment: '눈 비비지 않기. 흐르는 깨끗한 물로 눈을 씻어내기. 개선 없으면 내원.', medication: '인공눈물', notes: '시력 이상·통증 지속 시 즉시 내원.' },
  { label: '골절 의심', emoji: '🦴', category: '외과', treatment: '부목 고정 후 이동 최소화, 냉찜질, 즉시 내원', medication: '(약 불필요)', notes: '이동 시 골절 부위 고정 필수. 즉시 병원.' },
  { label: '쥐 (경련)', emoji: '⚡', category: '외과', treatment: '발바닥을 세게 당겨 스트레칭, 따뜻하게 찜질', medication: '(약 불필요)', notes: '반복 발생 시 전해질 음료 섭취 권장.' },
  { label: '다래끼', emoji: '👁️‍🗨️', category: '외과', treatment: '따뜻한 찜질(하루 3~4회, 10분씩), 눈 비비지 않기', medication: '점안 항생제 (처방 필요)' },
  // ── 응급 ──
  { label: '심정지 의심', emoji: '❤️', category: '응급', treatment: '즉시 119 신고 → CPR 시작 (30:2 압박:인공호흡). AED 사용 가능 시 사용.', medication: '(약 불필요)', notes: '절대 혼자 판단하지 말고 즉시 119 신고.' },
  { label: '기도폐쇄 (목막힘)', emoji: '🫁', category: '응급', treatment: '등 두드리기 5회 → 하임리히법 5회 반복. 의식 없으면 119 신고 + CPR.', medication: '(약 불필요)', notes: '즉시 119 신고.' },
];

// ==================== 병원 ====================

/** 캠프 코드 첫 글자별 자주 가는 병원 */
export const HOSPITAL_PRESETS: Record<string, string[]> = {
  J: ['건강한한림연합내과의원', '한림이비인후과의원', '한림본정형외과의원', '한림의원', '한림윤패밀리의원', '한림김안과의원', '한림본치과의원'],
  S: [], // 추후 채울 예정
};

export function getHospitalPresets(campCode: string): string[] {
  const prefix = campCode.charAt(0).toUpperCase();
  return HOSPITAL_PRESETS[prefix] ?? [];
}

// ==================== 보고 문구 ====================

/** 한국인 스태프인가 (원어민은 영어 안내) */
export function isKoreanStaff(u: { role?: string }): boolean {
  return u.role !== 'foreign' && u.role !== 'foreign_temp';
}

/** 최초보고 ⑤ 현재 상태 › 추가 메모 안내 */
export const ACTION_NOTE_PLACEHOLDER = '증상이 언제부터 시작되었는지, 얼마나 지속되었는지, 집에서도 자주 나타나는 증상인지, 식사 여부, 이전에도 같은 증상이 있었는지 등 특이사항을 작성해주세요.';
export const ACTION_NOTE_EXAMPLE = '예) 점심식사 후부터 배가 아프다고 함. 약 30분 정도 지속 중이며 집에서도 가끔 비슷한 증상이 있다고 함.';

// ==================== 복약 ====================

/** 복약 체크 키: 'morning_20260727' */
export function makeMedTimeKey(time: MedicationTime, dateStr: string): string {
  return `${time}_${dateStr.replace(/-/g, '')}`;
}

/** 이 날 복용하는 약인가 — '캠프 끝까지'(endDateAuto)는 저장된 종료일과 무관하게 계속 복용 */
export function schedActiveOn(s: { startDate: string; endDate: string; endDateAuto?: boolean }, date: string): boolean {
  return date >= s.startDate && (!!s.endDateAuto || date <= s.endDate);
}

export function isInDateRange(start: string, end: string, date: string): boolean {
  return date >= start && date <= end;
}

/** 스케줄의 총 복용 횟수 (휴약일 제외, 주 N일이면 유효 일수 올림) */
export function calcTotalDoses(sched: Pick<MedicationSchedule, 'startDate' | 'endDate' | 'times' | 'skipDates' | 'daysPerWeek'>): number {
  if (!sched.startDate || !sched.endDate || sched.times.length === 0) return 0;
  const start = new Date(sched.startDate);
  const end = new Date(sched.endDate);
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const skipCount = (sched.skipDates ?? []).filter((d) => d >= sched.startDate && d <= sched.endDate).length;
  const effectiveDays = sched.daysPerWeek
    ? Math.max(0, Math.ceil((totalDays - skipCount) * (sched.daysPerWeek / 7)))
    : Math.max(0, totalDays - skipCount);
  return effectiveDays * sched.times.length;
}
