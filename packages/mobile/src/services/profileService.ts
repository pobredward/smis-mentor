import {
  doc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

/**
 * 프로필 이미지를 Firebase Storage에 업로드 (Mobile용)
 */
export async function uploadProfileImage(
  userId: string,
  blob: Blob,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const storageRef = ref(storage, `profile-images/${userId}`);
    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          console.error('이미지 업로드 실패:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('프로필 이미지 업로드 오류:', error);
    throw error;
  }
}

/**
 * 사용자 정보 업데이트 (Mobile용)
 */
export async function updateUserProfile(
  userId: string,
  data: any
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...data,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('사용자 정보 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 이메일 중복 확인 (Mobile용)
 */
export async function checkEmailExists(
  email: string,
  excludeUserId?: string
): Promise<boolean> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return false;
    }
    
    // excludeUserId가 있으면 해당 사용자는 제외
    if (excludeUserId) {
      const docs = querySnapshot.docs.filter(doc => doc.id !== excludeUserId);
      return docs.length > 0;
    }
    
    return true;
  } catch (error) {
    console.error('이메일 중복 확인 오류:', error);
    throw error;
  }
}

/**
 * 전화번호 중복 확인 (Mobile용)
 */
export async function checkPhoneExists(
  phoneNumber: string,
  excludeUserId?: string
): Promise<boolean> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phoneNumber', '==', phoneNumber));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return false;
    }
    
    // excludeUserId가 있으면 해당 사용자는 제외
    if (excludeUserId) {
      const docs = querySnapshot.docs.filter(doc => doc.id !== excludeUserId);
      return docs.length > 0;
    }
    
    return true;
  } catch (error) {
    console.error('전화번호 중복 확인 오류:', error);
    throw error;
  }
}
