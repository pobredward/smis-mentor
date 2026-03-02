import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// React Native용 간단한 ID 생성 함수
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface STSheetConfig {
  spreadsheetId: string;
  sheetName: string;
  lastSyncedAt?: Timestamp;
}

export interface GenerationResources {
  jobCodeId: string;
  generation: string;
  code: string;
  educationLinks: ResourceLink[];
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
  stSheetConfig?: STSheetConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LinkType = 'educationLinks' | 'scheduleLinks' | 'guideLinks';

const generationResourcesService = {
  getResourcesByJobCodeId: async (
    jobCodeId: string
  ): Promise<GenerationResources | null> => {
    try {
      console.log('📥 generationResourcesService: 리소스 요청 -', jobCodeId);
      const docRef = doc(db, 'generationResources', jobCodeId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        console.log('✅ generationResourcesService: 리소스 찾음 -', jobCodeId);
        const data = docSnap.data();
        console.log('  - generation:', data.generation);
        console.log('  - code:', data.code);
        console.log('  - educationLinks:', data.educationLinks?.length || 0);
        console.log('  - scheduleLinks:', data.scheduleLinks?.length || 0);
        console.log('  - guideLinks:', data.guideLinks?.length || 0);
        return { ...data, jobCodeId } as GenerationResources;
      }
      console.log('⚠️ generationResourcesService: 리소스 없음 -', jobCodeId);
      return null;
    } catch (error) {
      console.error('❌ generationResourcesService: 리소스 가져오기 실패:', error);
      throw error;
    }
  },

  addLink: async (
    jobCodeId: string,
    linkType: LinkType,
    title: string,
    url: string,
    userId: string
  ): Promise<void> => {
    try {
      const docRef = doc(db, 'generationResources', jobCodeId);
      const docSnap = await getDoc(docRef);

      const newLink: ResourceLink = {
        id: generateId(),
        title,
        url,
        createdAt: Timestamp.now(),
        createdBy: userId,
      };

      // 문서가 없으면 생성
      if (!docSnap.exists()) {
        // jobCodes에서 기수 정보 가져오기
        const jobCodeRef = doc(db, 'jobCodes', jobCodeId);
        const jobCodeSnap = await getDoc(jobCodeRef);
        
        if (!jobCodeSnap.exists()) {
          throw new Error('기수 정보를 찾을 수 없습니다.');
        }

        const jobCodeData = jobCodeSnap.data();
        const now = Timestamp.now();

        await setDoc(docRef, {
          jobCodeId,
          generation: jobCodeData.generation || '',
          code: jobCodeData.code || '',
          educationLinks: linkType === 'educationLinks' ? [newLink] : [],
          scheduleLinks: linkType === 'scheduleLinks' ? [newLink] : [],
          guideLinks: linkType === 'guideLinks' ? [newLink] : [],
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // 문서가 있으면 업데이트
        await updateDoc(docRef, {
          [linkType]: arrayUnion(newLink),
          updatedAt: Timestamp.now(),
        });
      }
    } catch (error) {
      console.error('링크 추가 실패:', error);
      throw error;
    }
  },

  reorderLinks: async (
    jobCodeId: string,
    linkType: LinkType,
    newOrderedLinks: ResourceLink[]
  ): Promise<void> => {
    try {
      const docRef = doc(db, 'generationResources', jobCodeId);

      await updateDoc(docRef, {
        [linkType]: newOrderedLinks,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('링크 순서 변경 실패:', error);
      throw error;
    }
  },

  deleteLink: async (
    jobCodeId: string,
    linkType: LinkType,
    linkId: string
  ): Promise<void> => {
    try {
      const docRef = doc(db, 'generationResources', jobCodeId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('문서를 찾을 수 없습니다.');
      }

      const data = docSnap.data() as GenerationResources;
      const links = data[linkType] || [];
      const filteredLinks = links.filter((link) => link.id !== linkId);

      await updateDoc(docRef, {
        [linkType]: filteredLinks,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('링크 삭제 실패:', error);
      throw error;
    }
  },
};

export default generationResourcesService;
