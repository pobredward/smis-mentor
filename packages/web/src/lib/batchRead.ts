/** 여러 문서 한 번에 읽기 — 구현은 shared (mobile 과 같은 코드). 웹 db 를 묶어 둔다 */
import { getDocsByIds as getDocsByIdsIn, queryWhereIn as queryWhereInOf } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export const getDocsByIds = (col: string, ids: string[]) => getDocsByIdsIn(db, col, ids);
export const queryWhereIn = (col: string, field: string, values: string[]) => queryWhereInOf(db, col, field, values);
