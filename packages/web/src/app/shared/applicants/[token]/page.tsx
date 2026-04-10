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
          const university = userData?.university || '';
          const grade = userData?.grade;
          const isOnLeave = userData?.isOnLeave;
          const major1 = userData?.major1 || '';
          const major2 = userData?.major2 || '';
          const profileImage = userData?.profileImage || userData?.photoURL;
          
          // 지원 경로 (applicationPath)
          const applicationPath = appData?.applicationPath || '';
          
          // 제목: SMIS 멘토 프로필 - 이름(24세)
          const title = `SMIS 멘토 프로필 - ${name}(${age}세)`;
          
          // 설명 구성
          const descriptionParts = [];
          
          // 1. 학교 + 학년 + 재학/휴학
          if (university) {
            let schoolInfo = university;
            if (grade) {
              if (grade === 6) {
                schoolInfo += ' 졸업생';
              } else {
                schoolInfo += ` ${grade}학년`;
                if (isOnLeave === true) {
                  schoolInfo += ' 휴학생';
                } else if (isOnLeave === false) {
                  schoolInfo += ' 재학생';
                }
              }
            }
            descriptionParts.push(schoolInfo);
          }
          
          // 2. 제1전공
          if (major1) {
            descriptionParts.push(major1);
          }
          
          // 3. 제2전공
          if (major2) {
            descriptionParts.push(major2);
          }
          
          // 4. 지원경로
          if (applicationPath) {
            descriptionParts.push(applicationPath);
          }
          
          const description = descriptionParts.join(' | ');
          
          return {
            title,
            description,
            openGraph: {
              title,
              description,
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
              title,
              description,
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
