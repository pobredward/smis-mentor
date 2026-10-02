import type { LessonPlanStatus } from '@smis-mentor/shared';

/** 레슨플랜 상태 배지 색 */
export const STATUS_STYLE: Record<LessonPlanStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  changes: 'bg-amber-50 text-amber-800',
};
