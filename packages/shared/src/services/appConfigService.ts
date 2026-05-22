import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AppConfig, AppConfigUpdateInput, CampHomeMessage, CampHomeMessageUpdateInput, VersionCheckResult } from '../types/appConfig';

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
      mentorHomeMessage: data.mentorHomeMessage || '',
      foreignHomeMessage: data.foreignHomeMessage || '',
      minVersion: data.minVersion || undefined,
      iosStoreUrl: data.iosStoreUrl || undefined,
      androidStoreUrl: data.androidStoreUrl || undefined,
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
    
    const updateData: any = {
      loadingQuotes: input.loadingQuotes,
      updatedAt: serverTimestamp(),
      updatedBy,
    };
    
    if (input.mentorHomeMessage !== undefined) {
      updateData.mentorHomeMessage = input.mentorHomeMessage;
    }
    
    if (input.foreignHomeMessage !== undefined) {
      updateData.foreignHomeMessage = input.foreignHomeMessage;
    }

    if (input.minVersion !== undefined) {
      updateData.minVersion = input.minVersion;
    }

    if (input.iosStoreUrl !== undefined) {
      updateData.iosStoreUrl = input.iosStoreUrl;
    }

    if (input.androidStoreUrl !== undefined) {
      updateData.androidStoreUrl = input.androidStoreUrl;
    }
    
    await setDoc(docRef, updateData, { merge: true });
  } catch (error) {
    console.error('앱 설정 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 캠프별 홈 메시지 조회
 * Firestore 경로: campHomeMessages/{campCode}
 */
export async function getCampHomeMessage(db: any, campCode: string): Promise<CampHomeMessage | null> {
  try {
    const docRef = doc(db, 'campHomeMessages', campCode);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      campCode,
      mentorMessage: data.mentorMessage || '',
      foreignMessage: data.foreignMessage || '',
      updatedAt: data.updatedAt?.toDate() || new Date(),
      updatedBy: data.updatedBy,
    };
  } catch (error) {
    console.error('캠프 홈 메시지 조회 실패:', error);
    throw error;
  }
}

/**
 * 캠프별 홈 메시지 업데이트 (관리자 전용)
 * Firestore 경로: campHomeMessages/{campCode}
 */
export async function updateCampHomeMessage(
  db: any,
  campCode: string,
  input: CampHomeMessageUpdateInput,
  updatedBy: string
): Promise<void> {
  try {
    const docRef = doc(db, 'campHomeMessages', campCode);

    const updateData: any = {
      updatedAt: serverTimestamp(),
      updatedBy,
    };

    if (input.mentorMessage !== undefined) {
      updateData.mentorMessage = input.mentorMessage;
    }

    if (input.foreignMessage !== undefined) {
      updateData.foreignMessage = input.foreignMessage;
    }

    await setDoc(docRef, updateData, { merge: true });
  } catch (error) {
    console.error('캠프 홈 메시지 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 시맨틱 버전 비교 (major.minor.patch)
 * @returns 음수: a < b, 0: a == b, 양수: a > b
 */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

const DEFAULT_IOS_STORE_URL =
  'https://apps.apple.com/kr/app/smis-mentor/id6748606030';
const DEFAULT_ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.smis.smismentor';

/**
 * 현재 앱 버전과 Firestore minVersion을 비교하여 강제 업데이트 여부를 반환
 * @param db Firestore 인스턴스
 * @param currentVersion 현재 앱 버전 (예: "1.0.0")
 */
export async function checkForceUpdate(
  db: any,
  currentVersion: string,
): Promise<VersionCheckResult> {
  try {
    const config = await getAppConfig(db);

    const iosStoreUrl = config?.iosStoreUrl || DEFAULT_IOS_STORE_URL;
    const androidStoreUrl = config?.androidStoreUrl || DEFAULT_ANDROID_STORE_URL;

    if (!config?.minVersion) {
      return { needsUpdate: false, iosStoreUrl, androidStoreUrl };
    }

    const needsUpdate = compareVersions(currentVersion, config.minVersion) < 0;
    return { needsUpdate, iosStoreUrl, androidStoreUrl };
  } catch (error) {
    // 네트워크 오류 등으로 체크 실패 시 업데이트 강제하지 않음
    console.error('버전 체크 실패:', error);
    return {
      needsUpdate: false,
      iosStoreUrl: DEFAULT_IOS_STORE_URL,
      androidStoreUrl: DEFAULT_ANDROID_STORE_URL,
    };
  }
}

/**
 * 기본 로딩 문구 (설정이 없을 때 사용)
 */
export const DEFAULT_LOADING_QUOTES = [
  '오늘도 학생들과 함께 성장하는 하루 되세요 ✨',
  '특별한 순간들이 모여 특별한 방학을 만듭니다 🌟',
  '작은 관심 하나가 학생들에게 큰 힘이 됩니다 💪',
  '함께 배우고 성장하는 SMIS 캠프 🎓',
  '학생들의 꿈을 응원하는 멘토가 되어주세요 🌈',
  '매일매일이 새로운 배움의 기회입니다 📚',
  '긍정적인 에너지로 캠프를 가득 채워주세요 ⚡',
  '학생들과의 소통이 가장 큰 보람입니다 💬',
  '오늘도 최선을 다하는 여러분을 응원합니다 🙌',
  '즐거운 캠프 생활 되세요! 화이팅! 🔥',
];
