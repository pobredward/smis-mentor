import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, Timestamp, } from 'firebase/firestore';
import { logger } from '../../utils/logger';
// ==================== 임시 사용자 생성 ====================
export const createTempUser = async (db, name, phoneNumber, jobExperienceIds, jobExperienceGroups = [], jobExperienceGroupRoles = [], jobExperienceClassCodes = [], role = 'mentor_temp') => {
    try {
        // 동일한 이름과 전화번호를 가진 사용자가 있는지 확인
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('name', '==', name), where('phoneNumber', '==', phoneNumber));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            throw new Error('이미 등록된 유저입니다');
        }
        // JobExperiences 객체 배열 생성
        const jobExperiences = jobExperienceIds.map((id, index) => ({
            id,
            group: (index < jobExperienceGroups.length
                ? jobExperienceGroups[index]
                : 'junior'),
            groupRole: (index < jobExperienceGroupRoles.length
                ? jobExperienceGroupRoles[index]
                : '담임'),
            classCode: index < jobExperienceClassCodes.length
                ? jobExperienceClassCodes[index]
                : undefined,
        }));
        const now = Timestamp.now();
        // Firestore에 임시 사용자 정보 저장
        const userData = {
            email: '',
            name,
            phoneNumber,
            phone: phoneNumber,
            role,
            jobExperiences,
            address: '',
            addressDetail: '',
            profileImage: '',
            status: 'temp',
            isEmailVerified: false,
            createdAt: now,
            updatedAt: now,
        };
        const docRef = await addDoc(usersRef, userData);
        await updateDoc(doc(db, 'users', docRef.id), {
            userId: docRef.id,
            id: docRef.id,
        });
        return { success: true };
    }
    catch (error) {
        logger.error('임시 사용자 생성 오류:', error);
        throw error;
    }
};
// ==================== 모든 사용자 조회 ====================
export const adminGetAllUsers = async (db, includeDeleted = false) => {
    try {
        const usersRef = collection(db, 'users');
        // 삭제된 사용자 제외 옵션
        let q = query(usersRef);
        if (!includeDeleted) {
            q = query(usersRef, where('status', '!=', 'deleted'));
        }
        const querySnapshot = await getDocs(q);
        const users = [];
        querySnapshot.forEach((docSnapshot) => {
            users.push(docSnapshot.data());
        });
        logger.info(`✅ 사용자 조회 완료: ${users.length}명 (삭제된 사용자 ${includeDeleted ? '포함' : '제외'})`);
        return users;
    }
    catch (error) {
        logger.error('모든 사용자 조회 실패:', error);
        throw error;
    }
};
// ==================== 사용자 업데이트 ====================
export const adminUpdateUser = async (db, userId, updates) => {
    const now = Timestamp.now();
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, Object.assign(Object.assign({}, updates), { updatedAt: now }));
};
// ==================== 사용자 삭제 ====================
export const adminDeleteUser = async (db, userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        await deleteDoc(userRef);
        return true;
    }
    catch (error) {
        logger.error('사용자 삭제 실패:', error);
        throw error;
    }
};
// ==================== 사용자 재활성화 ====================
export const adminReactivateUser = async (db, userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        const now = Timestamp.now();
        const originalName = userData.name.replace(/^\(탈퇴\)/, '');
        await updateDoc(userRef, {
            status: 'active',
            name: originalName,
            updatedAt: now,
        });
        return true;
    }
    catch (error) {
        logger.error('사용자 재활성화 실패:', error);
        throw error;
    }
};
// ==================== JobCode 관련 함수 ====================
// 모든 JobCode 조회
export const adminGetAllJobCodes = async (db) => {
    try {
        const querySnapshot = await getDocs(collection(db, 'jobCodes'));
        const jobCodes = querySnapshot.docs.map((docSnapshot) => (Object.assign({ id: docSnapshot.id }, docSnapshot.data())));
        return jobCodes;
    }
    catch (error) {
        logger.error('직무 코드 조회 실패:', error);
        throw error;
    }
};
// JobCode 생성
export const adminCreateJobCode = async (db, jobCodeData) => {
    try {
        const docRef = await addDoc(collection(db, 'jobCodes'), jobCodeData);
        return docRef.id;
    }
    catch (error) {
        logger.error('업무 코드 생성 실패:', error);
        throw error;
    }
};
// JobCode 삭제
export const adminDeleteJobCode = async (db, jobCodeId) => {
    try {
        await deleteDoc(doc(db, 'jobCodes', jobCodeId));
        return true;
    }
    catch (error) {
        logger.error('업무 코드 삭제 실패:', error);
        throw error;
    }
};
// JobCode 업데이트
export const adminUpdateJobCode = async (db, jobCodeId, jobCodeData) => {
    try {
        await updateDoc(doc(db, 'jobCodes', jobCodeId), jobCodeData);
        return true;
    }
    catch (error) {
        logger.error('업무 코드 업데이트 실패:', error);
        throw error;
    }
};
// JobCode ID로 조회
export const adminGetJobCodeById = async (db, jobCodeId) => {
    const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobCodeId));
    if (!jobCodeDoc.exists())
        return null;
    return Object.assign({ id: jobCodeDoc.id }, jobCodeDoc.data());
};
// 사용자 JobCode 추가
export const adminAddUserJobCode = async (db, userId, jobCodeId, group, groupRole, classCode) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
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
            group: group,
            groupRole: groupRole,
        };
        if (classCode && classCode.trim() !== '') {
            newJobExperience.classCode = classCode.trim();
        }
        const updatedJobExperiences = [...jobExperiences, newJobExperience];
        await updateDoc(userRef, { jobExperiences: updatedJobExperiences });
        return updatedJobExperiences;
    }
    catch (error) {
        logger.error('직무 코드 추가 실패:', error);
        throw error;
    }
};
// 사용자 JobCode 삭제
export const adminRemoveUserJobCode = async (db, userId, jobCodeId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const user = userDoc.data();
        const jobExperiences = user.jobExperiences || [];
        // 해당 jobCodeId를 제외한 배열 생성
        const updatedJobExperiences = jobExperiences.filter((exp) => exp.id !== jobCodeId);
        // jobExperiences 업데이트
        await updateDoc(userRef, { jobExperiences: updatedJobExperiences });
        // 삭제되는 캠프가 활성 캠프인 경우 자동으로 다음 캠프로 전환
        if (user.activeJobExperienceId === jobCodeId) {
            const newActiveJobExpId = updatedJobExperiences.length > 0
                ? updatedJobExperiences[0].id
                : null;
            await updateDoc(userRef, {
                activeJobExperienceId: newActiveJobExpId
            });
            logger.info('활성 캠프 자동 전환:', {
                userId,
                deletedJobCodeId: jobCodeId,
                newActiveJobExperienceId: newActiveJobExpId,
            });
        }
        return updatedJobExperiences;
    }
    catch (error) {
        logger.error('직무 코드 삭제 실패:', error);
        throw error;
    }
};
// 사용자 JobCode 정보 조회
export const adminGetUserJobCodesInfo = async (db, jobExperiences) => {
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
                const group = typeof jobExperiences[index] === 'object' &&
                    jobExperiences[index] !== null &&
                    'group' in jobExperiences[index]
                    ? jobExperiences[index].group
                    : 'junior';
                // jobCodes 컬렉션에서 직접 ID로 조회
                const jobCodeDoc = await getDoc(doc(db, 'jobCodes', idOrCode));
                if (jobCodeDoc.exists()) {
                    return Object.assign(Object.assign({ id: jobCodeDoc.id }, jobCodeDoc.data()), { group });
                }
                return null;
            }
            catch (error) {
                logger.error('직무 코드 정보 가져오기 오류:', error);
                return null;
            }
        });
        // 모든 작업 완료 대기
        const results = await Promise.all(tasks);
        // null 값 제거 및 결과 반환
        return results.filter((result) => result !== null);
    }
    catch (error) {
        logger.error('직무 코드 정보 가져오기 오류:', error);
        return [];
    }
};
// 특정 직무 코드에 해당하는 사용자 조회
export const adminGetUsersByJobCode = async (db, generation, code) => {
    try {
        const users = [];
        // jobCodes 컬렉션에서 해당 코드와 세대에 맞는 문서 ID 찾기
        const jobCodesRef = collection(db, 'jobCodes');
        const codeQuery = query(jobCodesRef, where('generation', '==', generation), where('code', '==', code));
        const jobCodeSnapshot = await getDocs(codeQuery);
        if (jobCodeSnapshot.empty) {
            return users;
        }
        // jobCodes에서 찾은 문서 ID
        const jobCodeId = jobCodeSnapshot.docs[0].id;
        // 해당 jobCodeId를 jobExperiences 배열의 id 필드에 포함하는 사용자 조회
        const usersRef = collection(db, 'users');
        const userSnapshot = await getDocs(usersRef);
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
        logger.error('직무 코드별 사용자 조회 실패:', error);
        throw error;
    }
};
// 사용자 ID로 조회
export const adminGetUserById = async (db, userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists())
            return null;
        const userData = userDoc.data();
        // id 필드가 없는 경우 자동으로 추가 (오래된 데이터 마이그레이션)
        if (!userData.id) {
            logger.warn(`사용자 ${userId}에 id 필드가 없습니다. 자동으로 추가합니다.`);
            await updateDoc(doc(db, 'users', userId), { id: userId });
            return Object.assign(Object.assign({}, userData), { id: userId });
        }
        return userData;
    }
    catch (error) {
        logger.error('사용자 정보 가져오기 실패:', error);
        throw error;
    }
};
// ==================== 관리자 임시 캠프 활성화 ====================
/**
 * 관리자가 임시로 캠프를 활성화하여 조회할 수 있도록 함
 * 실제 jobExperiences에 추가하지 않고 임시로 activeJobExperienceId만 변경
 */
