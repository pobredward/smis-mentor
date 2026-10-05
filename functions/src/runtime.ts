/**
 * 프로젝트마다 다른 값 — `functions/.env.<프로젝트 id>` 에서 읽는다 (firebase deploy 가 배포 대상 프로젝트의 파일을 자동으로 불러온다)
 *   RUNTIME_SERVICE_ACCOUNT  함수 실행 계정 (smiscamp: Firebase 가 만든 firebase-adminsdk 계정)
 *   SITE_URL                 웹 푸시 아이콘 · 링크 주소
 * Storage 버킷은 기본 버킷(admin.storage().bucket())을 쓴다 — 함수 환경의 FIREBASE_CONFIG 에 들어 있다.
 */
import { defineString } from 'firebase-functions/params';

export const REGION = 'asia-northeast3';
export const RUNTIME_SA = defineString('RUNTIME_SERVICE_ACCOUNT');
export const SITE_URL = defineString('SITE_URL', { default: 'https://smiscamp.com' });
