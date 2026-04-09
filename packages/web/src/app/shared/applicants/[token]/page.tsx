import { Metadata } from 'next';
import { SharedApplicantsClient } from './client';
import { getAdminFirestore } from '@/lib/firebase-admin';

type SegmentParams = { token: string };

interface PageProps {
  params: Promise<SegmentParams>;
}

// 동적 메타데이터 생성
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  
  try {
    const db = getAdminFirestore();
    
    // 토큰 검증
    const tokenSnapshot = await db
      .collection('shareTokens')
      .where('token', '==', token)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (tokenSnapshot.empty) {
      return {
        title: '멘토 정보',
        description: '공유된 지원자 정보',
      };
    }

    const shareTokenData = tokenSnapshot.docs[0].data();
    const applicationIds = shareTokenData.refApplicationIds || [];
    
    // 첫 번째 지원자 정보 가져오기
    if (applicationIds.length > 0) {
      const appDoc = await db.collection('applicationHistories').doc(applicationIds[0]).get();
      
      if (appDoc.exists) {
        const appData = appDoc.data();
        const userDoc = await db.collection('users').doc(appData?.refUserId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const name = userData?.name || '지원자';
          const age = userData?.age || '';
          const profileImage = userData?.profileImage || userData?.photoURL;
          
          return {
            title: '멘토 정보',
            description: `${name}(${age})`,
            openGraph: {
              title: '멘토 정보',
              description: `${name}(${age})`,
              images: profileImage ? [
                {
                  url: profileImage,
                  width: 400,
                  height: 400,
                  alt: `${name} 프로필 사진`,
                }
              ] : [],
            },
            twitter: {
              card: 'summary',
              title: '멘토 정보',
              description: `${name}(${age})`,
              images: profileImage ? [profileImage] : [],
            },
          };
        }
      }
    }
    
    return {
      title: '멘토 정보',
      description: '공유된 지원자 정보',
    };
  } catch (error) {
    console.error('메타데이터 생성 오류:', error);
    return {
      title: '멘토 정보',
      description: '공유된 지원자 정보',
    };
  }
}

export default async function SharedApplicantsPage({ params }: PageProps) {
  const { token } = await params;
  return <SharedApplicantsClient token={token} />;
}
