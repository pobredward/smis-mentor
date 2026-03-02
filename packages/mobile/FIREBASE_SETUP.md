# Firebase 설정 가이드

## Android 설정

Android용 `google-services.json` 파일이 필요합니다.

### 다운로드 방법
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. `smis-mentor` 프로젝트 선택
3. 프로젝트 설정 > 일반 탭
4. Android 앱 섹션에서 `google-services.json` 다운로드
5. 다운로드한 파일을 프로젝트 루트에 배치: `/Users/sunwoongshin/Desktop/dev/smis-mentor/google-services.json`

### Bundle ID 확인
- Package name: `com.smis.smismentor`
- 만약 Firebase Console에 이 패키지명으로 등록된 Android 앱이 없다면 추가해야 합니다.

## iOS 설정

이미 설정되어 있습니다:
- 파일 위치: `/Users/sunwoongshin/Desktop/dev/smis-mentor/GoogleService-Info.plist`
- Bundle ID: `com.smis.smismentor`

## app.json 설정

Firebase 파일 경로가 `app.json`에 설정되어 있습니다:
- iOS: `googleServicesFile: "../../GoogleService-Info.plist"`
- Android: `google-services.json` 파일을 프로젝트 루트에 배치하면 EAS Build가 자동으로 인식합니다.

## 참고사항

현재 프로젝트는 Firebase JS SDK를 사용하고 있어 네이티브 플러그인 없이도 작동합니다.
단, Google Sign-In과 같은 네이티브 기능을 위해 설정 파일이 필요합니다.
