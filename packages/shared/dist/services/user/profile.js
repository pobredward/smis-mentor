"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProfileImage = uploadProfileImage;
exports.deleteProfileImage = deleteProfileImage;
exports.updateUserProfile = updateUserProfile;
exports.updateProfileImageUrl = updateProfileImageUrl;
exports.checkEmailExists = checkEmailExists;
exports.checkPhoneExists = checkPhoneExists;
exports.getUserById = getUserById;
const storage_1 = require("firebase/storage");
const firestore_1 = require("firebase/firestore");
/**
 * 프로필 이미지를 Firebase Storage에 업로드
 */
async function uploadProfileImage(storage, userId, file, onProgress) {
    try {
        const storageRef = (0, storage_1.ref)(storage, `profile-images/${userId}`);
        const uploadTask = (0, storage_1.uploadBytesResumable)(storageRef, file);
        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed', (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (onProgress) {
                    onProgress(progress);
                }
            }, (error) => {
                console.error('이미지 업로드 실패:', error);
                reject(error);
            }, async () => {
                try {
                    const downloadURL = await (0, storage_1.getDownloadURL)(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    catch (error) {
        console.error('프로필 이미지 업로드 오류:', error);
        throw error;
    }
}
/**
 * 프로필 이미지 삭제
 */
async function deleteProfileImage(storage, userId) {
    try {
        const storageRef = (0, storage_1.ref)(storage, `profile-images/${userId}`);
        await (0, storage_1.deleteObject)(storageRef);
    }
    catch (error) {
        console.error('프로필 이미지 삭제 오류:', error);
        throw error;
    }
}
/**
 * 사용자 정보 업데이트
 */
async function updateUserProfile(db, userId, data) {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        await (0, firestore_1.updateDoc)(userRef, {
            ...data,
            updatedAt: new Date(),
        });
    }
    catch (error) {
        console.error('사용자 정보 업데이트 오류:', error);
        throw error;
    }
}
/**
 * 프로필 이미지 URL 업데이트
 */
async function updateProfileImageUrl(db, userId, imageUrl) {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        await (0, firestore_1.updateDoc)(userRef, {
            profileImage: imageUrl,
            updatedAt: new Date(),
        });
    }
    catch (error) {
        console.error('프로필 이미지 URL 업데이트 오류:', error);
        throw error;
    }
}
/**
 * 이메일 중복 확인
 */
async function checkEmailExists(db, email, excludeUserId) {
    try {
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('email', '==', email));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        if (querySnapshot.empty) {
            return false;
        }
        // excludeUserId가 있으면 해당 사용자는 제외
        if (excludeUserId) {
            const docs = querySnapshot.docs.filter(doc => doc.id !== excludeUserId);
            return docs.length > 0;
        }
        return true;
    }
    catch (error) {
        console.error('이메일 중복 확인 오류:', error);
        throw error;
    }
}
/**
 * 전화번호 중복 확인
 */
async function checkPhoneExists(db, phoneNumber, excludeUserId) {
    try {
        const usersRef = (0, firestore_1.collection)(db, 'users');
        const q = (0, firestore_1.query)(usersRef, (0, firestore_1.where)('phoneNumber', '==', phoneNumber));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        if (querySnapshot.empty) {
            return false;
        }
        // excludeUserId가 있으면 해당 사용자는 제외
        if (excludeUserId) {
            const docs = querySnapshot.docs.filter(doc => doc.id !== excludeUserId);
            return docs.length > 0;
        }
        return true;
    }
    catch (error) {
        console.error('전화번호 중복 확인 오류:', error);
        throw error;
    }
}
/**
 * 사용자 정보 조회
 */
async function getUserById(db, userId) {
    try {
        const userRef = (0, firestore_1.doc)(db, 'users', userId);
        const userSnap = await (0, firestore_1.getDoc)(userRef);
        if (userSnap.exists()) {
            return { userId: userSnap.id, ...userSnap.data() };
        }
        return null;
    }
    catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        throw error;
    }
}
