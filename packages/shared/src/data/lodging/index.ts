import type { CampType } from '../../types/student';
import type { LodgingBuilding } from '../../types/lodging';
import { ILSUNG_CONDO } from './ilsungCondo';

export { ILSUNG_CONDO } from './ilsungCondo';
export {
  lodgingViewerHtml,
  lodgingViewerRooms,
  type LodgingViewerPayload,
  type LodgingViewerMode,
  type LodgingViewerRooms,
} from './viewer';

/**
 * 캠프 종류 → 숙소 건물. 아직 E/J(일성콘도)만 있다.
 * S 캠프 등은 건물 데이터가 생기면 여기에 붙인다.
 */
export function lodgingBuildingFor(campType: CampType | null | undefined): LodgingBuilding | null {
  if (campType === 'EJ') return ILSUNG_CONDO;
  return null;
}
