// 캠프 관련 서비스
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Firestore,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { CampClassInfo, CampGroup, CampSettings, CampTimetableCommon } from '../../types/camp';
import { guideMediaPath, type TimetableGuide } from '../../types/timetableGuide';
import { cleanLodging, type CampLodging } from '../../types/lodging';
import type { CampDayPlan } from '../../types/campDayPlan';
import type { CampRosterDoc } from '../../types/campRoster';
import { ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';

/**
 * campSettings/{campCode} 문서 읽기 — 한 화면에서 한 번만.
 *
 * 문서가 크고(평균 40KB, 큰 건 120KB 넘음) 웹·앱 모두 오프라인 캐시가 없어서 getDoc 은 매번 서버에서 받는다.
 * 시간표 화면처럼 그룹·반 정보·공통 값·일정표·칸 설명을 따로 부르면 같은 문서를 5~6번 받게 되므로,
 * 같은 캠프를 짧은 시간(SETTINGS_TTL_MS) 안에 다시 부르면 받아 둔 것을 쓴다 (동시에 부른 것도 한 번).
 *
 * 스냅샷을 담아 두고 부를 때마다 data() 로 새 객체를 만든다 — 한 화면이 고쳐도 다른 화면 값이 바뀌지 않는다.
 * campSettings 를 쓰는 곳(이 파일의 저장 함수, 시간표 편집기 저장)은 쓰고 나서 invalidateCampSettingsCache 를 부른다.
 * 편집기처럼 꼭 최신이어야 하면 fresh: true (서버에서 받고 받은 것으로 캐시도 바꾼다).
 */
const SETTINGS_TTL_MS = 30_000;
const settingsSnapCache = new Map<string, { at: number; snap: Promise<DocumentSnapshot> }>();

const readCampSettingsSnap = (db: Firestore, campCode: string, fresh?: boolean): Promise<DocumentSnapshot> => {
  const hit = settingsSnapCache.get(campCode);
  if (!fresh && hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.snap;
  const entry = { at: Date.now(), snap: getDoc(doc(db, 'campSettings', campCode)) };
  settingsSnapCache.set(campCode, entry);
  // 실패는 담아 두지 않는다 — 다음에 부르면 다시 받는다
  entry.snap.catch(() => {
    if (settingsSnapCache.get(campCode) === entry) settingsSnapCache.delete(campCode);
  });
  return entry.snap;
};

/** campSettings/{campCode} 문서 전체 (없으면 null). 30초 안의 같은 캠프 호출은 네트워크 읽기 한 번 */
export const getCampSettingsDoc = async (
  db: Firestore,
  campCode: string,
  opts?: { fresh?: boolean }
): Promise<CampSettings | null> => {
  if (!campCode) return null;
  const snap = await readCampSettingsSnap(db, campCode, opts?.fresh);
  return snap.exists() ? (snap.data() as CampSettings) : null;
};

/** campSettings 를 쓴 뒤 — 다음 읽기가 서버에서 다시 받게 (campCode 없으면 전부) */
export const invalidateCampSettingsCache = (campCode?: string): void => {
  if (campCode) settingsSnapCache.delete(campCode);
  else settingsSnapCache.clear();
};

/**
 * campSettings/{campCode} 에서 그룹-반 매핑 조회
 */
export const getCampGroups = async (
  db: Firestore,
  campCode: string
): Promise<CampGroup[]> => {
  return (await getCampSettingsDoc(db, campCode))?.groups ?? [];
};

/**
 * campSettings/{campCode} 에서 반이름·강의실 조회.
 * 기수마다 다른 값이라 시간표 문서가 아니라 여기에 한 벌만 둔다.
 */
export const getCampClassInfo = async (
  db: Firestore,
  campCode: string
): Promise<Record<string, CampClassInfo>> => {
  return (await getCampSettingsDoc(db, campCode))?.classInfo ?? {};
};

/**
 * classCode로 해당 그룹명 찾기
 * @returns 그룹명 (없으면 null)
 */
export const findGroupByClassCode = (
  groups: CampGroup[],
  classCode: string
): CampGroup | null => {
  return groups.find(g => g.classCodes.includes(classCode)) ?? null;
};

/**
 * 같은 그룹에 속한 모든 classCodes 반환
 */
export const getSameGroupClassCodes = (
  groups: CampGroup[],
  classCode: string
): string[] => {
  const group = findGroupByClassCode(groups, classCode);
  return group?.classCodes ?? [classCode];
};


/**
 * campSettings/{campCode}.timetableCommon — 그룹별 공통 시간표 값 조회.
 * 같은 그룹의 모든 Day 가 이 값을 함께 쓴다.
 */
export const getCampTimetableCommon = async (
  db: Firestore,
  campCode: string
): Promise<Record<string, CampTimetableCommon>> => {
  return (await getCampSettingsDoc(db, campCode))?.timetableCommon ?? {};
};

/**
 * campSettings/{campCode}.timetableGuides — 칸 설명 조회.
 * 멘토·부매니저용과 원어민용(foreign)이 함께 온다 — 누구에게 무엇을 보일지는 화면이 정한다
 * (guideAudienceOf · hasGuideContent(g, audience) · guideBodyFor).
 */
export const getCampTimetableGuides = async (
  db: Firestore,
  campCode: string
): Promise<Record<string, TimetableGuide>> => {
  return (await getCampSettingsDoc(db, campCode))?.timetableGuides ?? {};
};

/**
 * 칸 설명에 넣을 사진·동영상을 Storage 에 올린다.
 * web 은 File, mobile 은 fetch 로 만든 Blob 을 그대로 넘기면 된다.
 *
 * 파일 종류(contentType)를 꼭 붙인다 — 폰에서 fetch 로 만든 Blob 은 종류가 비어 있을 때가 있고,
 * 저장소 규칙이 사진·동영상만 받기 때문이다.
 */
export const uploadGuideMedia = async (
  storage: FirebaseStorage,
  campCode: string,
  guideKey: string,
  file: Blob,
  fileName: string,
  contentType?: string
): Promise<{ url: string; storagePath: string }> => {
  const storagePath = guideMediaPath(campCode, guideKey, fileName);
  const storageRef = ref(storage, storagePath);
  const type = contentType || file.type || guessMediaType(fileName);
  await uploadBytes(storageRef, file, type ? { contentType: type } : undefined);
  return { url: await getDownloadURL(storageRef), storagePath };
};

/** 확장자로 사진·동영상 종류 짐작 */
function guessMediaType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', '3gp': 'video/3gpp',
  };
  return map[ext] ?? '';
}

