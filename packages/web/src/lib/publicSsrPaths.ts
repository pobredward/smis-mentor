/**
 * 인증 확인을 기다리지 않고 서버에서 바로 렌더하는 공개 경로
 *
 * AuthProvider 는 원래 인증 확인이 끝날 때까지 아무것도 렌더하지 않는다(로그인 상태에 의존하는
 * 페이지들이 "userData 가 준비된 뒤에만 마운트된다"는 전제로 작성되어 있기 때문).
 * 아래 경로만 예외로 두어 검색엔진·AI 에이전트·비JS 클라이언트가 실제 본문과 푸터를 읽을 수 있게 한다.
 * 이 경로의 컴포넌트는 `loading` 동안 userData 가 null 일 수 있음을 감안해야 한다.
 */
const PUBLIC_SSR_PATH = /^\/(|job-board(\/[^/]+)?|recruitment|privacy-policy|terms-of-service)\/?$/;

export function isPublicSsrPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_SSR_PATH.test(pathname);
}
