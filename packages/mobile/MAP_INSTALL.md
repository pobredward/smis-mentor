# 📦 모바일 앱 사용자 지도 기능 빠른 설치

## 1️⃣ react-native-maps 설치

```bash
cd packages/mobile
npx expo install react-native-maps
```

## 2️⃣ Google Maps API 키 설정

### Google Cloud Console 설정
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. Maps SDK for Android/iOS 활성화
3. API 키 생성

### app.json 수정
`packages/mobile/app.json` 파일에서 다음 부분을 찾아 실제 API 키로 교체:

```json
"ios": {
  "config": {
    "googleMapsApiKey": "실제_iOS_API_키로_교체"
  }
},
"android": {
  "config": {
    "googleMaps": {
      "apiKey": "실제_Android_API_키로_교체"
    }
  }
}
```

## 3️⃣ 개발 클라이언트 재빌드

```bash
# iOS
npm run build:dev:ios

# Android  
npm run build:dev:android
```

## 4️⃣ 완료! 🎉

관리자 대시보드 > "사용자 지도" 메뉴에서 확인할 수 있습니다.

---

**⚠️ 주의:** `react-native-maps`는 네이티브 모듈이므로 반드시 개발 클라이언트를 재빌드해야 합니다.

자세한 설명은 `MOBILE_MAP_SETUP.md` 파일을 참고하세요.
