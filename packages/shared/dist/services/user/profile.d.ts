import { FirebaseStorage } from 'firebase/storage';
import { Firestore } from 'firebase/firestore';
import { User } from '../../types';
/**
 * 프로필 이미지를 Firebase Storage에 업로드
 */
export declare function uploadProfileImage(storage: FirebaseStorage, userId: string, file: File | Blob, onProgress?: (progress: number) => void): Promise<string>;
/**
 * 프로필 이미지 삭제
 */
export declare function deleteProfileImage(storage: FirebaseStorage, userId: string): Promise<void>;
/**
 * 사용자 정보 업데이트
 */
export declare function updateUserProfile(db: Firestore, userId: string, data: Partial<User>): Promise<void>;
/**
 * 프로필 이미지 URL 업데이트
 */
export declare function updateProfileImageUrl(db: Firestore, userId: string, imageUrl: string): Promise<void>;
/**
 * 이메일 중복 확인
 */
export declare function checkEmailExists(db: Firestore, email: string, excludeUserId?: string): Promise<boolean>;
/**
 * 전화번호 중복 확인
 */
export declare function checkPhoneExists(db: Firestore, phoneNumber: string, excludeUserId?: string): Promise<boolean>;
/**
 * 사용자 정보 조회
 */
export declare function getUserById(db: Firestore, userId: string): Promise<User | null>;
//# sourceMappingURL=profile.d.ts.map