import {
  collection,
  doc,
  query,
  orderBy,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  limit as firestoreLimit,
  Firestore,
} from 'firebase/firestore';

// ==================== Review 관련 서비스 ====================

export const getReviews = async (db: Firestore): Promise<any[]> => {
  try {
    const reviewsQuery = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(reviewsQuery);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const getReviewById = async (db: Firestore, reviewId: string): Promise<any | null> => {
  try {
    const reviewDoc = await getDoc(doc(db, 'reviews', reviewId));
    if (reviewDoc.exists()) {
      return {
        id: reviewDoc.id,
        ...reviewDoc.data(),
      };
    } else {
      throw new Error('해당 리뷰를 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const addReview = async (db: Firestore, reviewData: Record<string, any>) => {
  try {
    const timestamp = serverTimestamp();

    const reviewRef = await addDoc(collection(db, 'reviews'), {
      ...reviewData,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return reviewRef.id;
  } catch (error) {
    console.error('리뷰를 추가하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const updateReview = async (
  db: Firestore,
  reviewId: string,
  reviewData: Record<string, any>
) => {
  try {
    const reviewRef = doc(db, 'reviews', reviewId);

    await updateDoc(reviewRef, {
      ...reviewData,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('리뷰를 업데이트하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const deleteReview = async (db: Firestore, reviewId: string) => {
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
    return true;
  } catch (error) {
    console.error('리뷰를 삭제하는 중 오류가 발생했습니다:', error);
    throw error;
  }
};

export const getRecentReviews = async (db: Firestore, limit: number = 3): Promise<any[]> => {
  try {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limit)
    );

    const querySnapshot = await getDocs(reviewsQuery);
    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
      };
    });
  } catch (error) {
    console.error('최신 리뷰를 가져오는 중 오류가 발생했습니다:', error);
    return [];
  }
};

export const getBestReviews = async (db: Firestore, limit: number = 3): Promise<any[]> => {
  try {
    const reviewsQuery = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(reviewsQuery);
    const allReviews = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        rating: data.rating || 5,
        reviewId: doc.id,
        writer: data.author?.name || '익명',
        generation: data.generation || '',
      };
    });

    const bestReviews = allReviews.filter((review: any) => review.generation === 'Best 후기');

    return bestReviews.slice(0, limit);
  } catch (error) {
    console.error('Best 후기를 가져오는 중 오류가 발생했습니다:', error);
    return [];
  }
};
