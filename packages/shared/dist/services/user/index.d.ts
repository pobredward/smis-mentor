import { Firestore } from 'firebase/firestore';
import { User } from '../../types/legacy';
export declare const createUser: (db: Firestore, userData: Omit<User, "userId" | "id" | "createdAt" | "updatedAt">) => Promise<string>;
export declare const getUserById: (db: Firestore, userId: string) => Promise<User | null>;
export declare const getUserByEmail: (db: Firestore, email: string) => Promise<User | null>;
export declare const getUserByPhone: (db: Firestore, phoneNumber: string) => Promise<User | null>;
export declare const updateUser: (db: Firestore, userId: string, updates: Partial<User>) => Promise<void>;
/**
 * 활성 캠프를 자동으로 설정하는 헬퍼 함수
 * jobExperiences가 있지만 activeJobExperienceId가 없는 경우 첫 번째 캠프를 활성화
 */
export declare const ensureActiveJobExperience: (db: Firestore, user: User) => Promise<string | null>;
/**
 * 캠프 삭제 시 활성 캠프를 다음 캠프로 자동 전환하는 헬퍼 함수
 */
export declare const updateActiveJobExperienceOnDelete: (db: Firestore, userId: string, deletedJobCodeId: string, remainingJobExperiences: Array<{
    id: string;
}>) => Promise<string | null>;
export declare const deactivateUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const deleteUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const getAllUsers: (db: Firestore) => Promise<User[]>;
export declare const getUsersByJobCode: (db: Firestore, generation: string, code: string) => Promise<User[]>;
//# sourceMappingURL=index.d.ts.map