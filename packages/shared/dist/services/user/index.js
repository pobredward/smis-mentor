"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsersByJobCode = exports.getAllUsers = exports.deleteUser = exports.deactivateUser = exports.updateUser = exports.getUserByPhone = exports.getUserByEmail = exports.getUserById = exports.createUser = void 0;
const firestore_1 = require("firebase/firestore");
// ==================== User 관련 서비스 ====================
const createUser = async (db, userData) => {
    const now = firestore_1.Timestamp.now();
    const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'users'), {
        ...userData,
        createdAt: now,
        updatedAt: now,
    });
    await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'users', docRef.id), { userId: docRef.id, id: docRef.id });
    return docRef.id;
};
exports.createUser = createUser;
const getUserById = async (db, userId) => {
    try {
        const userDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'users', userId));
        if (!userDoc.exists())
            return null;
        return userDoc.data();
    }
    catch (error) {
        console.error('사용자 정보 가져오기 실패:', error);
        throw error;
    }
};
exports.getUserById = getUserById;
const getUserByEmail = async (db, email) => {
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(db, 'users'), (0, firestore_1.where)('email', '==', email));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        if (querySnapshot.empty)
            return null;
        return querySnapshot.docs[0].data();
    }
    catch (error) {
        console.error('이메일로 사용자 조회 실패:', error);
        throw error;
    }
};
exports.getUserByEmail = getUserByEmail;
const getUserByPhone = async (db, phoneNumber) => {
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(db, 'users'), (0, firestore_1.where)('phoneNumber', '==', phoneNumber));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        if (querySnapshot.empty)
            return null;
        return querySnapshot.docs[0].data();
    }
    catch (error) {
        console.error('전화번호로 사용자 조회 실패:', error);
        throw error;
    }
};
exports.getUserByPhone = getUserByPhone;
const updateUser = async (db, userId, updates) => {
    const now = firestore_1.Timestamp.now();
    const userRef = (0, firestore_1.doc)(db, 'users', userId);
    await (0, firestore_1.updateDoc)(userRef, {
        ...updates,
        updatedAt: now,
    });
};
exports.updateUser = updateUser;
const deactivateUser = async (db, userId) => {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        const userDoc = await (0, firestore_1.getDoc)(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        const now = firestore_1.Timestamp.now();
        await (0, firestore_1.updateDoc)(userRef, {
            status: 'inactive',
            name: `(탈퇴)${userData.name}`,
            originalEmail: userData.email,
            updatedAt: now,
        });
        return true;
    }
    catch (error) {
        console.error('사용자 비활성화 실패:', error);
        throw error;
    }
};
exports.deactivateUser = deactivateUser;
const deleteUser = async (db, userId) => {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        const userDoc = await (0, firestore_1.getDoc)(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        await (0, firestore_1.deleteDoc)(userRef);
        return true;
    }
    catch (error) {
        console.error('사용자 삭제 실패:', error);
        throw error;
    }
};
exports.deleteUser = deleteUser;
const getAllUsers = async (db) => {
    try {
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const querySnapshot = await (0, firestore_1.getDocs)(usersRef);
        const users = [];
        querySnapshot.forEach((docSnapshot) => {
            users.push(docSnapshot.data());
        });
        return users;
    }
    catch (error) {
        console.error('모든 사용자 조회 실패:', error);
        throw error;
    }
};
exports.getAllUsers = getAllUsers;
const getUsersByJobCode = async (db, generation, code) => {
    try {
        const users = [];
        // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
        const jobCodesRef = (0, firestore_1.collection)(db, 'jobCodes');
        const codeQuery = (0, firestore_1.query)(jobCodesRef, (0, firestore_1.where)('generation', '==', generation), (0, firestore_1.where)('code', '==', code));
        const jobCodeSnapshot = await (0, firestore_1.getDocs)(codeQuery);
        if (jobCodeSnapshot.empty) {
            return users;
        }
        const jobCodeId = jobCodeSnapshot.docs[0].id;
        // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const userSnapshot = await (0, firestore_1.getDocs)(usersRef);
        userSnapshot.forEach((docSnapshot) => {
            const userData = docSnapshot.data();
            if (userData.jobExperiences &&
                userData.jobExperiences.some((exp) => exp.id === jobCodeId)) {
                users.push(userData);
            }
        });
        return users;
    }
    catch (error) {
        console.error('직무 코드별 사용자 조회 실패:', error);
        throw error;
    }
};
exports.getUsersByJobCode = getUsersByJobCode;
