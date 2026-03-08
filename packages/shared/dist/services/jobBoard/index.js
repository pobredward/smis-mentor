import { collection, doc, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, Timestamp, } from 'firebase/firestore';
// ==================== JobBoard 관련 서비스 ====================
export const createJobBoard = async (db, jobBoardData) => {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, 'jobBoards'), Object.assign(Object.assign({}, jobBoardData), { interviewPassword: jobBoardData.interviewPassword || '', interviewBaseDuration: jobBoardData.interviewBaseDuration || 30, interviewBaseLink: jobBoardData.interviewBaseLink || '', interviewBaseNotes: jobBoardData.interviewBaseNotes || '', createdAt: now, updatedAt: now }));
    return docRef.id;
};
export const getJobBoardById = async (db, jobBoardId) => {
    const jobBoardDoc = await getDoc(doc(db, 'jobBoards', jobBoardId));
    if (!jobBoardDoc.exists())
        return null;
    return Object.assign({ id: jobBoardDoc.id }, jobBoardDoc.data());
};
export const getAllJobBoards = async (db) => {
    try {
        const querySnapshot = await getDocs(collection(db, 'jobBoards'));
        const jobBoards = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            var _a;
            const jobBoardData = docSnapshot.data();
            const jobCodeDoc = await getDoc(doc(db, 'jobCodes', jobBoardData.refJobCodeId));
            const jobCodeData = jobCodeDoc.data();
            return Object.assign(Object.assign({ id: docSnapshot.id }, jobBoardData), { korea: (_a = jobCodeData === null || jobCodeData === void 0 ? void 0 : jobCodeData.korea) !== null && _a !== void 0 ? _a : true });
        }));
        return jobBoards;
    }
    catch (error) {
        console.error('모든 공고 조회 실패:', error);
        throw error;
    }
};
export const getActiveJobBoards = async (db) => {
    try {
        const jobBoardsRef = collection(db, 'jobBoards');
        const q = query(jobBoardsRef, where('status', '==', 'active'));
        const querySnapshot = await getDocs(q);
        const jobCodeIds = new Set();
        querySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            jobCodeIds.add(data.refJobCodeId);
        });
        const jobCodePromises = Array.from(jobCodeIds).map(async (id) => {
            const jobCodeDoc = await getDoc(doc(db, 'jobCodes', id));
            return {
                id,
                data: jobCodeDoc.data(),
            };
        });
        const jobCodes = await Promise.all(jobCodePromises);
        const jobCodeMap = new Map();
        jobCodes.forEach(({ id, data }) => {
            jobCodeMap.set(id, data);
        });
        const jobBoards = querySnapshot.docs.map((docSnapshot) => {
            var _a;
            const jobBoardData = docSnapshot.data();
            const jobCodeData = jobCodeMap.get(jobBoardData.refJobCodeId);
            return Object.assign(Object.assign({ id: docSnapshot.id }, jobBoardData), { korea: (_a = jobCodeData === null || jobCodeData === void 0 ? void 0 : jobCodeData.korea) !== null && _a !== void 0 ? _a : true });
        });
        return jobBoards;
    }
    catch (error) {
        console.error('활성화된 공고 조회 실패:', error);
        throw error;
    }
};
export const updateJobBoard = async (db, jobBoardId, jobBoardData) => {
    await updateDoc(doc(db, 'jobBoards', jobBoardId), jobBoardData);
    return jobBoardId;
};
export const deleteJobBoard = async (db, jobBoardId) => {
    return await deleteDoc(doc(db, 'jobBoards', jobBoardId));
};
// ==================== ApplicationHistory 관련 서비스 ====================
export const createApplication = async (db, applicationData) => {
    try {
        const docRef = await addDoc(collection(db, 'applicationHistories'), Object.assign(Object.assign({}, applicationData), { applicationDate: Timestamp.now() }));
        await updateDoc(doc(db, 'applicationHistories', docRef.id), {
            applicationHistoryId: docRef.id,
        });
        return docRef.id;
    }
    catch (error) {
        console.error('지원서 생성 실패:', error);
        throw error;
    }
};
export const getApplicationsByUserId = async (db, userId) => {
    try {
        const q = query(collection(db, 'applicationHistories'), where('refUserId', '==', userId)); // userId -> refUserId로 수정
        const querySnapshot = await getDocs(q);
        const applications = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const applicationData = docSnapshot.data();
            const jobBoardDoc = await getDoc(doc(db, 'jobBoards', applicationData.refJobBoardId || applicationData.jobBoardId) // refJobBoardId 우선 사용
            );
            const jobBoardData = jobBoardDoc.data();
            return Object.assign(Object.assign({ id: docSnapshot.id }, applicationData), { jobBoardName: (jobBoardData === null || jobBoardData === void 0 ? void 0 : jobBoardData.jobBoardName) || '알 수 없음', generation: (jobBoardData === null || jobBoardData === void 0 ? void 0 : jobBoardData.generation) || '', code: (jobBoardData === null || jobBoardData === void 0 ? void 0 : jobBoardData.code) || '' });
        }));
        return applications;
    }
    catch (error) {
        console.error('사용자 지원 내역 조회 실패:', error);
        throw error;
    }
};
export const getApplicationsByJobBoardId = async (db, jobBoardId) => {
    var _a;
    try {
        console.log(`🔍 [getApplicationsByJobBoardId] 공고 ID: ${jobBoardId} 조회 시작`);
        console.log('📊 [getApplicationsByJobBoardId] db 객체:', ((_a = db === null || db === void 0 ? void 0 : db.app) === null || _a === void 0 ? void 0 : _a.name) || 'db undefined');
        const q = query(collection(db, 'applicationHistories'), where('refJobBoardId', '==', jobBoardId));
        const querySnapshot = await getDocs(q);
        console.log(`📦 [getApplicationsByJobBoardId] 쿼리 결과: ${querySnapshot.size}개 문서 발견`);
        const applications = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const applicationData = docSnapshot.data();
            const userId = applicationData.refUserId || applicationData.userId; // refUserId 우선 사용
            console.log(`👤 [getApplicationsByJobBoardId] 지원서 ID: ${docSnapshot.id}, refUserId: ${applicationData.refUserId}, userId: ${applicationData.userId}`);
            if (!userId) {
                console.warn(`⚠️ [getApplicationsByJobBoardId] 지원서 ID ${docSnapshot.id}에 userId가 없습니다.`);
                return Object.assign(Object.assign({ id: docSnapshot.id }, applicationData), { userName: '알 수 없음', userEmail: '', userPhone: '' });
            }
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();
            return Object.assign(Object.assign({ id: docSnapshot.id }, applicationData), { userName: (userData === null || userData === void 0 ? void 0 : userData.name) || '알 수 없음', userEmail: (userData === null || userData === void 0 ? void 0 : userData.email) || '', userPhone: (userData === null || userData === void 0 ? void 0 : userData.phoneNumber) || (userData === null || userData === void 0 ? void 0 : userData.phone) || '' });
        }));
        console.log(`✅ [getApplicationsByJobBoardId] 최종 반환: ${applications.length}명`);
        return applications;
    }
    catch (error) {
        console.error('❌ [getApplicationsByJobBoardId] 공고별 지원자 조회 실패:', error);
        throw error;
    }
};
export const updateApplication = async (db, applicationId, applicationData) => {
    await updateDoc(doc(db, 'applicationHistories', applicationId), applicationData);
};
export const cancelApplication = async (db, applicationId) => {
    try {
        await updateDoc(doc(db, 'applicationHistories', applicationId), {
            applicationStatus: 'cancelled',
        });
        return true;
    }
    catch (error) {
        console.error('지원 취소 실패:', error);
        throw error;
    }
};
