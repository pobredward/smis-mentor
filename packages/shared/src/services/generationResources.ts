/**
 * 기수별 자료 링크 (교육 · 일정 · 안내) — web·mobile 공용.
 */
import { type Firestore, doc, getDoc, updateDoc, setDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import type { GenerationResources, ResourceLink, ResourceLinkRole } from '../types/camp';
import { logger } from '../utils/logger';
import { newId } from '../utils/id';

export type LinkType = 'educationLinks' | 'scheduleLinks' | 'guideLinks';

/** 링크 id — uuid 패키지 없이 (React Native 호환) */
const newLinkId = (): string => newId();

export function createGenerationResourcesService(db: Firestore) {
  return {
    getResourcesByJobCodeId: async (jobCodeId: string): Promise<GenerationResources | null> => {
      try {
        const snap = await getDoc(doc(db, 'generationResources', jobCodeId));
        return snap.exists() ? ({ ...snap.data(), jobCodeId } as GenerationResources) : null;
      } catch (error) {
        logger.error('generationResourcesService: 리소스 가져오기 실패:', error);
        throw error;
      }
    },

    addLink: async (
      jobCodeId: string,
      linkType: LinkType,
      title: string,
      url: string,
      userId: string,
      targetRole: ResourceLinkRole = 'common',
    ): Promise<void> => {
      try {
        const docRef = doc(db, 'generationResources', jobCodeId);
        const snap = await getDoc(docRef);
        const newLink: ResourceLink = { id: newLinkId(), title, url, targetRole, createdAt: Timestamp.now(), createdBy: userId };

        if (!snap.exists()) {
          // 문서가 없으면 jobCodes 의 기수 정보로 새로 만든다
          const jobCodeSnap = await getDoc(doc(db, 'jobCodes', jobCodeId));
          if (!jobCodeSnap.exists()) throw new Error('기수 정보를 찾을 수 없습니다.');
          const jobCode = jobCodeSnap.data();
          const now = Timestamp.now();
          await setDoc(docRef, {
            jobCodeId,
            generation: jobCode.generation || '',
            code: jobCode.code || '',
            educationLinks: linkType === 'educationLinks' ? [newLink] : [],
            scheduleLinks: linkType === 'scheduleLinks' ? [newLink] : [],
            guideLinks: linkType === 'guideLinks' ? [newLink] : [],
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await updateDoc(docRef, { [linkType]: arrayUnion(newLink), updatedAt: Timestamp.now() });
        }
      } catch (error) {
        logger.error('링크 추가 실패:', error);
        throw error;
      }
    },

    reorderLinks: async (jobCodeId: string, linkType: LinkType, newOrderedLinks: ResourceLink[]): Promise<void> => {
      try {
        await updateDoc(doc(db, 'generationResources', jobCodeId), { [linkType]: newOrderedLinks, updatedAt: Timestamp.now() });
      } catch (error) {
        logger.error('링크 순서 변경 실패:', error);
        throw error;
      }
    },

    deleteLink: async (jobCodeId: string, linkType: LinkType, linkId: string): Promise<void> => {
      try {
        const docRef = doc(db, 'generationResources', jobCodeId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) throw new Error('문서를 찾을 수 없습니다.');
        const links = (snap.data() as GenerationResources)[linkType] || [];
        await updateDoc(docRef, { [linkType]: links.filter((l) => l.id !== linkId), updatedAt: Timestamp.now() });
      } catch (error) {
        logger.error('링크 삭제 실패:', error);
        throw error;
      }
    },
  };
}
