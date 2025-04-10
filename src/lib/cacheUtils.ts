import { openDB } from 'idb';

// 브라우저 환경인지 확인하는 유틸리티 함수
const isBrowser = () => typeof window !== 'undefined';

// IndexedDB 데이터베이스 이름과 버전
const DB_NAME = 'smis-mentor-cache';
const DB_VERSION = 1;

// 캐시 저장소 이름
const STORES = {
  USERS: 'users',
  JOB_BOARDS: 'jobBoards', 
  JOB_CODES: 'jobCodes',
  APPLICATIONS: 'applications',
  REVIEWS: 'reviews'
};

// 캐시 만료 시간 (밀리초)
const CACHE_EXPIRY = {
  SHORT: 5 * 60 * 1000, // 5분
  MEDIUM: 30 * 60 * 1000, // 30분
  LONG: 24 * 60 * 60 * 1000, // 24시간
}

// IndexedDB 초기화
const initDB = async () => {
  if (!isBrowser()) {
    return null; // 서버 환경에서는 null 반환
  }
  
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 각 저장소 생성
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        db.createObjectStore(STORES.USERS, { keyPath: 'userId' });
      }
      
      if (!db.objectStoreNames.contains(STORES.JOB_BOARDS)) {
        db.createObjectStore(STORES.JOB_BOARDS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.JOB_CODES)) {
        db.createObjectStore(STORES.JOB_CODES, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.APPLICATIONS)) {
        db.createObjectStore(STORES.APPLICATIONS, { keyPath: 'applicationHistoryId' });
      }

      if (!db.objectStoreNames.contains(STORES.REVIEWS)) {
        db.createObjectStore(STORES.REVIEWS, { keyPath: 'id' });
      }
    }
  });
};

// 데이터 저장 함수
export const setCache = async <T>(storeName: string, data: T, expiryTime = CACHE_EXPIRY.MEDIUM) => {
  if (!isBrowser()) {
    return false; // 서버 환경에서는 작업 생략
  }
  
  try {
    const db = await initDB();
    if (!db) return false;
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    // 캐시 만료 시간 추가
    const cacheData = {
      ...data,
      _cacheExpiry: Date.now() + expiryTime
    };
    
    await store.put(cacheData);
    await tx.done;
    return true;
  } catch (error) {
    console.error(`캐시 저장 오류 (${storeName}):`, error);
    return false;
  }
};

// 데이터 가져오기 함수
export const getCache = async <T>(storeName: string, key: string): Promise<T | null> => {
  if (!isBrowser()) {
    return null; // 서버 환경에서는 null 반환
  }
  
  try {
    const db = await initDB();
    if (!db) return null;
    
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    const data = await store.get(key);
    
    // 데이터가 없거나 만료된 경우
    if (!data || (data._cacheExpiry && data._cacheExpiry < Date.now())) {
      return null;
    }
    
    // _cacheExpiry 속성 제거 후 반환
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _cacheExpiry, ...cacheData } = data;
    return cacheData as T;
  } catch (error) {
    console.error(`캐시 조회 오류 (${storeName}):`, error);
    return null;
  }
};

// localStorage에서 항목 가져오기 (안전하게)
const safeGetItem = (key: string): string | null => {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`localStorage 접근 오류 (${key}):`, error);
    return null;
  }
};

// localStorage에 항목 저장 (안전하게)
const safeSetItem = (key: string, value: string): boolean => {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`localStorage 저장 오류 (${key}):`, error);
    return false;
  }
};

// localStorage에서 항목 삭제 (안전하게)
const safeRemoveItem = (key: string): boolean => {
  if (!isBrowser()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`localStorage 삭제 오류 (${key}):`, error);
    return false;
  }
};

// 컬렉션 데이터 저장
export const setCacheCollection = async <T>(storeName: string, data: T[], expiryTime = CACHE_EXPIRY.MEDIUM) => {
  if (!isBrowser()) {
    return false; // 서버 환경에서는 작업 생략
  }
  
  try {
    const db = await initDB();
    if (!db) return false;
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    // 캐시 만료 시간 추가 및 저장
    for (const item of data) {
      const cacheData = {
        ...item,
        _cacheExpiry: Date.now() + expiryTime
      };
      await store.put(cacheData);
    }
    
    await tx.done;
    
    // 컬렉션 메타데이터 저장 (마지막 갱신 시간)
    safeSetItem(`${storeName}_lastUpdated`, Date.now().toString());
    safeSetItem(`${storeName}_expiry`, (Date.now() + expiryTime).toString());
    
    return true;
  } catch (error) {
    console.error(`컬렉션 캐시 저장 오류 (${storeName}):`, error);
    return false;
  }
};

// 컬렉션 데이터 가져오기
export const getCacheCollection = async <T>(storeName: string): Promise<T[] | null> => {
  if (!isBrowser()) {
    return null; // 서버 환경에서는 null 반환
  }
  
  try {
    // 만료 여부 확인
    const expiry = safeGetItem(`${storeName}_expiry`);
    if (!expiry || parseInt(expiry) < Date.now()) {
      return null;
    }
    
    const db = await initDB();
    if (!db) return null;
    
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    const allData = await store.getAll();
    
    // 만료된 항목 필터링 및 _cacheExpiry 속성 제거
    const validData = allData
      .filter(item => !item._cacheExpiry || item._cacheExpiry >= Date.now())
      .map(item => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _cacheExpiry, ...rest } = item;
        return rest;
      });
    
    return validData as T[];
  } catch (error) {
    console.error(`컬렉션 캐시 조회 오류 (${storeName}):`, error);
    return null;
  }
};

// 캐시 항목 삭제
export const removeCache = async (storeName: string, key: string) => {
  if (!isBrowser()) {
    return false; // 서버 환경에서는 작업 생략
  }
  
  try {
    const db = await initDB();
    if (!db) return false;
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    await store.delete(key);
    await tx.done;
    return true;
  } catch (error) {
    console.error(`캐시 삭제 오류 (${storeName}, ${key}):`, error);
    return false;
  }
};

// 캐시 컬렉션 비우기
export const clearCacheCollection = async (storeName: string) => {
  if (!isBrowser()) {
    return false; // 서버 환경에서는 작업 생략
  }
  
  try {
    const db = await initDB();
    if (!db) return false;
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    await store.clear();
    await tx.done;
    
    // 메타데이터 삭제
    safeRemoveItem(`${storeName}_lastUpdated`);
    safeRemoveItem(`${storeName}_expiry`);
    
    return true;
  } catch (error) {
    console.error(`캐시 컬렉션 삭제 오류 (${storeName}):`, error);
    return false;
  }
};

// 캐시 스토어 접근 상수
export const CACHE_STORE = STORES;

// 캐시 만료 시간 접근 상수
export const CACHE_TTL = CACHE_EXPIRY; 