/**
 * 공고 면접 안내 (Zoom 링크 · 안내문 · 소요 시간) — web·mobile 공용.
 *
 * jobBoards 문서는 누구나 읽을 수 있어서(공개 공고) 면접 정보는 관리자 전용 하위 문서
 * jobBoards/{id}/private/interview 에 둔다. 예전 공고 문서에 남아 있는 interviewBase* 필드는
 * 읽을 때만 대신 쓰고(전환기), 저장할 때 지운다. interviewPassword 는 항상 비어 있던 필드라 같이 지운다.
 * 지원자는 /api/recruitment/interview-info 로 자기 지원서 것만 받는다.
 */
import { type Firestore, deleteDoc, deleteField, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

export type JobBoardInterview = {
  interviewBaseLink?: string;
  interviewBaseNotes?: string;
  interviewBaseDuration?: number;
};

/** 지원자 화면용 면접 안내 한 건 (/api/recruitment/interview-info 응답) */
export interface ApplicantInterviewInfo {
  link: string;
  notes: string;
  /** 분. 없으면 null */
  duration: number | null;
}

/** GET /api/recruitment/interview-info 응답 — 지원서 ID → 면접 안내 */
export interface ApplicantInterviewInfoResponse {
  interviews: Record<string, ApplicantInterviewInfo>;
}

/** 공고 문서에 있던 예전 면접 필드 — 공개 문서라 더 쓰지 않는다 */
export const LEGACY_JOB_BOARD_INTERVIEW_FIELDS = [
  'interviewBaseLink',
  'interviewBaseNotes',
  'interviewBaseDuration',
  'interviewPassword',
] as const;

type LegacyInterviewField = (typeof LEGACY_JOB_BOARD_INTERVIEW_FIELDS)[number];

/** 면접 정보 하위 문서 ID (jobBoards/{id}/private/interview) */
export const JOB_BOARD_INTERVIEW_DOC_ID = 'interview';

/** 문서 데이터에서 면접 필드만 골라낸다 (형식이 맞지 않는 값은 뺀다) */
export function pickJobBoardInterview(data: Record<string, unknown> | null | undefined): JobBoardInterview {
  const out: JobBoardInterview = {};
  if (!data) return out;
  if (typeof data.interviewBaseLink === 'string') out.interviewBaseLink = data.interviewBaseLink;
  if (typeof data.interviewBaseNotes === 'string') out.interviewBaseNotes = data.interviewBaseNotes;
  const rawDuration = data.interviewBaseDuration;
  if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
    const n = Number(rawDuration);
    if (Number.isFinite(n)) out.interviewBaseDuration = n;
  }
  return out;
}

/** 공고 문서에 쓸 데이터에서 예전 면접 필드를 뺀다 — 공개 문서에 면접 정보가 다시 들어가지 않게 */
export function omitLegacyInterviewFields<T extends Record<string, any>>(data: T): Omit<T, LegacyInterviewField> {
  const rest: Record<string, any> = { ...data };
  for (const k of LEGACY_JOB_BOARD_INTERVIEW_FIELDS) delete rest[k];
  return rest as Omit<T, LegacyInterviewField>;
}

/** 지원자에게 보여줄 면접 안내 — 지원서 값 → 공고 값 → 기본 링크(면접 링크 관리) 순 */
export function resolveApplicantInterview(
  application: JobBoardInterview,
  board: JobBoardInterview,
  defaultLink?: string,
): ApplicantInterviewInfo {
  return {
    link: application.interviewBaseLink || board.interviewBaseLink || defaultLink || '',
    notes: application.interviewBaseNotes || board.interviewBaseNotes || '',
    duration: application.interviewBaseDuration || board.interviewBaseDuration || null,
  };
}

const interviewDocRef = (db: Firestore, jobBoardId: string) =>
  doc(db, 'jobBoards', jobBoardId, 'private', JOB_BOARD_INTERVIEW_DOC_ID);

/**
 * 공고 면접 정보 읽기 (관리자 전용 — 규칙상 다른 사람은 거부된다).
 * private/interview 가 없으면 공고 문서의 예전 필드를 쓴다 (옮기기 전 데이터).
 */
export async function getJobBoardInterview(db: Firestore, jobBoardId: string): Promise<JobBoardInterview> {
  const snap = await getDoc(interviewDocRef(db, jobBoardId));
  if (snap.exists()) return pickJobBoardInterview(snap.data());
  const boardSnap = await getDoc(doc(db, 'jobBoards', jobBoardId));
  return pickJobBoardInterview(boardSnap.exists() ? boardSnap.data() : null);
}

/**
 * 공고 면접 정보 저장 (관리자 전용).
 * private/interview 에 합쳐 쓰고(merge), 공고 문서에 남은 예전 필드는 지운다 — 한 번에(batch).
 * 처음 옮길 때는 이번에 바꾸지 않은 예전 값(예: 안내문)도 같이 옮겨서 잃지 않게 한다.
 */
export async function saveJobBoardInterview(
  db: Firestore,
  jobBoardId: string,
  data: JobBoardInterview,
): Promise<void> {
  const ref = interviewDocRef(db, jobBoardId);
  const boardRef = doc(db, 'jobBoards', jobBoardId);
  const [snap, boardSnap] = await Promise.all([getDoc(ref), getDoc(boardRef)]);
  const boardData = boardSnap.exists() ? boardSnap.data() : null;
  const carried = snap.exists() ? {} : pickJobBoardInterview(boardData);

  const batch = writeBatch(db);
  batch.set(ref, { ...carried, ...pickJobBoardInterview(data), updatedAt: serverTimestamp() }, { merge: true });
  if (boardData && LEGACY_JOB_BOARD_INTERVIEW_FIELDS.some((k) => k in boardData)) {
    batch.update(boardRef, {
      interviewBaseLink: deleteField(),
      interviewBaseNotes: deleteField(),
      interviewBaseDuration: deleteField(),
      interviewPassword: deleteField(),
    });
  }
  await batch.commit();
}

/** 공고를 지울 때 면접 정보 하위 문서도 지운다 (하위 문서는 공고와 함께 지워지지 않음) */
export async function deleteJobBoardInterview(db: Firestore, jobBoardId: string): Promise<void> {
  await deleteDoc(interviewDocRef(db, jobBoardId));
}
