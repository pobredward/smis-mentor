// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://58c532b6dbdac66a3932abacbe0d264f@o4511139689791488.ingest.us.sentry.io/4511139695886336",

  // Session Replay: 텍스트·입력·미디어 전부 마스킹 (개인정보 보호)
  integrations: [Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // 개인정보(IP·쿠키·사용자 식별자) 자동 전송 비활성화 — 학생·지원자 정보가 이벤트에 섞여 나가지 않도록
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
