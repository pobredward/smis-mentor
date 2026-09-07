// 캠프 관련 서비스
import {
  doc,
  getDoc,
  updateDoc,
  Firestore,
  Timestamp,
} from 'firebase/firestore';
import { CampGroup, CampSettings } from '../../types/camp';

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
