/**
 * GET /api/st/debug-env
 * 배포 서버 환경변수 진단용 — 확인 후 삭제 필요
 * 권한: admin만 호출 가능
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const authCtx = await getAuthenticatedUser(request);
  if (!authCtx || authCtx.user.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  const result: Record<string, unknown> = {
    hasEnv: !!raw,
    envLength: raw?.length ?? 0,
    envFirst20: raw?.slice(0, 20),
  };

  if (raw) {
    try {
      const credentials = JSON.parse(raw);
      result.parseOk = true;
      result.clientEmail = credentials.client_email;
      result.projectId = credentials.project_id;

      // 실제 Sheets API 접근 테스트 (J28)
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: '1J4UIpj9RZQoJizEcPsGxcFX-aKYJ0e0gq-bY8fzHPWE',
          range: 'ST!1:1',
        });
        result.sheetsReadOk = true;
        result.headerCols = res.data.values?.[0]?.length ?? 0;
      } catch (e) {
        result.sheetsReadOk = false;
        result.sheetsError = e instanceof Error ? e.message : String(e);
      }
    } catch (e) {
      result.parseOk = false;
      result.parseError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(result);
}
