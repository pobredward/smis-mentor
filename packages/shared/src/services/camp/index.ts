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
        [groupName]: { classes, staffOverrides, subjects: values.subjects ?? [] },
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
};
