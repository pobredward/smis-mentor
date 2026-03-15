# Kakao API 키 발급 방법

1. **Kakao Developers 접속**
   - https://developers.kakao.com/ 접속
   - 카카오 계정으로 로그인

2. **앱 생성**
   - 우측 상단 "내 애플리케이션" 클릭
   - "애플리케이션 추가하기" 클릭
   - 앱 이름 입력 (예: "SMIS 멘토 지도")
   - 회사명 입력 (선택사항)

3. **REST API 키 복사**
   - 생성한 앱 클릭
   - "앱 키" 메뉴에서 "REST API 키" 복사

4. **플랫폼 등록 (선택사항)**
   - "플랫폼" 메뉴 클릭
   - "Web 플랫폼 등록" 클릭
   - 사이트 도메인 등록 (개발: http://localhost:3000)

5. **.env.local 파일 업데이트**
   ```
   NEXT_PUBLIC_KAKAO_REST_API_KEY=복사한_REST_API_키
   ```

6. **서버 재시작**
   - Next.js 개발 서버 재시작 필요
   - Ctrl+C로 서버 종료 후 `npm run dev` 재실행

## 주의사항
- REST API 키는 클라이언트에서 사용 가능합니다
- 일일 호출 한도: 300,000건 (무료)
- .env.local 파일은 .gitignore에 포함되어 있어 Git에 업로드되지 않습니다
