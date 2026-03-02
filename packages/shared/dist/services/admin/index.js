"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminGetUserById = exports.adminGetUsersByJobCode = exports.adminGetUserJobCodesInfo = exports.adminAddUserJobCode = exports.adminGetJobCodeById = exports.adminUpdateJobCode = exports.adminDeleteJobCode = exports.adminCreateJobCode = exports.adminGetAllJobCodes = exports.adminReactivateUser = exports.adminDeleteUser = exports.adminUpdateUser = exports.adminGetAllUsers = exports.createTempUser = void 0;
const firestore_1 = require("firebase/firestore");
// ==================== 임시 사용자 생성 ====================
const createTempUser = async (db, name, phoneNumber, jobExperienceIds, jobExperienceGroups = [], jobExperienceGroupRoles = [], jobExperienceClassCodes = []) => {
    try {
        // 동일한 이름과 전화번호를 가진 사용자가 있는지 확인
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('name', '==', name), (0, firestore_1.where)('phoneNumber', '==', phoneNumber));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        if (!querySnapshot.empty) {
            throw new Error('이미 등록된 유저입니다');
        }
        // JobExperiences 객체 배열 생성
        const jobExperiences = jobExperienceIds.map((id, index) => ({
            id,
            group: index < jobExperienceGroups.length ? jobExperienceGroups[index] : 'junior',
            groupRole: index < jobExperienceGroupRoles.length
                ? jobExperienceGroupRoles[index]
                : '담임',
            classCode: index < jobExperienceClassCodes.length
                ? jobExperienceClassCodes[index]
                : undefined,
        }));
        const now = firestore_1.Timestamp.now();
        // Firestore에 임시 사용자 정보 저장
        const userData = {
            email: '',
            name,
            phoneNumber,
            phone: phoneNumber,
            role: 'user',
            jobExperiences,
            address: '',
            addressDetail: '',
            profileImage: '',
            status: 'temp',
            isEmailVerified: false,
            createdAt: now,
            updatedAt: now,
        };
        const docRef = await (0, firestore_1.addDoc)(usersRef, userData);
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'users', docRef.id), {
            userId: docRef.id,
            id: docRef.id,
        });
        return { success: true };
    }
    catch (error) {
        console.error('임시 사용자 생성 오류:', error);
        throw error;
    }
};
exports.createTempUser = createTempUser;
// ==================== 모든 사용자 조회 ====================
const adminGetAllUsers = async (db) => {
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
exports.adminGetAllUsers = adminGetAllUsers;
// ==================== 사용자 업데이트 ====================
const adminUpdateUser = async (db, userId, updates) => {
    const now = firestore_1.Timestamp.now();
    const userRef = (0, firestore_1.doc)(db, 'users', userId);
    await (0, firestore_1.updateDoc)(userRef, {
        ...updates,
        updatedAt: now,
    });
};
exports.adminUpdateUser = adminUpdateUser;
// ==================== 사용자 삭제 ====================
const adminDeleteUser = async (db, userId) => {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        await (0, firestore_1.deleteDoc)(userRef);
        return true;
    }
    catch (error) {
        console.error('사용자 삭제 실패:', error);
        throw error;
    }
};
exports.adminDeleteUser = adminDeleteUser;
// ==================== 사용자 재활성화 ====================
const adminReactivateUser = async (db, userId) => {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        const userDoc = await (0, firestore_1.getDoc)(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        const now = firestore_1.Timestamp.now();
        const originalName = userData.name.replace(/^\(탈퇴\)/, '');
        await (0, firestore_1.updateDoc)(userRef, {
            status: 'active',
            name: originalName,
            updatedAt: now,
        });
        return true;
    }
    catch (error) {
        console.error('사용자 재활성화 실패:', error);
        throw error;
    }
};
exports.adminReactivateUser = adminReactivateUser;
// ==================== JobCode 관련 함수 ====================
// 모든 JobCode 조회
const adminGetAllJobCodes = async (db) => {
    try {
        const querySnapshot = await (0, firestore_1.getDocs)((0, firestore_1.collection)(db, 'jobCodes'));
        const jobCodes = querySnapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
        }));
        return jobCodes;
    }
    catch (error) {
        console.error('직무 코드 조회 실패:', error);
        throw error;
    }
};
exports.adminGetAllJobCodes = adminGetAllJobCodes;
// JobCode 생성
const adminCreateJobCode = async (db, jobCodeData) => {
    try {
        const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'jobCodes'), jobCodeData);
        return docRef.id;
    }
    catch (error) {
        console.error('업무 코드 생성 실패:', error);
        throw error;
    }
};
exports.adminCreateJobCode = adminCreateJobCode;
// JobCode 삭제
const adminDeleteJobCode = async (db, jobCodeId) => {
    try {
        await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(db, 'jobCodes', jobCodeId));
        return true;
    }
    catch (error) {
        console.error('업무 코드 삭제 실패:', error);
        throw error;
    }
};
exports.adminDeleteJobCode = adminDeleteJobCode;
// JobCode 업데이트
const adminUpdateJobCode = async (db, jobCodeId, jobCodeData) => {
    try {
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'jobCodes', jobCodeId), jobCodeData);
        return true;
    }
    catch (error) {
        console.error('업무 코드 업데이트 실패:', error);
        throw error;
    }
};
exports.adminUpdateJobCode = adminUpdateJobCode;
// JobCode ID로 조회
const adminGetJobCodeById = async (db, jobCodeId) => {
    const jobCodeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobCodes', jobCodeId));
    if (!jobCodeDoc.exists())
        return null;
    return {
        id: jobCodeDoc.id,
        ...jobCodeDoc.data(),
    };
};
exports.adminGetJobCodeById = adminGetJobCodeById;
// 사용자 JobCode 추가
const adminAddUserJobCode = async (db, userId, jobCodeId, group, groupRole, classCode) => {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        const userDoc = await (0, firestore_1.getDoc)(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const user = userDoc.data();
        const jobExperiences = user.jobExperiences || [];
        // 이미 존재하는지 확인
        const exists = jobExperiences.some((exp) => exp.id === jobCodeId);
        if (exists) {
            throw new Error('이미 추가된 직무 코드입니다.');
        }
        // 새 형식으로 추가
        const newJobExperience = {
            id: jobCodeId,
            group,
            groupRole,
        };
        if (classCode && classCode.trim() !== '') {
            newJobExperience.classCode = classCode.trim();
        }
        const updatedJobExperiences = [...jobExperiences, newJobExperience];
        await (0, firestore_1.updateDoc)(userRef, { jobExperiences: updatedJobExperiences });
        return updatedJobExperiences;
    }
    catch (error) {
        console.error('직무 코드 추가 실패:', error);
        throw error;
    }
};
exports.adminAddUserJobCode = adminAddUserJobCode;
// 사용자 JobCode 정보 조회
const adminGetUserJobCodesInfo = async (db, jobExperiences) => {
    try {
        if (!jobExperiences || jobExperiences.length === 0)
            return [];
        // 배열 형식 확인 및 ID 추출
        const jobIds = jobExperiences.map((exp) => {
            // 새 형식 (객체)인 경우
            if (typeof exp === 'object' && exp !== null && 'id' in exp) {
                return exp.id;
            }
            // 이전 형식 (문자열)인 경우
            return exp;
        });
        // 병렬로 처리할 작업 배열
        const tasks = jobIds.map(async (idOrCode, index) => {
            try {
                // 그룹 정보 준비 (새 형식인 경우에만 포함)
                const group = typeof jobExperiences[index] === 'object' && 'group' in jobExperiences[index]
                    ? jobExperiences[index].group
                    : 'junior';
                // jobCodes 컬렉션에서 직접 ID로 조회
                const jobCodeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobCodes', idOrCode));
                if (jobCodeDoc.exists()) {
                    return {
                        id: jobCodeDoc.id,
                        ...jobCodeDoc.data(),
                        group,
                    };
                }
                return null;
            }
            catch (error) {
                console.error('직무 코드 정보 가져오기 오류:', error);
                return null;
            }
        });
        // 모든 작업 완료 대기
        const results = await Promise.all(tasks);
        // null 값 제거 및 결과 반환
        return results.filter((result) => result !== null);
    }
    catch (error) {
        console.error('직무 코드 정보 가져오기 오류:', error);
        return [];
    }
};
exports.adminGetUserJobCodesInfo = adminGetUserJobCodesInfo;
// 특정 직무 코드에 해당하는 사용자 조회
const adminGetUsersByJobCode = async (db, generation, code) => {
    try {
        const users = [];
        // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
        const jobCodesRef = (0, firestore_1.collection)(db, 'jobCodes');
        const codeQuery = (0, firestore_1.query)(jobCodesRef, (0, firestore_1.where)('generation', '==', generation), (0, firestore_1.where)('code', '==', code));
        const jobCodeSnapshot = await (0, firestore_1.getDocs)(codeQuery);
        if (jobCodeSnapshot.empty) {
            return users;
        }
        // jobCodes에서 찾은 문서 ID
        const jobCodeId = jobCodeSnapshot.docs[0].id;
        // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const userSnapshot = await (0, firestore_1.getDocs)(usersRef);
        userSnapshot.forEach((docSnapshot) => {
            const userData = docSnapshot.data();
            // jobExperiences 배열에서 id 필드가 jobCodeId와 일치하는 항목이 있는지 확인
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
exports.adminGetUsersByJobCode = adminGetUsersByJobCode;
// 사용자 ID로 조회
const adminGetUserById = async (db, userId) => {
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
exports.adminGetUserById = adminGetUserById;
