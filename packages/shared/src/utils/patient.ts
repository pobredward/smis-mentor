/**
 * 환자 탭 공용 도메인 상수·순수 함수 (web PatientContent · mobile PatientScreen)
 * 예전에는 두 화면에 각각 복사돼 있어 증상 가이드가 17개 / 18개로 어긋나 있었다.
 */
import type { MedicationCategory, MedicationSchedule, MedicationTime } from '../types/camp';
import { MEDICATION_TIMES } from '../types/camp';
import { Timestamp } from 'firebase/firestore';
import { L } from '../i18n';
import type { CampLodging } from '../types/lodging';

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

// ==================== 약복용 명단 추가 폼 (web · mobile 공용) ====================

/** 약복용 명단에 올리는 상시약 한 개 — 입력 폼 값 */
export interface MedListForm {
  name: string;
  times: MedicationTime[];
  /** true = 퇴소까지 (endDateAuto) */
  untilEnd: boolean;
  startDate: string;
  endDate: string;
  memo: string;
  category?: MedicationCategory;
  /** 주 N일 (없으면 매일) */
  daysPerWeek?: number;
  skipDates: string[];
  firstTime?: MedicationTime;
  lastTime?: MedicationTime;
}

export function emptyMedListForm(today: string): MedListForm {
  return { name: '', times: [], untilEnd: true, startDate: today, endDate: today, memo: '', skipDates: [] };
}

export function medListFormFrom(s: MedicationSchedule): MedListForm {
  return {
    name: s.name ?? '',
    times: [...(s.times ?? [])],
    untilEnd: !!s.endDateAuto,
    startDate: s.startDate,
    endDate: s.endDate,
    memo: s.memo ?? '',
    category: s.category,
    daysPerWeek: s.daysPerWeek,
    skipDates: [...(s.skipDates ?? [])],
    firstTime: s.firstTime,
    lastTime: s.lastTime,
  };
}

