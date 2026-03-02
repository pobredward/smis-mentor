import { Firestore } from 'firebase/firestore';
export declare const getReviews: (db: Firestore) => Promise<any[]>;
export declare const getReviewById: (db: Firestore, reviewId: string) => Promise<any | null>;
export declare const addReview: (db: Firestore, reviewData: Record<string, any>) => Promise<string>;
export declare const updateReview: (db: Firestore, reviewId: string, reviewData: Record<string, any>) => Promise<boolean>;
export declare const deleteReview: (db: Firestore, reviewId: string) => Promise<boolean>;
export declare const getRecentReviews: (db: Firestore, limit?: number) => Promise<any[]>;
export declare const getBestReviews: (db: Firestore, limit?: number) => Promise<any[]>;
//# sourceMappingURL=index.d.ts.map