"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelApplication = exports.updateApplication = exports.getApplicationsByJobBoardId = exports.getApplicationsByUserId = exports.createApplication = exports.deleteJobBoard = exports.updateJobBoard = exports.getActiveJobBoards = exports.getAllJobBoards = exports.getJobBoardById = exports.createJobBoard = void 0;
const firestore_1 = require("firebase/firestore");
// ==================== JobBoard 관련 서비스 ====================
const createJobBoard = async (db, jobBoardData) => {
    const now = firestore_1.Timestamp.now();
    const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'jobBoards'), {
        ...jobBoardData,
        interviewPassword: jobBoardData.interviewPassword || '',
        interviewBaseDuration: jobBoardData.interviewBaseDuration || 30,
        interviewBaseLink: jobBoardData.interviewBaseLink || '',
        interviewBaseNotes: jobBoardData.interviewBaseNotes || '',
        createdAt: now,
        updatedAt: now,
    });
    return docRef.id;
};
exports.createJobBoard = createJobBoard;
const getJobBoardById = async (db, jobBoardId) => {
    const jobBoardDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobBoards', jobBoardId));
    if (!jobBoardDoc.exists())
        return null;
    return { id: jobBoardDoc.id, ...jobBoardDoc.data() };
};
exports.getJobBoardById = getJobBoardById;
const getAllJobBoards = async (db) => {
    try {
        const querySnapshot = await (0, firestore_1.getDocs)((0, firestore_1.collection)(db, 'jobBoards'));
        const jobBoards = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const jobBoardData = docSnapshot.data();
            const jobCodeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobCodes', jobBoardData.refJobCodeId));
            const jobCodeData = jobCodeDoc.data();
            return {
                id: docSnapshot.id,
                ...jobBoardData,
                korea: jobCodeData?.korea ?? true,
            };
        }));
        return jobBoards;
    }
    catch (error) {
        console.error('모든 공고 조회 실패:', error);
        throw error;
    }
};
exports.getAllJobBoards = getAllJobBoards;
const getActiveJobBoards = async (db) => {
    try {
        const jobBoardsRef = (0, firestore_1.collection)(db, 'jobBoards');
        const q = (0, firestore_1.query)(jobBoardsRef, (0, firestore_1.where)('status', '==', 'active'));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        const jobCodeIds = new Set();
        querySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            jobCodeIds.add(data.refJobCodeId);
        });
        const jobCodePromises = Array.from(jobCodeIds).map(async (id) => {
            const jobCodeDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobCodes', id));
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
            const jobBoardData = docSnapshot.data();
            const jobCodeData = jobCodeMap.get(jobBoardData.refJobCodeId);
            return {
                id: docSnapshot.id,
                ...jobBoardData,
                korea: jobCodeData?.korea ?? true,
            };
        });
        return jobBoards;
    }
    catch (error) {
        console.error('활성화된 공고 조회 실패:', error);
        throw error;
    }
};
exports.getActiveJobBoards = getActiveJobBoards;
const updateJobBoard = async (db, jobBoardId, jobBoardData) => {
    await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'jobBoards', jobBoardId), jobBoardData);
    return jobBoardId;
};
exports.updateJobBoard = updateJobBoard;
const deleteJobBoard = async (db, jobBoardId) => {
    return await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(db, 'jobBoards', jobBoardId));
};
exports.deleteJobBoard = deleteJobBoard;
// ==================== ApplicationHistory 관련 서비스 ====================
const createApplication = async (db, applicationData) => {
    try {
        const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'applicationHistories'), {
            ...applicationData,
            applicationDate: firestore_1.Timestamp.now(),
        });
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'applicationHistories', docRef.id), {
            applicationHistoryId: docRef.id,
        });
        return docRef.id;
    }
    catch (error) {
        console.error('지원서 생성 실패:', error);
        throw error;
    }
};
exports.createApplication = createApplication;
const getApplicationsByUserId = async (db, userId) => {
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(db, 'applicationHistories'), (0, firestore_1.where)('refUserId', '==', userId)); // userId -> refUserId로 수정
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        const applications = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const applicationData = docSnapshot.data();
            const jobBoardDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'jobBoards', applicationData.refJobBoardId || applicationData.jobBoardId) // refJobBoardId 우선 사용
            );
            const jobBoardData = jobBoardDoc.data();
            return {
                id: docSnapshot.id,
                ...applicationData,
                jobBoardName: jobBoardData?.jobBoardName || '알 수 없음',
                generation: jobBoardData?.generation || '',
                code: jobBoardData?.code || '',
            };
        }));
        return applications;
    }
    catch (error) {
        console.error('사용자 지원 내역 조회 실패:', error);
        throw error;
    }
};
exports.getApplicationsByUserId = getApplicationsByUserId;
const getApplicationsByJobBoardId = async (db, jobBoardId) => {
    try {
        console.log(`🔍 [getApplicationsByJobBoardId] 공고 ID: ${jobBoardId} 조회 시작`);
        console.log('📊 [getApplicationsByJobBoardId] db 객체:', db?.app?.name || 'db undefined');
        const q = (0, firestore_1.query)((0, firestore_1.collection)(db, 'applicationHistories'), (0, firestore_1.where)('refJobBoardId', '==', jobBoardId));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        console.log(`📦 [getApplicationsByJobBoardId] 쿼리 결과: ${querySnapshot.size}개 문서 발견`);
        const applications = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
            const applicationData = docSnapshot.data();
            const userId = applicationData.refUserId || applicationData.userId; // refUserId 우선 사용
            console.log(`👤 [getApplicationsByJobBoardId] 지원서 ID: ${docSnapshot.id}, refUserId: ${applicationData.refUserId}, userId: ${applicationData.userId}`);
            if (!userId) {
                console.warn(`⚠️ [getApplicationsByJobBoardId] 지원서 ID ${docSnapshot.id}에 userId가 없습니다.`);
                return {
                    id: docSnapshot.id,
                    ...applicationData,
                    userName: '알 수 없음',
                    userEmail: '',
                    userPhone: '',
                };
            }
            const userDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(db, 'users', userId));
            const userData = userDoc.data();
            return {
                id: docSnapshot.id,
                ...applicationData,
                userName: userData?.name || '알 수 없음',
                userEmail: userData?.email || '',
                userPhone: userData?.phoneNumber || userData?.phone || '',
            };
        }));
        console.log(`✅ [getApplicationsByJobBoardId] 최종 반환: ${applications.length}명`);
        return applications;
    }
    catch (error) {
        console.error('❌ [getApplicationsByJobBoardId] 공고별 지원자 조회 실패:', error);
        throw error;
    }
};
exports.getApplicationsByJobBoardId = getApplicationsByJobBoardId;
const updateApplication = async (db, applicationId, applicationData) => {
    await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'applicationHistories', applicationId), applicationData);
};
exports.updateApplication = updateApplication;
const cancelApplication = async (db, applicationId) => {
    try {
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(db, 'applicationHistories', applicationId), {
            applicationStatus: 'cancelled',
        });
        return true;
    }
    catch (error) {
        console.error('지원 취소 실패:', error);
        throw error;
    }
};
exports.cancelApplication = cancelApplication;
