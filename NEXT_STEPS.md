# 🚀 다음 단계: 프로젝트 실행 가이드

프로젝트 재구성이 완료되었습니다! 이제 실행해봅시다.

## 1️⃣ 의존성 설치 (필수)

```bash
# 루트 디렉토리에서 실행
npm install
```

이 명령어는 다음을 설치합니다:
- 루트 workspace 의존성
- packages/shared 의존성
- packages/web 의존성
- functions 의존성

**예상 시간**: 2-3분

## 2️⃣ Shared 패키지 빌드

```bash
npm run build:shared
```

이 명령어는:
- packages/shared/src를 TypeScript로 컴파일
- dist/ 폴더에 JavaScript + 타입 정의 생성

**예상 시간**: 10초

## 3️⃣ 웹 앱 실행

```bash
npm run dev:web
```

브라우저에서 http://localhost:3000 접속

**주의**: 환경 변수 설정이 필요할 수 있습니다.
- ENV_SETUP.md 참고하여 packages/web/.env.local 생성

## 4️⃣ Firebase Functions 배포

### 로컬 테스트 (권장)

```bash
# Functions 로컬 에뮬레이터 실행
npm run dev:functions
```

Functions는 http://localhost:5001 에서 실행됩니다.

### 실제 배포

```bash
# Firebase 로그인
firebase login

# 프로젝트 선택
firebase use smis-mentor

# Functions 빌드 및 배포
npm run build:functions
npm run deploy:functions
```

**예상 시간**: 2-3분

## 5️⃣ ST시트 동기화 테스트

### 웹 콘솔에서 테스트

```javascript
// 브라우저 개발자 도구 콘솔에서 실행
const functions = firebase.functions();
const syncSTSheet = functions.httpsCallable('syncSTSheet');

syncSTSheet({ campCode: 'E27', forceSync: true })
  .then(result => console.log('✅ 동기화 성공:', result.data))
  .catch(error => console.error('❌ 동기화 실패:', error));
```

### 예상 결과

```json
{
  "success": true,
  "totalStudents": 100,
  "version": 1,
  "syncedAt": "2026-02-24T23:30:00.000Z"
}
```

## 6️⃣ Firestore에서 데이터 확인

Firebase Console → Firestore Database → stSheetCache → E27

다음과 같은 데이터가 보여야 합니다:
- campCode: "E27"
- totalStudents: 100
- data: [...] (100명의 학생 데이터)

## 🐛 문제 해결

### "Cannot find module '@smis-mentor/shared'"

**원인**: shared 패키지가 빌드되지 않음

**해결**:
```bash
npm run build:shared
```

### Firebase Functions 배포 실패

**원인**: Firebase 로그인 안 됨 또는 프로젝트 선택 안 됨

**해결**:
```bash
firebase login
firebase use smis-mentor
```

### Google Sheets API 권한 오류

**원인**: 서비스 계정이 스프레드시트에 공유되지 않음

**해결**:
1. https://docs.google.com/spreadsheets/d/1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8 접속
2. 공유 버튼 클릭
3. `managesheet-export@managesheet-export.iam.gserviceaccount.com` 추가
4. 권한: **뷰어**

### 웹 앱이 실행되지 않음

**원인**: 환경 변수 미설정

**해결**:
```bash
# packages/web/.env.local 생성
cp ENV_SETUP.md packages/web/.env.local
# 실제 값으로 수정
```

## 📊 성공 확인 체크리스트

- [ ] `npm install` 성공
- [ ] `npm run build:shared` 성공
- [ ] `npm run dev:web` 실행되고 localhost:3000 접속 가능
- [ ] `npm run build:functions` 성공
- [ ] Firebase Functions 배포 성공
- [ ] ST시트 동기화 테스트 성공
- [ ] Firestore에서 데이터 확인

## 🎯 모든 것이 작동하면?

축하합니다! 이제 다음 단계로 진행할 수 있습니다:

1. **React Native 프로젝트 생성**
   ```bash
   cd packages
   npx create-expo-app mobile --template expo-template-blank-typescript
   ```

2. **모바일 앱 개발 시작**
   - ST시트 화면 구현
   - 캠프 실무 기능 추가

## 💬 도움이 필요하면?

- **README.md**: 전체 프로젝트 구조
- **ST_SHEET_GUIDE.md**: ST시트 기능 상세
- **ENV_SETUP.md**: 환경 변수 설정
- **MIGRATION_COMPLETE.md**: 마이그레이션 내역

## 🔗 유용한 링크

- **Firebase Console**: https://console.firebase.google.com/project/smis-mentor
- **스프레드시트**: https://docs.google.com/spreadsheets/d/1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8
- **Google Cloud Console**: https://console.cloud.google.com/apis/credentials?project=managesheet-export

프로젝트 재구성 완료! 즐거운 개발 되세요! 🎉
