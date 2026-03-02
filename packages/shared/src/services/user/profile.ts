import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
} from 'firebase/storage';
import {
  doc,
  updateDoc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  Firestore,
} from 'firebase/firestore';
import { User } from '../../types';

/**
 * 프로필 이미지를 Firebase Storage에 업로드
 */
export async function uploadProfileImage(
  storage: FirebaseStorage,
  userId: string,
  file: File | Blob,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const storageRef = ref(storage, `profile-images/${userId}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

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
 * 프로필 이미지 삭제
 */
export async function deleteProfileImage(
  storage: FirebaseStorage,
  userId: string
): Promise<void> {
  try {
    const storageRef = ref(storage, `profile-images/${userId}`);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('프로필 이미지 삭제 오류:', error);
    throw error;
  }
}

/**
 * 사용자 정보 업데이트
 */
export async function updateUserProfile(
  db: Firestore,
  userId: string,
  data: Partial<User>
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
 * 프로필 이미지 URL 업데이트
 */
export async function updateProfileImageUrl(
  db: Firestore,
  userId: string,
  imageUrl: string
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      profileImage: imageUrl,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('프로필 이미지 URL 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 이메일 중복 확인
 */
export async function checkEmailExists(
  db: Firestore,
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
 * 전화번호 중복 확인
 */
export async function checkPhoneExists(
  db: Firestore,
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

/**
 * 사용자 정보 조회
 */
export async function getUserById(
  db: Firestore,
  userId: string
): Promise<User | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return { userId: userSnap.id, ...userSnap.data() } as User;
    }
    
    return null;
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    throw error;
  }
}
