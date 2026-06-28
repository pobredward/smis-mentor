import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // 개발 환경에서 자주 사용되는 API 라우트를 미리 컴파일하여 첫 요청 지연 방지.
    // Turbopack은 on-demand 컴파일이므로 서버 시작 후 비동기로 트리거한다.
    // POST 요청으로 컴파일을 트리거 (인증 실패 401 응답이어도 컴파일은 완료됨).
    if (process.env.NODE_ENV === "development") {
      setTimeout(() => {
        const base = `http://localhost:${process.env.PORT ?? 3000}`;
        for (const path of ["/api/st/sync-sheet", "/api/st/update-placement"]) {
          fetch(`${base}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).catch(() => {});
        }
      }, 3000);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
