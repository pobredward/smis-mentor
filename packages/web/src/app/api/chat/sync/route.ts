import { NextRequest, NextResponse } from 'next/server';
import { isChatStaff, resolveActiveJobCodeId, type ChatUserLike } from '@smis-mentor/shared';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { ChatServerError, syncGenerationChatRooms } from '@/lib/chatServer';

/**
 * POST /api/chat/sync  { jobCodeIds?: string[] }
 * 캠프 채팅방(캠프마다 6개 — 매니저방 포함)을 캠프 배정대로 맞춘다 — 그 캠프와 같은 기수 캠프 전부. 채팅 탭을 열 때 부른다 (안전망 —
 * 평소에는 Functions 가 배정이 바뀔 때 바로 맞춘다).
 * 캠프를 주지 않으면 지금 보고 있는 캠프. 내가 배정된 캠프만 (관리자는 아무 캠프나).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const me = { ...(auth.user as unknown as ChatUserLike), userId: auth.firebaseUid };
  if (!isChatStaff(me)) return NextResponse.json({ error: '캠프 선생님만 채팅을 쓸 수 있습니다.' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { jobCodeIds?: unknown };
  const mine = new Set([...(me.jobCodeIds ?? []), ...(me.jobExperiences ?? []).map((e) => e?.id).filter(Boolean) as string[]]);
  const asked = Array.isArray(body.jobCodeIds)
    ? body.jobCodeIds.filter((v): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)).slice(0, 3)
    : [];
  const active = resolveActiveJobCodeId(auth.user as unknown as Parameters<typeof resolveActiveJobCodeId>[0]);
  const targets = [...new Set(asked.length ? asked : active ? [active] : [])].filter((id) => me.role === 'admin' || mine.has(id));
  try {
    const results = [];
    const done = new Set<string>();
    for (const id of targets) {
      if (done.has(id)) continue;
      const r = await syncGenerationChatRooms(id).catch((e) => {
        // 지운 캠프 등 — 다른 캠프는 계속
        if (e instanceof ChatServerError && e.status === 404) return [];
        throw e;
      });
      r.forEach((x) => done.add(x.jobCodeId));
      results.push(...r);
    }
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof ChatServerError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('채팅방 동기화 오류:', e);
    return NextResponse.json({ error: '채팅방을 준비하지 못했습니다.' }, { status: 500 });
  }
}