/** 폼 → 저장할 스케줄. 퇴소까지면 종료일은 캠프 종료일(모르면 시작일) — 값이 없는 칸은 넣지 않는다 */
export function medListScheduleOf(f: MedListForm, campEndDate?: string): Omit<MedicationSchedule, 'checkedTimes'> {
  const endDate = f.untilEnd
    ? (campEndDate && campEndDate >= f.startDate ? campEndDate : f.startDate)
    : (f.endDate && f.endDate >= f.startDate ? f.endDate : f.startDate);
  const skipDates = [...new Set(f.skipDates)].filter(d => d >= f.startDate && d <= endDate).sort();
  const memo = f.memo.trim();
  const base = {
    name: f.name.trim(),
    times: MEDICATION_TIMES.filter(t => f.times.includes(t)),
    startDate: f.startDate,
    endDate,
    ...(f.untilEnd ? { endDateAuto: true } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(memo ? { memo } : {}),
    ...(f.daysPerWeek && f.daysPerWeek < 7 ? { daysPerWeek: f.daysPerWeek } : {}),
    ...(skipDates.length ? { skipDates } : {}),
    ...(f.firstTime ? { firstTime: f.firstTime } : {}),
    ...(f.lastTime ? { lastTime: f.lastTime } : {}),
  };
  return { ...base, totalDoses: calcTotalDoses(base) };
}

/** 메모 빠른 문구 넣기/빼기 (' · ' 로 잇는다) */
export function toggleMemoPhrase(memo: string, phrase: string): string {
  const parts = memo.split('·').map(x => x.trim()).filter(Boolean);
  const next = parts.includes(phrase) ? parts.filter(x => x !== phrase) : [...parts, phrase];
  return next.join(' · ');
}

// ==================== 환자 위치 선택지 ====================

/**
 * 숙소 탭에서 용도를 '환자방'·'교무실'로 지정한 방 → 환자 위치 버튼 ("환자방 214호 (남)")
 * 캠프마다 다른 호수를 관리자가 따로 적지 않아도 된다. 숙소 설정이 없으면 빈 목록.
 */
export function patientPlaceOptions(lodging: CampLodging | null | undefined): string[] {
  const rooms = Object.entries(lodging?.rooms ?? {});
  const pick = (purpose: string) => rooms
    .filter(([, r]) => r?.purpose?.trim() === purpose)
    .sort(([a], [b]) => a.localeCompare(b, 'ko', { numeric: true }))
    .map(([num, r]) => `${purpose} ${num}호${r.label?.trim() ? ` (${r.label.trim()})` : ''}`);
  return [...pick('환자방'), ...pick('교무실')];
}
/** 위치 값이 어떤 입력 방식인지 — 버튼 / 방 호수 / 직접 입력 */
export function patientPlaceKind(value: string, options: string[]): 'option' | 'room' | 'etc' | 'none' {
  const v = value.trim();
  if (!v) return 'none';
  if (options.includes(v)) return 'option';
  if (/^\d{1,5}호$/.test(v)) return 'room';
  return 'etc';
}


// ==================== 선생님 환자 · 중간보고 번호 ====================

/** 선생님 환자의 반 자리에 들어가는 이름 — 환자 현황에서 '선생님' 묶음으로 모인다 */
export const STAFF_PATIENT_CLASS = '선생님';

export function isStaffPatient(r: { patientKind?: string; studentId?: string }): boolean {
  return r.patientKind === 'staff' || (r.studentId ?? '').startsWith('staff_');
}

export function staffPatientId(userId: string): string {
  return `staff_${userId}`;
}

/** 지금까지 올린 중간보고 수 — 카드 뱃지 "중간보고3" */
export function midReportCount(r: { progressLogs?: Array<{ status?: string }> }): number {
  return (r.progressLogs ?? []).filter((l) => l.status === '중간보고').length;
}

/** 내원 날짜('YYYY-MM-DD') + 출발 시간('HH:mm', 없으면 0시) → 기기 시간대 기준 Timestamp */
export function visitScheduledAt(ymd: string, hhmm?: string): Timestamp {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = /^\d{1,2}:\d{2}$/.test(hhmm ?? '') ? (hhmm as string).split(':').map(Number) : [0, 0];
  return Timestamp.fromDate(new Date(y, (m || 1) - 1, d || 1, h, mi));
}

/** 내원 날짜 표시 — "9/29 (오늘)", "9/30 (내일)", "10/2" */
export function visitDayLabel(at: { toDate?: () => Date } | undefined, now = new Date()): string {
  const d = at?.toDate?.();
  if (!d) return '';
  const base = `${d.getMonth() + 1}/${d.getDate()}`;
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return `${base} (${L('patient.vdToday')})`;
  if (same(d, new Date(now.getTime() + 86400000))) return `${base} (${L('patient.vdTomorrow')})`;
  return base;
}

/**
 * 캠프 시작일·종료일('YYYY-MM-DD') — jobCodes.startDate / endDate.
 * 날짜의 00:00(UTC 또는 KST)로 저장돼 있어, 12시간 더한 뒤 UTC 날짜를 읽으면 어느 쪽이든 그 날짜가 된다.
 */
export function campDateYmd(endDate: { toDate?: () => Date } | Date | string | null | undefined): string {
  if (!endDate) return '';
  const d = typeof endDate === 'string' ? new Date(endDate)
    : endDate instanceof Date ? endDate
    : endDate.toDate?.();
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 약 사진·영상 주소가 영상인가 (Storage 주소의 파일 확장자로 판단) */
export function isVideoUrl(url: string): boolean {
  let path = url;
  try { path = decodeURIComponent(url.split('?')[0]); } catch { /* 그대로 */ }
  return /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(path);
}

/** 약 기간 표시 — "퇴소까지 매일" / "8/1 ~ 퇴소까지" / "8/1 ~ 8/5" */
export function medPeriodLabel(s: Pick<MedicationSchedule, 'startDate' | 'endDate' | 'endDateAuto'>, today: string): string {
  const md = (d: string) => { const [, m, dd] = d.split('-'); return m && dd ? `${+m}/${+dd}` : d; };
  if (s.endDateAuto) return s.startDate <= today ? L('patient.campEnd2') : L('patient.campEnd3', { v0: md(s.startDate) });
  return `${md(s.startDate)} ~ ${md(s.endDate)}`;
}

/** 처방약 기본 복용 기간 (일) */
export const DEFAULT_MED_DAYS = 3;

/** 'YYYY-MM-DD' 에 n일 더하기 */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** 캠프 종료일 — 약 '퇴소까지' 의 마지막 날 */
export const campEndYmd = campDateYmd;
