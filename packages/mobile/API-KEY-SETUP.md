# App Store Connect API Key 설정 가이드

## 🔐 API Key 파일 준비

### 1. API Key 파일 위치
`AuthKey_3XHH4P2YTX.p8` 파일을 다음 위치에 저장하세요:
```
packages/mobile/AuthKey_3XHH4P2YTX.p8
```

### 2. API Key 정보 확인
- **Key ID**: `3XHH4P2YTX`
- **Issuer ID**: `d6174485-f3ab-4658-866e-7ab524b197d1`
- **Team ID**: `3V8G7Y74HY`
- **Apple ID**: `6759916856`

---

## 📝 현재 설정 상태

`eas.json` 파일이 다음과 같이 업데이트되었습니다:

```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6759916856",
        "appleTeamId": "3V8G7Y74HY",
        "ascApiKeyPath": "./AuthKey_3XHH4P2YTX.p8",
        "ascApiKeyIssuerId": "d6174485-f3ab-4658-866e-7ab524b197d1",
        "ascApiKeyId": "3XHH4P2YTX"
      }
    }
  }
}
```

---

## 🚀 재제출 단계

### 1. API Key 파일 다운로드
App Store Connect에서 API Key를 다운로드하세요:
1. https://appstoreconnect.apple.com/access/api 접속
2. "Keys" 탭 클릭
3. `3XHH4P2YTX` Key 찾기
4. "Download API Key" 클릭 (한 번만 가능!)

> ⚠️ **중요**: API Key는 한 번만 다운로드할 수 있습니다. 이미 다운로드했다면 기존 파일을 사용하세요.

### 2. 파일 저장
```bash
# API Key 파일을 mobile 디렉토리로 복사
cp ~/Downloads/AuthKey_3XHH4P2YTX.p8 packages/mobile/
```

### 3. 파일 권한 확인
```bash
# 파일이 존재하는지 확인
ls -la packages/mobile/AuthKey_3XHH4P2YTX.p8

# 파일 내용 확인 (첫 줄만)
head -n 1 packages/mobile/AuthKey_3XHH4P2YTX.p8
# 출력: -----BEGIN PRIVATE KEY-----
```

### 4. 재제출
```bash
cd packages/mobile
npm run submit:ios
```

---

## 🔍 문제 해결

### API Key 파일이 없는 경우

**옵션 1: 새 API Key 생성**
1. https://appstoreconnect.apple.com/access/api
2. "+" 버튼 클릭
3. Key Name: `SMIS Mentor Submission`
4. Access: `App Manager` 권한 선택
5. Generate 후 다운로드
6. `eas.json`에서 Key ID 업데이트

**옵션 2: EAS Credentials 사용 (서버에 저장)**
```bash
cd packages/mobile
eas credentials

# 선택:
# 1. ios
# 2. App Store Connect API Key
# 3. Set up a new App Store Connect API Key
# 4. API Key 파일 업로드
```

그런 다음 `eas.json`에서 로컬 경로 설정 제거:
```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6759916856"
      }
    }
  }
}
```

---

## ✅ 제출 성공 확인

제출이 성공하면:
```
✔ Scheduled iOS submission
Submission details: https://expo.dev/accounts/...
```

5-10분 후 App Store Connect에서 확인:
```bash
open https://appstoreconnect.apple.com/apps/6759916856
```

---

## 🔒 보안 주의사항

- ✅ `.gitignore`에 `*.p8` 추가됨 (이미 설정됨)
- ✅ API Key 파일은 절대 Git에 커밋하지 마세요
- ✅ 팀원과 공유 시 안전한 방법 사용 (1Password, Keychain 등)

---

## 📞 추가 도움말

### App Store Connect API Key 문서
https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api

### EAS Submit 문서
https://docs.expo.dev/submit/ios/

### 문제 지속 시
1. Expo 포럼: https://forums.expo.dev
2. GitHub Issues: https://github.com/expo/eas-cli/issues
