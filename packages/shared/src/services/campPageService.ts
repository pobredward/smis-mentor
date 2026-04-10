import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import type { CampPage, CampPageCategory, CampPageRole } from '../types/campPage';

export class CampPageService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  // 캠프 페이지 생성
  async createPage(data: {
    jobCodeId: string;
    category: CampPageCategory;
    title: string;
    targetRole: CampPageRole;
    content: string;
    userId: string;
  }): Promise<CampPage> {
    const pageId = uuidv4();
    const now = Timestamp.now();

    // 해당 카테고리의 마지막 order 찾기
    const existingPages = await this.getPagesByCategory(data.jobCodeId, data.category);
    const maxOrder = existingPages.length > 0 
      ? Math.max(...existingPages.map(p => p.order))
      : -1;

    const newPage: CampPage = {
      id: pageId,
      jobCodeId: data.jobCodeId,
      category: data.category,
      title: data.title,
      targetRole: data.targetRole,
      content: data.content,
      order: maxOrder + 1,
      createdAt: now,
      createdBy: data.userId,
      updatedAt: now,
      updatedBy: data.userId,
    };

    const docRef = doc(this.db, 'campPages', pageId);
    await setDoc(docRef, {
      jobCodeId: newPage.jobCodeId,
      category: newPage.category,
      title: newPage.title,
      targetRole: newPage.targetRole,
      content: newPage.content,
      order: newPage.order,
      createdAt: newPage.createdAt,
      createdBy: newPage.createdBy,
      updatedAt: newPage.updatedAt,
      updatedBy: newPage.updatedBy,
    });

    return newPage;
  }

  // 캠프 페이지 수정
  async updatePage(
    pageId: string,
    data: {
      title?: string;
      content?: string;
      targetRole?: CampPageRole;
      userId: string;
    }
  ): Promise<void> {
    const docRef = doc(this.db, 'campPages', pageId);
    const updateData: Record<string, any> = {
      updatedAt: Timestamp.now(),
      updatedBy: data.userId,
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.targetRole !== undefined) updateData.targetRole = data.targetRole;

    await updateDoc(docRef, updateData);
  }

  // 캠프 페이지 삭제
  async deletePage(pageId: string): Promise<void> {
    const docRef = doc(this.db, 'campPages', pageId);
    await deleteDoc(docRef);
  }

  // 특정 페이지 조회
  async getPage(pageId: string): Promise<CampPage | null> {
    const docRef = doc(this.db, 'campPages', pageId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as CampPage;
  }

  // 카테고리별 페이지 목록 조회 (클라이언트 정렬)
  async getPagesByCategory(
    jobCodeId: string,
    category: CampPageCategory
  ): Promise<CampPage[]> {
    const q = query(
      collection(this.db, 'campPages'),
      where('jobCodeId', '==', jobCodeId),
      where('category', '==', category)
    );

    const querySnapshot = await getDocs(q);
    const pages: CampPage[] = [];

    querySnapshot.forEach((doc) => {
      pages.push({
        id: doc.id,
        ...doc.data(),
      } as CampPage);
    });

    // 클라이언트에서 order 기준 정렬
    return pages.sort((a, b) => a.order - b.order);
  }

  // 페이지 순서 변경
  async reorderPages(
    jobCodeId: string,
    category: CampPageCategory,
    pageIds: string[]
  ): Promise<void> {
    const batch = writeBatch(this.db);

    pageIds.forEach((pageId, index) => {
      const docRef = doc(this.db, 'campPages', pageId);
      batch.update(docRef, {
        order: index,
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();
  }

  // 이미지 업로드 URL 생성 헬퍼 (Firebase Storage 경로)
  getImageStoragePath(jobCodeId: string, filename: string): string {
    return `campPages/${jobCodeId}/${uuidv4()}_${filename}`;
  }
}
