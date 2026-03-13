import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobBoardId, applicationIds, expirationHours, createdBy } = body;

    if (!jobBoardId || !applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    if (!expirationHours || expirationHours <= 0) {
      return NextResponse.json(
        { error: '유효한 만료 시간을 설정해주세요.' },
        { status: 400 }
      );
    }

    if (!createdBy) {
      return NextResponse.json(
        { error: '생성자 정보가 필요합니다.' },
        { status: 401 }
      );
    }

    // 고유한 토큰 생성 (32바이트 랜덤 문자열)
    const token = randomBytes(32).toString('hex');
    
    // 만료 시간 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);

    // Firestore에 토큰 저장
    const shareTokenRef = await addDoc(collection(db, 'shareTokens'), {
      token,
      refJobBoardId: jobBoardId,
      refApplicationIds: applicationIds,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.fromDate(now),
      createdBy,
      isActive: true,
    });

    // 공유 URL 생성
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.smis-mentor.com';
    const shareUrl = `${baseUrl}/shared/applicants/${token}`;

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
      tokenId: shareTokenRef.id,
    });
  } catch (error) {
    console.error('공유 링크 생성 오류:', error);
    return NextResponse.json(
      { error: '공유 링크 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
