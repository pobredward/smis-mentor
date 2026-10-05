/**
 * 기수별 자료 링크 (교육 · 일정 · 안내) — web·mobile 공용.
 */
import { type Firestore, doc, getDoc, updateDoc, setDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import type { GenerationResources, ResourceLink, ResourceLinkRole } from '../types/camp';
import { logger } from '../utils/logger';
import { newId } from '../utils/id';
import { campCodeOf } from './campKey';

export type LinkType = 'educationLinks' | 'scheduleLinks' | 'guideLinks';

/** 링크 id — uuid 패키지 없이 (React Native 호환) */
const newLinkId = (): string => newId();

/** 기수별 자료 링크 문서 — 캠프 열쇠(campCode)가 문서 id */
async function resourcesDocOf(db: Firestore, jobCodeId: string) {
  const code = (await campCodeOf(db, jobCodeId)) || jobCodeId;
  const ref = doc(db, 'generationResources', code);
  const snap = await getDoc(ref);
  return { ref, snap: snap.exists() ? snap : null, code };
}

export function createGenerationResourcesService(db: Firestore) {
  return {
    getResourcesByJobCodeId: async (jobCodeId: string): Promise<GenerationResources | null> => {
      try {
        const { snap } = await resourcesDocOf(db, jobCodeId);
        return snap ? ({ ...snap.data(), jobCodeId } as GenerationResources) : null;
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
        const { ref: docRef, snap, code } = await resourcesDocOf(db, jobCodeId);
        const newLink: ResourceLink = { id: newLinkId(), title, url, targetRole, createdAt: Timestamp.now(), createdBy: userId };

        if (!snap) {
          // 문서가 없으면 jobCodes 의 기수 정보로 새로 만든다 (문서 id = campCode)
          const jobCodeSnap = await getDoc(doc(db, 'jobCodes', jobCodeId));
          if (!jobCodeSnap.exists()) throw new Error('기수 정보를 찾을 수 없습니다.');
          const jobCode = jobCodeSnap.data();
          const now = Timestamp.now();
          await setDoc(docRef, {
            jobCodeId,
            campCode: code || jobCode.code || '',
            generation: jobCode.generation || '',
            code: jobCode.code || '',
            educationLinks: linkType === 'educationLinks' ? [newLink] : [],
            scheduleLinks: linkType === 'scheduleLinks' ? [newLink] : [],
            guideLinks: linkType === 'guideLinks' ? [newLink] : [],
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const change = { [linkType]: arrayUnion(newLink), updatedAt: Timestamp.now() };
          await updateDoc(docRef, change);
        }
      } catch (error) {
        logger.error('링크 추가 실패:', error);
        throw error;
      }
    },

    reorderLinks: async (jobCodeId: string, linkType: LinkType, newOrderedLinks: ResourceLink[]): Promise<void> => {
      try {
        const { ref, snap } = await resourcesDocOf(db, jobCodeId);
        if (!snap) throw new Error('문서를 찾을 수 없습니다.');
        const change = { [linkType]: newOrderedLinks, updatedAt: Timestamp.now() };
        await updateDoc(ref, change);
      } catch (error) {
        logger.error('링크 순서 변경 실패:', error);
        throw error;
      }
    },

    deleteLink: async (jobCodeId: string, linkType: LinkType, linkId: string): Promise<void> => {
      try {
        const { ref: docRef, snap } = await resourcesDocOf(db, jobCodeId);
        if (!snap) throw new Error('문서를 찾을 수 없습니다.');
        const links = (snap.data() as GenerationResources)[linkType] || [];
        const change = { [linkType]: links.filter((l) => l.id !== linkId), updatedAt: Timestamp.now() };
        await updateDoc(docRef, change);
      } catch (error) {
        logger.error('링크 삭제 실패:', error);
        throw error;
      }
    },
  };
}
