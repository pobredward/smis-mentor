import { Firestore } from 'firebase/firestore';
import { User } from '../../types/legacy';
export declare const createUser: (db: Firestore, userData: Omit<User, "userId" | "id" | "createdAt" | "updatedAt">) => Promise<string>;
export declare const getUserById: (db: Firestore, userId: string) => Promise<User | null>;
export declare const getUserByEmail: (db: Firestore, email: string) => Promise<User | null>;
export declare const getUserByPhone: (db: Firestore, phoneNumber: string) => Promise<User | null>;
export declare const updateUser: (db: Firestore, userId: string, updates: Partial<User>) => Promise<void>;
export declare const deactivateUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const deleteUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const getAllUsers: (db: Firestore) => Promise<User[]>;
export declare const getUsersByJobCode: (db: Firestore, generation: string, code: string) => Promise<User[]>;
//# sourceMappingURL=index.d.ts.map