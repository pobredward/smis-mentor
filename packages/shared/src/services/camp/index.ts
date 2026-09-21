// 캠프 관련 서비스
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Firestore,
  Timestamp,
} from 'firebase/firestore';
import { CampClassInfo, CampGroup, CampSettings, CampTimetableCommon } from '../../types/camp';
import { cleanGuide, guideMediaPath, type TimetableGuide } from '../../types/timetableGuide';
import { cleanLodging, type CampLodging } from '../../types/lodging';
import { ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';

/**
 * campSettings/{campCode} 에서 그룹-반 매핑 조회
 */
export const getCampGroups = async (
  db: Firestore,
  campCode: string
): Promise<CampGroup[]> => {
  const snap = await getDoc(doc(db, 'campSettings', campCode));
  if (!snap.exists()) return [];
  const data = snap.data() as CampSettings;
  return data.groups ?? [];
};

/**
 * campSettings/{campCode} 에서 반이름·강의실 조회.
 * 기수마다 다른 값이라 시간표 문서가 아니라 여기에 한 벌만 둔다.
 */
export const getCampClassInfo = async (
  db: Firestore,
  campCode: string
): Promise<Record<string, CampClassInfo>> => {
  if (!campCode) return {};
  const snap = await getDoc(doc(db, 'campSettings', campCode));
  if (!snap.exists()) return {};
  return (snap.data() as CampSettings).classInfo ?? {};
};

/**
 * campSettings/{campCode} 의 반이름·강의실 저장.
 * 값이 빈 반은 아예 빼서 설정이 지저분해지지 않게 한다.
 */
export const updateCampClassInfo = async (
  db: Firestore,
  campCode: string,
  classInfo: Record<string, CampClassInfo>
): Promise<void> => {
  const cleaned: Record<string, CampClassInfo> = {};
  Object.entries(classInfo).forEach(([code, info]) => {
    const className = info?.className?.trim();
    const classroom = info?.classroom?.trim();
    const bookCode = info?.bookCode?.trim();
    const spareBookCode = info?.spareBookCode?.trim();
    if (className || classroom || bookCode || spareBookCode) {
      cleaned[code] = {
        ...(className ? { className } : {}),
        ...(classroom ? { classroom } : {}),
        ...(bookCode ? { bookCode } : {}),
        ...(spareBookCode ? { spareBookCode } : {}),
      };
    }
  });
  await setDoc(
    doc(db, 'campSettings', campCode),
    { campCode, classInfo: cleaned, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};

/**
 * campSettings/{campCode} 의 groups 필드 업데이트
 */
export const updateCampGroups = async (
  db: Firestore,
  campCode: string,
  groups: CampGroup[]
): Promise<void> => {
  await updateDoc(doc(db, 'campSettings', campCode), {
    groups,
    updatedAt: new Date().toISOString(),
  });
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
  if (!campCode) return {};
  const snap = await getDoc(doc(db, 'campSettings', campCode));
  if (!snap.exists()) return {};
  return (snap.data() as CampSettings).timetableCommon ?? {};
};

/**
 * 한 그룹의 공통 값 저장.
 * undefined 는 Firestore 가 싫어하므로 빈 값은 지우고 넣는다.
 */
export const updateCampTimetableCommon = async (
  db: Firestore,
  campCode: string,
  groupName: string,
  values: CampTimetableCommon
): Promise<void> => {
  const classes = (values.classes ?? []).map((c) => ({
    classCode: c.classCode,
    ...(c.teacherName?.trim() ? { teacherName: c.teacherName.trim() } : {}),
  }));
  const staffOverrides: Record<string, string> = {};
  Object.entries(values.staffOverrides ?? {}).forEach(([k, v]) => {
    if (v?.trim()) staffOverrides[k] = v.trim();
  });

  await setDoc(
    doc(db, 'campSettings', campCode),
    {
      campCode,
      timetableCommon: {
        [groupName]: { classes, staffOverrides },
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
};


/** campSettings/{campCode}.timetableGuides — 칸 설명 조회 */
export const getCampTimetableGuides = async (
  db: Firestore,
  campCode: string
): Promise<Record<string, TimetableGuide>> => {
  if (!campCode) return {};
  const snap = await getDoc(doc(db, 'campSettings', campCode));
  if (!snap.exists()) return {};
  return (snap.data() as CampSettings).timetableGuides ?? {};
};

/**
 * 칸 설명 저장.
 *
 * 중첩 맵이라 merge 로는 지운 항목이 남는다. 그래서 늘 통째로 바꿔 쓰고,
 * 내용이 빈 항목은 아예 빼서 설정이 지저분해지지 않게 한다.
 */
export const updateCampTimetableGuides = async (
  db: Firestore,
  campCode: string,
  guides: Record<string, TimetableGuide>,
  userId?: string
): Promise<void> => {
  const now = new Date().toISOString();
  const cleaned: Record<string, TimetableGuide> = {};
  Object.entries(guides).forEach(([key, guide]) => {
    const g = cleanGuide(guide);
    if (!g.summary && !g.sections?.length) return;
    cleaned[key] = { ...g, updatedAt: now, ...(userId ? { updatedBy: userId } : {}) };
  });
  const ref = doc(db, 'campSettings', campCode);
  // 먼저 문서가 있는지 보장하고(없으면 만들고), 그 다음 맵을 통째로 갈아끼운다.
  // setDoc(merge) 는 중첩 맵을 합치기만 해서 지운 항목이 그대로 남는다.
  await setDoc(ref, { campCode, updatedAt: now }, { merge: true });
  await updateDoc(ref, { timetableGuides: cleaned });
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
  if (!campCode) return {};
  const snap = await getDoc(doc(db, 'campSettings', campCode));
  if (!snap.exists()) return {};
  return (snap.data() as CampSettings).lodging ?? {};
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
  await setDoc(ref, { campCode, updatedAt: now }, { merge: true });
  await updateDoc(ref, { lodging: cleaned });
  return cleaned;
};
