import {
  getCampGroups,
  getCampLodging,
  lodgingBuildingFor,
  type CampCode,
  type CampGroup,
  type CampLodging,
  type CampType,
  type LodgingBuilding,
  type STSheetStudent,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { stSheetService } from './stSheet';
import { getUsersByJobCodeId } from './userService';
import jobCodesService from './jobCodesService';

/**
 * 숙소 화면이 쓰는 데이터 묶음.
 * 명단 탭(students)처럼 AsyncStorage 에도 남겨 캠프장에서 오프라인으로도 볼 수 있게 한다.
 */
export interface LodgingBundle {
  campCode: string;
  campType: CampType | null;
  building: LodgingBuilding | null;
  students: STSheetStudent[];
  lodging: CampLodging;
  /** 반코드 → 캠프 그룹 (겹쳐 보기에 쓴다) */
  groups: CampGroup[];
  /** 관리자 선생님 고르기용 — 이름만 */
  memberNames: string[];
}

export const lodgingQueryKey = (jobCodeId: string) => ['lodging', jobCodeId] as const;

export async function loadLodgingBundle(jobCodeId: string, isAdmin: boolean): Promise<LodgingBundle> {
  const jobCode = (await jobCodesService.getJobCodeById(jobCodeId)) as { code?: string } | null;
  const campCode = jobCode?.code ?? '';
  const campType = campCode ? stSheetService.getCampType(campCode as CampCode) : null;
  const building = lodgingBuildingFor(campType);
  if (!campCode || !building) {
    return { campCode, campType, building, students: [], lodging: {}, groups: [], memberNames: [] };
  }
  const [students, lodging, groups, members] = await Promise.all([
    stSheetService.getCachedData(campCode as CampCode),
    getCampLodging(db, campCode),
    getCampGroups(db, campCode),
    isAdmin ? getUsersByJobCodeId(jobCodeId) : Promise.resolve([]),
  ]);
  const memberNames = Array.from(new Set(members.map((m) => m.name).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ko')
  );
  return { campCode, campType, building, students, lodging, groups, memberNames };
}
