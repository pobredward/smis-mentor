import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logger } from '@smis-mentor/shared';
import { storage } from '../config/firebase';

/**
 * 원어민 회원가입용 파일 업로드 서비스
 */

/**
 * URI를 Blob으로 변환
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}

/**
 * 프로필 이미지 업로드
 */
export async function uploadForeignProfileImage(
  userId: string,
  uri: string
): Promise<string> {
  try {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, `foreign-teachers/${userId}/profile.jpg`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    logger.error('프로필 이미지 업로드 실패:', error);
    throw new Error('프로필 이미지 업로드에 실패했습니다.');
  }
}

/**
 * CV (PDF) 파일 업로드
 */
export async function uploadCV(
  userId: string,
  fileUri: string,
  fileName: string
): Promise<string> {
  try {
    const blob = await uriToBlob(fileUri);
    const storageRef = ref(storage, `foreign-teachers/${userId}/cv_${fileName}`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    logger.error('CV 업로드 실패:', error);
    throw new Error('CV 업로드에 실패했습니다.');
  }
}

/**
 * 여권 사진 업로드
 */
export async function uploadPassportPhoto(
  userId: string,
  uri: string
): Promise<string> {
  try {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, `foreign-teachers/${userId}/passport.jpg`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    logger.error('여권 사진 업로드 실패:', error);
    throw new Error('여권 사진 업로드에 실패했습니다.');
  }
}

/**
 * 외국인 등록증 업로드 (선택사항)
 */
export async function uploadForeignIdCard(
  userId: string,
  uri: string
): Promise<string> {
  try {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, `foreign-teachers/${userId}/foreign_id.jpg`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    logger.error('외국인 등록증 업로드 실패:', error);
    throw new Error('외국인 등록증 업로드에 실패했습니다.');
  }
}
