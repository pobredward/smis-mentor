import { Firestore } from 'firebase/firestore';
export declare const createUser: (db: Firestore, userData: Record<string, any>) => Promise<string>;
export declare const getUserById: (db: Firestore, userId: string) => Promise<any | null>;
export declare const getUserByEmail: (db: Firestore, email: string) => Promise<any | null>;
export declare const getUserByPhone: (db: Firestore, phoneNumber: string) => Promise<any | null>;
export declare const updateUser: (db: Firestore, userId: string, updates: Record<string, any>) => Promise<void>;
export declare const deactivateUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const deleteUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const getAllUsers: (db: Firestore) => Promise<any[]>;
export declare const getUsersByJobCode: (db: Firestore, generation: string, code: string) => Promise<any[]>;
//# sourceMappingURL=index.d.ts.map