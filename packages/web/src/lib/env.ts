import { z } from 'zod';

const envSchema = z.object({
  // Firebase Client
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, 'Firebase API Key가 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, 'Firebase Auth Domain이 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase Project ID가 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1, 'Firebase Storage Bucket이 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1, 'Firebase Messaging Sender ID가 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1, 'Firebase App ID가 필요합니다.'),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  
  // Firebase Admin
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().min(1, 'Firebase Service Account Key가 필요합니다.').optional(),
  
  // Firebase Emulator
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: z.enum(['true', 'false']).optional(),
  
  // Naver Cloud SMS
  NAVER_CLOUD_SMS_SERVICE_ID: z.string().min(1, 'Naver Cloud SMS Service ID가 필요합니다.').optional(),
  NAVER_CLOUD_SMS_ACCESS_KEY: z.string().min(1, 'Naver Cloud SMS Access Key가 필요합니다.').optional(),
  NAVER_CLOUD_SMS_SECRET_KEY: z.string().min(1, 'Naver Cloud SMS Secret Key가 필요합니다.').optional(),
  NAVER_CLOUD_SMS_CALLER_NUMBER: z.string().min(1, 'Naver Cloud SMS Caller Number가 필요합니다.').optional(),
  
  // Social Login - Google
  GOOGLE_CLIENT_ID: z.string().min(1, 'Google Client ID가 필요합니다.').optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'Google Client Secret이 필요합니다.').optional(),
  
  // Social Login - Kakao
  KAKAO_REST_API_KEY: z.string().min(1, 'Kakao REST API Key가 필요합니다.').optional(),
  KAKAO_REDIRECT_URI: z.string().min(1, 'Kakao Redirect URI가 필요합니다.').optional(),
  
  // Social Login - Naver
  NAVER_CLIENT_ID: z.string().min(1, 'Naver Client ID가 필요합니다.').optional(),
  NAVER_CLIENT_SECRET: z.string().min(1, 'Naver Client Secret이 필요합니다.').optional(),
  NAVER_CALLBACK_URL: z.string().min(1, 'Naver Callback URL이 필요합니다.').optional(),
  
  // Social Login - Apple
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  
  // Google Services
  GOOGLE_SHEETS_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  
  // Geocoding
  NAVER_GEOCODING_CLIENT_ID: z.string().optional(),
  NAVER_GEOCODING_CLIENT_SECRET: z.string().optional(),
  
  // Application URLs
  NEXT_PUBLIC_BASE_URL: z.string().url('유효한 URL 형식이어야 합니다.').optional(),
  
  // Notion
  NOTION_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ 환경변수 검증 실패:');
    result.error.errors.forEach((error) => {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    });
    throw new Error('환경변수 설정이 올바르지 않습니다. 위 오류를 확인해주세요.');
  }
  
  return result.data;
}

export function getRequiredEnv(key: keyof Env): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`필수 환경변수가 설정되지 않았습니다: ${key}`);
  }
  return value;
}
