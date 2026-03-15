# 모바일 앱 사용자 지도 기능 설정 가이드

## 1. react-native-maps 설치

모바일 앱에서 지도 기능을 사용하기 위해 `react-native-maps`를 설치해야 합니다.

### 설치 명령어

```bash
cd packages/mobile
npx expo install react-native-maps
```

## 2. Google Maps API 키 설정 (Android)

### 2.1 Google Cloud Console에서 API 키 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. "APIs & Services" > "Credentials" 이동
4. "CREATE CREDENTIALS" > "API key" 선택
5. API 키 생성 완료

### 2.2 Maps SDK for Android 활성화

1. Google Cloud Console에서 "APIs & Services" > "Library" 이동
2. "Maps SDK for Android" 검색
3. "ENABLE" 클릭하여 활성화

### 2.3 app.json에 API 키 추가

`packages/mobile/app.json` 파일에 다음 설정을 추가하세요:

```json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      }
    },
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY"
      }
    }
  }
}
```

## 3. iOS 추가 설정

iOS에서는 `Info.plist`에 위치 권한 설명이 필요합니다. `app.json`에 다음을 추가:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "사용자 위치를 지도에 표시하기 위해 위치 정보가 필요합니다."
      }
    }
  }
}
```

## 4. 환경 변수 설정

`.env.local` 파일에 Kakao REST API 키가 이미 추가되어 있습니다:

```
EXPO_PUBLIC_KAKAO_REST_API_KEY=400fdd73ab531e1fd4ca73e2d7493891
```

## 5. 개발 클라이언트 재빌드

`react-native-maps`는 네이티브 코드를 포함하므로 개발 클라이언트를 재빌드해야 합니다:

```bash
# iOS 개발 빌드
npm run build:dev:ios

# Android 개발 빌드
npm run build:dev:android
```

또는 로컬에서 prebuild 후 실행:

```bash
# Prebuild
npm run prebuild

# iOS 실행
npm run ios

# Android 실행
npm run android
```

## 6. 기능 확인

1. 앱 실행
2. 관리자 대시보드 접속
3. "사용자 지도" 메뉴 선택
4. 지도에서 사용자 위치 확인

## 주의사항

- Google Maps API는 무료 사용량 제한이 있습니다
- API 키는 반드시 제한(Restrictions)을 설정하여 보안을 강화하세요
- 프로덕션 빌드 전에 API 키를 환경변수로 관리하세요

## 문제 해결

### 지도가 표시되지 않는 경우

1. Google Maps API 키가 올바르게 설정되었는지 확인
2. Maps SDK for Android/iOS가 활성화되었는지 확인
3. 개발 클라이언트를 재빌드했는지 확인
4. API 키 제한 설정이 올바른지 확인

### Kakao Geocoding API 오류

1. `.env.local` 파일에 `EXPO_PUBLIC_KAKAO_REST_API_KEY`가 있는지 확인
2. Kakao API 키가 유효한지 확인
3. 네트워크 연결 상태 확인
