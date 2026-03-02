# 🚀 Firebase Functions 배포 가이드

## 현재 상황

Functions가 작성되었지만 **아직 배포되지 않았습니다**.

## 배포 방법

### 1. Firebase CLI 설치 (한 번만)

```bash
npm install -g firebase-tools
```

### 2. Firebase 로그인

```bash
firebase login
```

### 3. Functions 배포

```bash
# 루트 폴더에서
npm run deploy:functions

# 또는 functions 폴더에서 직접
cd functions
firebase deploy --only functions
```

## 배포할 Functions

- ✅ `syncSTSheet` - ST 시트 동기화 (Google Sheets → Firestore)
- ✅ `getStudentsByMentor` - 멘토별 학생 목록 조회
- ✅ `getMentorList` - 멘토 목록 조회
- ✅ `getStudentDetail` - 학생 상세 정보 조회

## ⚠️ 임시 변경사항

개발 편의를 위해 **인증 체크를 임시로 비활성화**했습니다:
- 실제 배포 시에는 다시 활성화해야 합니다
- `campCode`는 기본값 'E27'로 설정되어 있습니다

## 배포 후 테스트

```bash
# Firestore에 데이터 있는지 확인
# Firebase Console → Firestore Database → stSheetCache 컬렉션
```

## 문제 해결

### Functions가 호출되지 않는 경우

1. **배포 확인**
   ```bash
   firebase functions:list
   ```

2. **로그 확인**
   ```bash
   firebase functions:log
   ```

3. **리전 확인**
   - 모바일 앱: `asia-northeast3`
   - Functions: `asia-northeast3`
   - 일치해야 함!

## 다음 단계

1. Firebase CLI 설치
2. `firebase login` 실행
3. `npm run deploy:functions` 실행
4. 모바일 앱에서 동기화 버튼 클릭
5. 학생 목록 확인
