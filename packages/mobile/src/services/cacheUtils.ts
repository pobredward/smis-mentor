import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@smis-mentor/shared';

/**
 * 캐시 스토어 이름
 */
export const CACHE_STORE = {
  USERS: 'users',
  JOB_CODES: 'job_codes',
  APPLICATIONS: 'applications',
} as const;

/**
 * 캐시 TTL (밀리초)
 */
export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5분
  MEDIUM: 60 * 60 * 1000, // 1시간
  LONG: 24 * 60 * 60 * 1000, // 24시간
} as const;

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 캐시 키 생성
 */
function getCacheKey(storeName: string, key: string): string {
  return `@cache:${storeName}:${key}`;
}

/**
 * 캐시에서 데이터 가져오기
 */
export async function getCache<T>(
  storeName: string,
  key: string
): Promise<T | null> {
  try {
    const cacheKey = getCacheKey(storeName, key);
    const cached = await AsyncStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<T> = JSON.parse(cached);
    const now = Date.now();

    // TTL 체크
    if (now - cacheItem.timestamp > cacheItem.ttl) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return cacheItem.data;
  } catch (error) {
    logger.error('캐시 조회 실패:', error);
    return null;
  }
}

/**
 * 캐시에 데이터 저장
 */
export async function setCache<T extends { userId?: string; id?: string }>(
  storeName: string,
  data: T,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<void> {
  try {
    // userId나 id 필드에서 키 추출
    const key = data.userId || data.id;
    
    if (!key) {
      logger.warn('캐시 키를 찾을 수 없음:', data);
      return;
    }

    const cacheKey = getCacheKey(storeName, key);
    const cacheItem: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
  } catch (error) {
    logger.error('캐시 저장 실패:', error);
  }
}

/**
 * 캐시에서 특정 항목 제거
 */
export async function removeCache(
  storeName: string,
  key: string
): Promise<void> {
  try {
    const cacheKey = getCacheKey(storeName, key);
    await AsyncStorage.removeItem(cacheKey);
    logger.info('🗑️ 캐시 삭제:', cacheKey);
  } catch (error) {
    logger.error('캐시 삭제 실패:', error);
  }
}

/**
 * 특정 스토어의 모든 캐시 제거
 */
export async function clearCacheCollection(storeName: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefix = `@cache:${storeName}:`;
    const keysToRemove = allKeys.filter(key => key.startsWith(prefix));
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      logger.info(`🗑️ ${storeName} 캐시 전체 삭제:`, keysToRemove.length);
    }
  } catch (error) {
    logger.error('캐시 컬렉션 삭제 실패:', error);
  }
}

/**
 * 모든 캐시 제거
 */
export async function clearAllCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => key.startsWith('@cache:'));
    
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      logger.info('🗑️ 전체 캐시 삭제:', cacheKeys.length);
    }
  } catch (error) {
    logger.error('전체 캐시 삭제 실패:', error);
  }
}
