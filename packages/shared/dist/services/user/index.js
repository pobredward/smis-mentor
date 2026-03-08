import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, Timestamp, } from 'firebase/firestore';
// ==================== User 관련 서비스 ====================
export const createUser = async (db, userData) => {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, 'users'), Object.assign(Object.assign({}, userData), { createdAt: now, updatedAt: now }));
    await updateDoc(doc(db, 'users', docRef.id), { userId: docRef.id, id: docRef.id });
    return docRef.id;
};
export const getUserById = async (db, userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists())
            return null;
        const userData = userDoc.data();
        // id 필드가 없는 경우 자동으로 추가 (오래된 데이터 마이그레이션)
        if (!userData.id) {
            console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
            await updateDoc(doc(db, 'users', userId), { id: userId });
            return Object.assign(Object.assign({}, userData), { id: userId });
        }
        return userData;
    }
    catch (error) {
        console.error('사용자 정보 가져오기 실패:', error);
        throw error;
    }
};
export const getUserByEmail = async (db, email) => {
    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty)
            return null;
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;
        // id 필드가 없는 경우 자동으로 추가
        if (!userData.id) {
            console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
            await updateDoc(doc(db, 'users', userId), { id: userId });
            return Object.assign(Object.assign({}, userData), { id: userId });
        }
        return userData;
    }
    catch (error) {
        console.error('이메일로 사용자 조회 실패:', error);
        throw error;
    }
};
export const getUserByPhone = async (db, phoneNumber) => {
    try {
        const q = query(collection(db, 'users'), where('phoneNumber', '==', phoneNumber));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty)
            return null;
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;
        // id 필드가 없는 경우 자동으로 추가
        if (!userData.id) {
            console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
            await updateDoc(doc(db, 'users', userId), { id: userId });
            return Object.assign(Object.assign({}, userData), { id: userId });
        }
        return userData;
    }
    catch (error) {
        console.error('전화번호로 사용자 조회 실패:', error);
        throw error;
    }
};
export const updateUser = async (db, userId, updates) => {
    const now = Timestamp.now();
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, Object.assign(Object.assign({}, updates), { updatedAt: now }));
};
export const deactivateUser = async (db, userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        const now = Timestamp.now();
        await updateDoc(userRef, {
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
export const deleteUser = async (db, userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        await deleteDoc(userRef);
        return true;
    }
    catch (error) {
        console.error('사용자 삭제 실패:', error);
        throw error;
    }
};
export const getAllUsers = async (db) => {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        const users = [];
        const updatePromises = [];
        querySnapshot.forEach((docSnapshot) => {
            const userData = docSnapshot.data();
            const userId = docSnapshot.id;
            // id 필드가 없는 경우 자동으로 추가
            if (!userData.id) {
                console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
                updatePromises.push(updateDoc(doc(db, 'users', userId), { id: userId }));
                users.push(Object.assign(Object.assign({}, userData), { id: userId }));
            }
            else {
                users.push(userData);
            }
        });
        // 모든 업데이트를 병렬로 실행
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        return users;
    }
    catch (error) {
        console.error('모든 사용자 조회 실패:', error);
        throw error;
    }
};
export const getUsersByJobCode = async (db, generation, code) => {
    try {
        const users = [];
        // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
        const jobCodesRef = collection(db, 'jobCodes');
        const codeQuery = query(jobCodesRef, where('generation', '==', generation), where('code', '==', code));
        const jobCodeSnapshot = await getDocs(codeQuery);
        if (jobCodeSnapshot.empty) {
            return users;
        }
        const jobCodeId = jobCodeSnapshot.docs[0].id;
        // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
        const usersRef = collection(db, 'users');
        const userSnapshot = await getDocs(usersRef);
        const updatePromises = [];
        userSnapshot.forEach((docSnapshot) => {
            const userData = docSnapshot.data();
            const userId = docSnapshot.id;
            if (userData.jobExperiences &&
                userData.jobExperiences.some((exp) => exp.id === jobCodeId)) {
                // id 필드가 없는 경우 자동으로 추가
                if (!userData.id) {
                    console.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
                    updatePromises.push(updateDoc(doc(db, 'users', userId), { id: userId }));
                    users.push(Object.assign(Object.assign({}, userData), { id: userId }));
                }
                else {
                    users.push(userData);
                }
            }
        });
        // 모든 업데이트를 병렬로 실행
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        return users;
    }
    catch (error) {
        console.error('직무 코드별 사용자 조회 실패:', error);
        throw error;
    }
};
