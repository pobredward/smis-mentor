import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  logger,
  JOB_BOARD_INTERVIEW_DOC_ID,
  pickJobBoardInterview,
  resolveApplicantInterview,
  type ApplicantInterviewInfo,
  type ApplicantInterviewInfoResponse,
  type JobBoardInterview,
} from '@smis-mentor/shared';

/**
 * 지원자 본인의 면접 안내 (Zoom 링크 · 안내문 · 소요 시간)
 * GET /api/recruitment/interview-info
 *
 * 공고(jobBoards) 문서는 누구나 읽을 수 있어서 면접 정보는 관리자 전용 하위 문서(private/interview)로 옮겼다.
 * 지원자는 여기서 "자기" 지원서 중 서류 합격 · 면접 예정(accepted · pending)인 것만 받는다.
 *  - 값 우선순위: 지원서에 따로 넣은 값 → 공고 private/interview → 공고 문서의 예전 필드 → 면접 링크 관리(interviewSettings/links)의 Zoom 링크
 *  - 응답: { interviews: { [지원서 ID]: { link, notes, duration } } }
 */
const respond = (interviews: Record<string, ApplicantInterviewInfo>) =>
  NextResponse.json({ interviews } satisfies ApplicantInterviewInfoResponse, {
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  try {
    const db = getAdminFirestore();
    // 본인 지원서만 (refUserId == 로그인한 uid). 사람마다 몇 건 안 되므로 상태는 메모리에서 거른다 (복합 색인 불필요)
    const appsSnap = await db.collection('applicationHistories').where('refUserId', '==', auth.firebaseUid).get();
    const targets = appsSnap.docs.filter((d) => {
      const a = d.data();
      return a.applicationStatus === 'accepted' && a.interviewStatus === 'pending';
    });

    const interviews: Record<string, ApplicantInterviewInfo> = {};
    if (targets.length === 0) return respond(interviews);

    // 공고별 면접 정보 (private/interview, 없으면 공고 문서의 예전 필드)
    const boardIds = [...new Set(targets.map((d) => String(d.data().refJobBoardId ?? '')).filter((id) => id && !id.includes('/')))];
    const boardInterviews = new Map<string, JobBoardInterview>();
    await Promise.all(
      boardIds.map(async (id) => {
        const boardRef = db.collection('jobBoards').doc(id);
        const priv = await boardRef.collection('private').doc(JOB_BOARD_INTERVIEW_DOC_ID).get();
        const source = priv.exists ? priv.data() : (await boardRef.get()).data();
        boardInterviews.set(id, pickJobBoardInterview(source ?? null));
      }),
    );

    // 기본 Zoom 링크 (면접 링크 관리) — 지원서·공고 어디에도 링크가 없을 때만 필요
    let defaultLink: string | undefined;
    const needsDefault = targets.some((d) => {
      const own = pickJobBoardInterview(d.data());
      return !own.interviewBaseLink && !boardInterviews.get(String(d.data().refJobBoardId ?? ''))?.interviewBaseLink;
    });
    if (needsDefault) {
      const links = await db.collection('interviewSettings').doc('links').get();
      const zoomUrl = links.data()?.zoomUrl;
      if (typeof zoomUrl === 'string' && zoomUrl.trim()) defaultLink = zoomUrl.trim();
    }

    for (const d of targets) {
      const a = d.data();
      interviews[d.id] = resolveApplicantInterview(
        pickJobBoardInterview(a),
        boardInterviews.get(String(a.refJobBoardId ?? '')) ?? {},
        defaultLink,
      );
    }

    return respond(interviews);
  } catch (error) {
    logger.error('면접 안내 조회 오류:', error);
    return NextResponse.json({ error: '면접 안내를 불러오지 못했습니다.' }, { status: 500 });
  }
}
