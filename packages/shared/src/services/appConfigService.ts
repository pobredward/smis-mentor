import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AppConfig, AppConfigUpdateInput } from '../types/appConfig';

/**
 * 앱 설정 서비스
 * Firestore 경로: appConfig/main
 */

const APP_CONFIG_DOC_ID = 'main';

/**
 * 앱 설정 조회
 */
export async function getAppConfig(db: any): Promise<AppConfig | null> {
  try {
    const docRef = doc(db, 'appConfig', APP_CONFIG_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    return {
      id: docSnap.id,
      loadingQuotes: data.loadingQuotes || [],
      updatedAt: data.updatedAt?.toDate() || new Date(),
      updatedBy: data.updatedBy,
    };
  } catch (error) {
    console.error('앱 설정 조회 실패:', error);
    throw error;
  }
}

/**
 * 앱 설정 업데이트 (관리자 전용)
 */
export async function updateAppConfig(
  db: any,
  input: AppConfigUpdateInput,
  updatedBy: string
): Promise<void> {
  try {
    const docRef = doc(db, 'appConfig', APP_CONFIG_DOC_ID);
    
    await setDoc(docRef, {
      loadingQuotes: input.loadingQuotes,
      updatedAt: serverTimestamp(),
      updatedBy,
    }, { merge: true });
  } catch (error) {
    console.error('앱 설정 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 기본 로딩 문구 (설정이 없을 때 사용)
 */
export const DEFAULT_LOADING_QUOTES = [
  '오늘도 학생들과 함께 성장하는 하루 되세요 ✨',
  '멘토링의 순간들이 모여 특별한 여름을 만듭니다 🌟',
  '작은 관심 하나가 학생들에게 큰 힘이 됩니다 💪',
  '함께 배우고 성장하는 SMIS 캠프 🎓',
  '학생들의 꿈을 응원하는 멘토가 되어주세요 🌈',
  '매일매일이 새로운 배움의 기회입니다 📚',
  '긍정적인 에너지로 캠프를 가득 채워주세요 ⚡',
  '학생들과의 소통이 가장 큰 보람입니다 💬',
  '오늘도 최선을 다하는 여러분을 응원합니다 🙌',
  '즐거운 캠프 생활 되세요! 화이팅! 🔥',
];