/** 칸 설명 사진·동영상 올리기 실패 — 사용자에게 보여 줄 한 줄 */
export function guideUploadError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? '';
  if (code === 'storage/unauthorized') return '저장소 권한이 없습니다. 관리자 계정으로 로그인했는지, 저장소 규칙(storage.rules)이 배포됐는지 확인해 주세요.';
  if (code === 'storage/canceled') return '올리기를 취소했습니다.';
  if (code === 'storage/quota-exceeded') return '저장소 용량이 부족합니다.';
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/network-error') return '네트워크가 불안정해 올리지 못했습니다. 다시 시도해 주세요.';
  return '올리지 못했습니다.' + (code ? ` (${code})` : '');
}


/** campSettings/{campCode}.lodging — 숙소 방 용도·선생님 배치 조회 */
export const getCampLodging = async (
  db: Firestore,
  campCode: string
): Promise<CampLodging> => {
  return (await getCampSettingsDoc(db, campCode))?.lodging ?? {};
};

/**
 * 숙소 설정 저장 — 칸 설명과 같은 이유로 맵을 통째로 갈아끼운다.
 * (setDoc merge 는 지운 방의 값을 남긴다)
 */
export const updateCampLodging = async (
  db: Firestore,
  campCode: string,
  lodging: CampLodging,
  userId?: string
): Promise<CampLodging> => {
  const now = new Date().toISOString();
  const cleaned: CampLodging = {
    ...cleanLodging(lodging),
    updatedAt: now,
    ...(userId ? { updatedBy: userId } : {}),
  };
  const ref = doc(db, 'campSettings', campCode);
  try {
    await setDoc(ref, { campCode, updatedAt: now }, { merge: true });
    await updateDoc(ref, { lodging: cleaned });
  } finally {
    invalidateCampSettingsCache(campCode);
  }
  return cleaned;
};


/** campSettings/{campCode}.dayPlan — 일정표 (날짜별 Day · 익사이팅 활동표) */
export const getCampDayPlan = async (db: Firestore, campCode: string): Promise<CampDayPlan | null> => {
  const plan = (await getCampSettingsDoc(db, campCode))?.dayPlan;
  return plan?.sets ? plan : null;
};

/**
 * campRosters/{jobCodeId} — 관리자가 붙여넣은 캠프 선생님 표 (그룹·반·영어 이름·강의실·항공·방)
 * 스태프 읽기 전용 (저장은 관리자 페이지 → 서버). 민감 정보는 들어 있지 않다.
 */
export const getCampRoster = async (db: Firestore, jobCodeId: string): Promise<CampRosterDoc | null> => {
  if (!jobCodeId) return null;
  const snap = await getDoc(doc(db, 'campRosters', jobCodeId));
  return snap.exists() ? (snap.data() as CampRosterDoc) : null;
};