export const adminSetTemporaryCamp = async (db, userId, jobCodeId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        // 관리자가 아닌 경우 에러
        if (userData.role !== 'admin') {
            throw new Error('관리자만 임시 캠프 활성화가 가능합니다.');
        }
        // jobCode가 실제로 존재하는지 확인
        const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobCodeId));
        if (!jobCodeDoc.exists()) {
            throw new Error('존재하지 않는 캠프 코드입니다.');
        }
        // 임시 활성화 정보를 저장 (adminTempActiveCamp 필드 사용)
        await updateDoc(userRef, {
            activeJobExperienceId: jobCodeId,
            adminTempActiveCamp: jobCodeId, // 관리자 임시 활성화 표시
            updatedAt: Timestamp.now(),
        });
        logger.info('관리자 임시 캠프 활성화 성공:', {
            userId,
            jobCodeId,
            isTemporary: true,
        });
    }
    catch (error) {
        logger.error('관리자 임시 캠프 활성화 실패:', error);
        throw error;
    }
};
/**
 * 관리자의 임시 캠프 활성화를 해제하고 원래 캠프로 복원
 */
export const adminClearTemporaryCamp = async (db, userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }
        const userData = userDoc.data();
        // 관리자가 아닌 경우 에러
        if (userData.role !== 'admin') {
            throw new Error('관리자만 임시 캠프 해제가 가능합니다.');
        }
        // 관리자의 실제 직무 경험에서 첫 번째 캠프를 활성화
        const originalActiveJobId = userData.jobExperiences && userData.jobExperiences.length > 0
            ? userData.jobExperiences[0].id
            : null;
        // 임시 활성화 정보 삭제 및 원래 캠프로 복원
        const updates = {
            activeJobExperienceId: originalActiveJobId,
            updatedAt: Timestamp.now(),
        };
        // adminTempActiveCamp 필드 삭제
        const { deleteField } = await import('firebase/firestore');
        updates.adminTempActiveCamp = deleteField();
        await updateDoc(userRef, updates);
        logger.info('관리자 임시 캠프 활성화 해제 성공:', {
            userId,
            restoredJobCodeId: originalActiveJobId,
        });
    }
    catch (error) {
        logger.error('관리자 임시 캠프 활성화 해제 실패:', error);
        throw error;
    }
};
/**
 * 관리자가 현재 임시 캠프를 활성화 중인지 확인
 */
export const adminIsUsingTemporaryCamp = async (db, userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            return false;
        }
        const userData = userDoc.data();
        return !!userData.adminTempActiveCamp;
    }
    catch (error) {
        logger.error('임시 캠프 사용 여부 확인 실패:', error);
        return false;
    }
};
