/**
 * 원어민 레슨플랜 (앱에서 작성) — 저장 모양.
 *
 * 저장: lessonPlans/{userId}_{jobCodeId}_{bookKey}
 *  - 한 문서 = 선생님 × 교재 (같은 교재를 가르치는 반은 함께 쓴다, 보조 교재는 반 키 'J07:spare')
 *  - 내용은 날짜가 아니라 "줄(lane)의 순서"로 저장한다 — 교재 줄(book)과 액티비티 줄(activity)
 *    날짜·Day 번호는 캠프 일정표(dayPlan)로 화면에서 붙인다 (utils/lessonPlanEngine.ts)
 *  - 반마다 다른 사정(그날 수업 없음, 한 반만 밀림, 보충 수업)은 classes[반] 에 따로 적는다
 *
 * 교재 단원 목록: appSettings/eslBookUnits (EslBookUnits) — 모든 캠프가 같이 쓴다
 */

export type PlanLane = 'book' | 'activity';

/** item: 보통 칸 · blank: 이 칸은 비우고 뒤를 민다 · continue: 앞 칸을 이어서 한다 */
export type PlanItemKind = 'item' | 'blank' | 'continue';

export interface PlanItem {
  id: string;
  kind?: PlanItemKind;
  /** 교재 줄 — 단원 번호 (교재 단원 목록 기준). 두 단원을 하루에 하면 [5, 6] */
  units?: number[];
  /** 교재 줄 — "Part 1" 처럼 한 단원을 나눌 때 */
  part?: string;
  /** 자유 글 (단원 설명에 덧붙이거나, 단원 없이 쓰는 칸) */
  text?: string;
  /** 교재 줄 — 이 칸이 놓인 날의 복습 (비우면 앞 수업 단원으로 자동) */
  review?: string;
  /** 이 날짜에 고정 — 앞이 밀려도 이 날에 남는다 (YYYY-MM-DD) */
  pinDate?: string;
  /** 앞 칸과 같은 날에 함께 (두 칸을 하루에 — 진도 따라잡기) */
  withPrev?: boolean;
  materials?: string[];
}

/** 그날 이 반 수업 없음 (아픔·행사·다른 활동) — 뒤 레슨이 하루씩 밀린다 */
export interface PlanSkip {
  date: string;
  note?: string;
}

/** 한 반만 밀기 — 기준 칸(anchor) 앞/뒤에 빈 칸 또는 이어하기 칸 */
export interface PlanGap {
  id: string;
  lane: PlanLane;
  anchor: string;
  position: 'before' | 'after';
  kind: 'blank' | 'continue';
  note?: string;
}

/** 한 반만 빼기 — merge 면 앞 칸과 같은 날에 함께(따라잡기), 아니면 그 반은 하지 않음 */
export interface PlanDrop {
  lane: PlanLane;
  itemId: string;
  merge?: boolean;
}

export interface PlanClassAdjust {
  skips?: PlanSkip[];
  /** 원래 수업이 없는 날 보충 수업 */
  extraDays?: string[];
  gaps?: PlanGap[];
  drops?: PlanDrop[];
}

export type LessonPlanStatus = 'draft' | 'submitted' | 'approved' | 'changes';

export interface LessonPlanDoc {
  id: string;
  userId: string;
  userName?: string;
  jobCodeId: string;
  campCode: string;
  /** 선생님 그룹 (일정 세트를 고를 때) */
  group?: string;
  /** Speaking · Reading · Writing */
  subject: string;
  /** 교재 짧은 이름 — eslBooks 와 같은 이름 (예: 'Clue 2') */
  bookTitle: string;
  /** 이 교재를 쓰는 L-Code (예: ['Bc']) */
  bookCodes: string[];
  /** 반 키 — 'J07', 보조 교재는 'J07:spare' */
  classCodes: string[];
  /** Day 01 오리엔테이션 */
  orientation?: string;
  /** Final Test Day */
  final?: string;
  book: PlanItem[];
  activity: PlanItem[];
  classes?: Record<string, PlanClassAdjust>;
  status: LessonPlanStatus;
  /** 관리자 메모 (수정 요청 이유 등) */
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: unknown;
  submittedAt?: unknown;
  /** 승인 뒤에 고쳤는지 */
  editedAfterApproval?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ── 교재 단원 목록 ──────────────────────────────────────────────────

export type EslSubject = 'speaking' | 'reading' | 'writing';

export interface BookUnit {
  no: number;
  title: string;
  /** Fiction · Nonfiction · Descriptive writing … */
  genre?: string;
  /** 주제 (Environment …) */
  theme?: string;
  /** 원래 교재 쪽 (예: '7-10') */
  sbPages?: string;
  wbPages?: string;
  objective?: string;
  /** 읽기 스킬 · 말하기 기능 · 글쓰기 문법 */
  focus?: string;
  /** 핵심 단어 (앞의 몇 개가 액티비티·복습에 쓰인다) */
  words?: string[];
}

export interface BookCatalogEntry {
  title: string;
  fullTitle?: string;
  subject: EslSubject;
  units: BookUnit[];
  /** 교사용 자료 — 지도서·답지·단어장·진도표 (모든 사용자 열람) */
  links?: { label: string; url: string }[];
  /** 교재 전체 Canva 공개 보기 링크 */
  canvaUrl?: string;
}

/** 캠프 합본(단권화) — L-Code 마다 */
export interface BundleEntry {
  code: string;
  /** Canva 공개보기 링크 (뒤에 #쪽번호) */
  canvaUrl?: string;
  /** Drive PDF */
  driveUrl?: string;
  /** 교재 이름 → 합본에 들어간 단원과 단원 첫 쪽 (합본 PDF 쪽 번호) */
  books: Record<string, { units: number[]; pages: Record<string, number> }>;
}

export interface EslBookUnits {
  books: Record<string, BookCatalogEntry>;
  bundles: Record<string, BundleEntry>;
  updatedAt?: string;
}
