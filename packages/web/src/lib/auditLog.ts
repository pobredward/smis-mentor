/**
 * 감사 로그 기록 (서버 전용, Admin SDK)
 * auditLogs 컬렉션: admin 읽기 전용, 클라이언트 쓰기 불가 (firestore.rules)
 *
 * 대상: 주민번호 복호화, 이메일 변경, 역할/상태 변경(Cloud Function 트리거), 사용자 삭제 등
 * 원칙: 민감값 자체(주민번호 등)는 절대 남기지 않는다 — "누가·언제·누구의 무엇을" 만.
 */
import { NextRequest } from 'next/server';
import { getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';

export type AuditAction =
  | 'RRN_DECRYPT'
  | 'EMAIL_CHANGE'
  | 'USER_ROLE_CHANGE'
  | 'USER_STATUS_CHANGE'
  | 'USER_CAMP_CHANGE'
  | 'STUDENT_SENSITIVE_VIEW'
  | 'COMMUNITY_REPORT_RESOLVE'
  | 'CAMP_PROFILE_UPDATE'
  | 'CAMP_PROFILE_REVEAL'
  | 'ESCORT_SSN_VIEW'
  | 'SIGNUP_TEMP_CLAIM'
  | 'ADMIN_EMAIL_CHANGE';

export async function writeAuditLog(params: {
  action: AuditAction;
  category: 'PRIVACY' | 'ACCOUNT' | 'COMMUNITY';
  performedBy: string;
  performedByName?: string;
  targetUserId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
  request?: NextRequest;
}): Promise<void> {
  try {
    await getAdminFirestore().collection('auditLogs').add({
      action: params.action,
      category: params.category,
      performedBy: params.performedBy,
      performedByData: params.performedByName ? { name: params.performedByName } : null,
      targetUserId: params.targetUserId ?? null,
      targetLabel: params.targetLabel ?? null,
      metadata: {
        ...(params.metadata ?? {}),
        ...(params.request && {
          ip: params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          userAgent: params.request.headers.get('user-agent') || null,
        }),
      },
      timestamp: adminFieldValue.serverTimestamp(),
      createdAt: adminFieldValue.serverTimestamp(),
    });
  } catch (e) {
    // 감사 로그 실패가 본 작업을 막지는 않되, 반드시 서버 로그에 남긴다
    logger.error('❌ 감사 로그 기록 실패:', { action: params.action, error: (e as Error)?.message });
  }
}
