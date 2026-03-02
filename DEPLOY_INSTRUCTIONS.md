# 🚀 Firebase Functions 배포 가이드

## 📋 체크리스트

### ✅ 이미 완료된 것
- [x] Firebase 프로젝트 생성 (smis-mentor)
- [x] Functions 코드 작성
- [x] Service Account Key 준비
- [x] Firebase 설정 파일 (.firebaserc)

### ⏳ 해야 할 것 (5분 소요)
- [ ] Firebase CLI 설치
- [ ] Firebase 로그인
- [ ] Functions 배포

---

## 🔥 1단계: Firebase CLI 설치

터미널에서 실행:

```bash
npm install -g firebase-tools
```

설치 확인:
```bash
firebase --version
```

---

## 🔐 2단계: Firebase 로그인

```bash
firebase login
```

브라우저가 열리면:
1. Google 계정 선택 (Firebase 프로젝트 소유자)
2. 권한 허용
3. "Success!" 메시지 확인

---

## 📦 3단계: Functions 배포

프로젝트 루트 디렉토리에서:

```bash
# 방법 1: npm 스크립트 사용 (권장)
npm run deploy:functions

# 방법 2: 직접 배포
cd functions
firebase deploy --only functions
```

**예상 소요 시간: 2-3분**

배포 과정:
```
=== Deploying to 'smis-mentor'...

i  functions: preparing functions directory for uploading...
✔  functions: functions folder uploaded successfully
i  functions: updating Node.js 20 function syncSTSheet...
i  functions: updating Node.js 20 function getStudentsByMentor...
i  functions: updating Node.js 20 function getMentorList...
i  functions: updating Node.js 20 function getStudentDetail...
✔  functions[syncSTSheet]: Successful update operation.
✔  functions[getStudentsByMentor]: Successful update operation.
✔  functions[getMentorList]: Successful update operation.
✔  functions[getStudentDetail]: Successful update operation.

✔  Deploy complete!
```

---

## ✅ 4단계: 배포 확인

### Firebase Console에서 확인
https://console.firebase.google.com/project/smis-mentor/functions

다음 4개 함수가 보여야 합니다:
- ✅ syncSTSheet (asia-northeast3)
- ✅ getStudentsByMentor (asia-northeast3)
- ✅ getMentorList (asia-northeast3)
- ✅ getStudentDetail (asia-northeast3)

### 터미널에서 확인
```bash
firebase functions:list
```

---

## 🎯 5단계: 첫 동기화 실행

모바일 앱에서:
1. 캠프 탭 → 반 탭 이동
2. **"🔄 동기화" 버튼 클릭**
3. 약 5-10초 대기
4. "✅ 동기화 완료" 메시지 확인

이제 학생 목록이 표시됩니다!

---

## 🛠️ 문제 해결

### 오류: "command not found: firebase"
```bash
# npm global 경로 확인
npm config get prefix

# 경로를 PATH에 추가 (.zshrc 또는 .bashrc)
export PATH="$PATH:$(npm config get prefix)/bin"
source ~/.zshrc
```

### 오류: "Permission denied"
```bash
sudo npm install -g firebase-tools
```

### 오류: "Not authorized"
```bash
firebase logout
firebase login
```

### 배포 실패 시
```bash
# 로그 확인
firebase functions:log

# 다시 시도
cd functions
npm run build
firebase deploy --only functions --force
```

---

## 📊 배포 후 모니터링

### 실시간 로그 확인
```bash
firebase functions:log --only syncSTSheet
```

### Firebase Console에서 확인
1. Functions → 대시보드
2. 호출 횟수, 실행 시간, 오류율 확인

---

## 🎉 완료!

배포가 완료되면:
- ✅ 모바일 앱에서 동기화 가능
- ✅ 멘토별 학생 목록 조회 가능
- ✅ 학생 상세 정보 확인 가능

다음 명령어로 언제든 재배포 가능:
```bash
npm run deploy:functions
```

---

## 💡 팁

### 빠른 재배포 (특정 함수만)
```bash
firebase deploy --only functions:getStudentsByMentor
```

### 환경 변수 설정 (나중에 필요 시)
```bash
firebase functions:config:set someservice.key="THE API KEY"
```

### Functions 삭제
```bash
firebase functions:delete functionName
```
