"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBestReviews = exports.getRecentReviews = exports.deleteReview = exports.updateReview = exports.addReview = exports.getReviewById = exports.getReviews = void 0;
const firestore_1 = require("firebase/firestore");
// ==================== Review 관련 서비스 ====================
const getReviews = async (db) => {
    try {
        const reviewsQuery = (0, firestore_1.query)((0, firestore_1.collection)(db, 'reviews'), (0, firestore_1.orderBy)('createdAt', 'desc'));
        const querySnapshot = await (0, firestore_1.getDocs)(reviewsQuery);
        return querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    catch (error) {
        console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
        throw error;
    }
};
exports.getReviews = getReviews;
const getReviewById = async (db, reviewId) => {
    try {
        const reviewDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'reviews', reviewId));
        if (reviewDoc.exists()) {
            return {
                id: reviewDoc.id,
                ...reviewDoc.data(),
            };
        }
        else {
            throw new Error('해당 리뷰를 찾을 수 없습니다.');
        }
    }
    catch (error) {
        console.error('리뷰를 가져오는 중 오류가 발생했습니다:', error);
        throw error;
    }
};
exports.getReviewById = getReviewById;
const addReview = async (db, reviewData) => {
    try {
        const timestamp = (0, firestore_1.serverTimestamp)();
        const reviewRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'reviews'), {
            ...reviewData,
            createdAt: timestamp,
            updatedAt: timestamp,
        });
        return reviewRef.id;
    }
    catch (error) {
        console.error('리뷰를 추가하는 중 오류가 발생했습니다:', error);
        throw error;
    }
};
exports.addReview = addReview;
const updateReview = async (db, reviewId, reviewData) => {
    try {
        const reviewRef = (0, firestore_1.doc)(db, 'reviews', reviewId);
        await (0, firestore_1.updateDoc)(reviewRef, {
            ...reviewData,
            updatedAt: (0, firestore_1.serverTimestamp)(),
        });
        return true;
    }
    catch (error) {
        console.error('리뷰를 업데이트하는 중 오류가 발생했습니다:', error);
        throw error;
    }
};
exports.updateReview = updateReview;
const deleteReview = async (db, reviewId) => {
    try {
        await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(db, 'reviews', reviewId));
        return true;
    }
    catch (error) {
        console.error('리뷰를 삭제하는 중 오류가 발생했습니다:', error);
        throw error;
    }
};
exports.deleteReview = deleteReview;
const getRecentReviews = async (db, limit = 3) => {
    try {
        const reviewsQuery = (0, firestore_1.query)((0, firestore_1.collection)(db, 'reviews'), (0, firestore_1.orderBy)('createdAt', 'desc'), (0, firestore_1.limit)(limit));
        const querySnapshot = await (0, firestore_1.getDocs)(reviewsQuery);
        return querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
            };
        });
    }
    catch (error) {
        console.error('최신 리뷰를 가져오는 중 오류가 발생했습니다:', error);
        return [];
    }
};
exports.getRecentReviews = getRecentReviews;
const getBestReviews = async (db, limit = 3) => {
    try {
        const reviewsQuery = (0, firestore_1.query)((0, firestore_1.collection)(db, 'reviews'), (0, firestore_1.orderBy)('createdAt', 'desc'));
        const querySnapshot = await (0, firestore_1.getDocs)(reviewsQuery);
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
        const bestReviews = allReviews.filter((review) => review.generation === 'Best 후기');
        return bestReviews.slice(0, limit);
    }
    catch (error) {
        console.error('Best 후기를 가져오는 중 오류가 발생했습니다:', error);
        return [];
    }
};
exports.getBestReviews = getBestReviews;
