import { NextRequest, NextResponse } from 'next/server';
import { google, type drive_v3 } from 'googleapis';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { getAdminFirestore } from '@/lib/firebase-admin';
import {
  DRIVE_FOLDER_MIME,
  driveFolderIdFromUrl,
  driveFolderUrl,
  logger,
  type DriveItem,
  type LessonPlanDriveRoot,
  type LessonPlanDriveSetting,
} from '@smis-mentor/shared';

/**
 * 관리자: 원어민 레슨플랜 구글 드라이브 (캠프 폴더 / 원어민 폴더 / 파일)
 *
 * GET  ?campCode=J28                 → 캠프 폴더와 그 아래 폴더·파일 (원어민 폴더 찾기용)
 * GET  ?campCode=J28&folderId=…      → 그 폴더 안 (캠프 폴더 아래 폴더만 — 서비스 계정이 읽을 수 있는 다른 폴더는 막는다)
 * POST { campCode, folderUrl }       → 캠프 폴더 연결 (읽을 수 있는지 확인 후 저장, 원어민 고정은 초기화)
 * POST { campCode, folderUrl: null } → 연결 끊기
 * POST { campCode, userId, folderId } → 이 원어민 폴더 고정 (folderId: null 이면 고정 해제 → 이름으로 찾기)
 *
 * 드라이브는 시트 동기화와 같은 서비스 계정(GOOGLE_SHEETS_SERVICE_ACCOUNT)으로 읽기만 한다.
 */
export const dynamic = 'force-dynamic';

const SETTINGS = 'campSettings';

function serviceAccount(): { drive: drive_v3.Drive; email: string } {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return { drive: google.drive({ version: 'v3', auth }), email: String(credentials.client_email ?? '') };
}

const toItem = (f: drive_v3.Schema$File): DriveItem => {
  const isFolder = f.mimeType === DRIVE_FOLDER_MIME;
  return {
    id: String(f.id),
    name: String(f.name ?? '').trim(),
    mimeType: String(f.mimeType ?? ''),
    isFolder,
    url: f.webViewLink ?? (isFolder ? driveFolderUrl(String(f.id)) : `https://drive.google.com/file/d/${f.id}/view`),
    ...(f.modifiedTime ? { modifiedTime: f.modifiedTime } : {}),
    ...(f.iconLink ? { iconUrl: f.iconLink } : {}),
  };
};

async function listChildren(drive: drive_v3.Drive, folderId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,iconLink)',
      orderBy: 'folder,name_natural',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    (r.data.files ?? []).forEach((f) => out.push(toItem(f)));
    pageToken = r.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return out;
}

const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * 이 폴더가 캠프 폴더 아래(최대 4단계)에 있는지.
 * 서비스 계정은 files.get 으로 parents 를 못 받으므로, 캠프 폴더에서 아래로 폴더만 훑는다 (단계마다 한두 번 조회).
 */
async function isUnder(drive: drive_v3.Drive, id: string, rootId: string): Promise<boolean> {
  if (!DRIVE_ID.test(id) || id === rootId) return false;
  let frontier = [rootId];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += 20) {
      const q = `(${frontier
        .slice(i, i + 20)
        .map((p) => `'${p}' in parents`)
        .join(' or ')}) and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`;
      let pageToken: string | undefined;
      do {
        const r = await drive.files.list({ q, fields: 'nextPageToken, files(id)', pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
        for (const f of r.data.files ?? []) {
          if (f.id === id) return true;
          if (f.id) next.push(f.id);
        }
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
    frontier = next;
  }
  return false;
}

const noAccess = (e: unknown) => {
  const code = (e as { code?: number })?.code;
  return code === 403 || code === 404;
};

async function settingOf(campCode: string): Promise<LessonPlanDriveSetting | null> {
  const snap = await getAdminFirestore().collection(SETTINGS).doc(campCode).get();
  const v = snap.exists ? (snap.data()?.lessonPlanDrive as LessonPlanDriveSetting | undefined) : undefined;
  return v?.folderId ? v : null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const campCode = searchParams.get('campCode')?.trim();
  const folderId = searchParams.get('folderId')?.trim();
  if (!campCode) return NextResponse.json({ error: 'campCode 가 필요합니다.' }, { status: 400 });

  let sa: ReturnType<typeof serviceAccount>;
  try {
    sa = serviceAccount();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const setting = await settingOf(campCode);
  if (!setting) return NextResponse.json({ configured: false, serviceAccount: sa.email } satisfies LessonPlanDriveRoot);

  try {
    if (folderId) {
      if (!(await isUnder(sa.drive, folderId, setting.folderId))) {
        return NextResponse.json({ error: '캠프 레슨플랜 폴더 아래 폴더만 볼 수 있습니다.' }, { status: 403 });
      }
      return NextResponse.json({ items: await listChildren(sa.drive, folderId) });
    }
    const [meta, kids] = await Promise.all([
      sa.drive.files.get({ fileId: setting.folderId, fields: 'id,name,webViewLink', supportsAllDrives: true }),
      listChildren(sa.drive, setting.folderId),
    ]);
    const body: LessonPlanDriveRoot = {
      configured: true,
      root: { id: setting.folderId, name: String(meta.data.name ?? ''), url: meta.data.webViewLink ?? driveFolderUrl(setting.folderId) },
      folders: kids.filter((k) => k.isFolder),
      files: kids.filter((k) => !k.isFolder),
      teachers: setting.teachers ?? {},
      serviceAccount: sa.email,
    };
    return NextResponse.json(body);
  } catch (e) {
    if (noAccess(e)) {
      return NextResponse.json({
        configured: true,
        root: { id: setting.folderId, name: '', url: setting.url || driveFolderUrl(setting.folderId) },
        teachers: setting.teachers ?? {},
        serviceAccount: sa.email,
        error: 'no-access',
      } satisfies LessonPlanDriveRoot);
    }
    logger.error('lesson-plan-drive GET', e);
    return NextResponse.json({ error: '드라이브를 읽지 못했습니다.' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    campCode?: string;
    folderUrl?: string | null;
    userId?: string;
    folderId?: string | null;
  } | null;
  const campCode = body?.campCode?.trim();
  if (!campCode || !/^[A-Za-z0-9_-]{2,20}$/.test(campCode)) return NextResponse.json({ error: 'campCode 가 필요합니다.' }, { status: 400 });
  const ref = getAdminFirestore().collection(SETTINGS).doc(campCode);
  const by = auth!.firebaseUid;
  const now = new Date().toISOString();

  let sa: ReturnType<typeof serviceAccount>;
  try {
    sa = serviceAccount();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  try {
    // 원어민 폴더 고정 / 해제
    if (body?.userId) {
      const setting = await settingOf(campCode);
      if (!setting) return NextResponse.json({ error: '먼저 캠프 레슨플랜 폴더를 연결하세요.' }, { status: 400 });
      const userId = body.userId.trim();
      if (body.folderId) {
        if (!(await isUnder(sa.drive, body.folderId, setting.folderId))) {
          return NextResponse.json({ error: '캠프 레슨플랜 폴더 아래 폴더만 고를 수 있습니다.' }, { status: 400 });
        }
        await ref.update(new FieldPath('lessonPlanDrive', 'teachers', userId), body.folderId, new FieldPath('lessonPlanDrive', 'updatedAt'), now, new FieldPath('lessonPlanDrive', 'updatedBy'), by);
      } else {
        await ref.update(new FieldPath('lessonPlanDrive', 'teachers', userId), FieldValue.delete());
      }
      return NextResponse.json({ ok: true });
    }

    // 캠프 폴더 연결 끊기
    if (body?.folderUrl === null || body?.folderUrl === '') {
      await ref.set({ campCode }, { merge: true });
      await ref.update({ lessonPlanDrive: FieldValue.delete() });
      return NextResponse.json({ ok: true });
    }

    // 캠프 폴더 연결 — 읽을 수 있는지 먼저 본다
    const folderId = driveFolderIdFromUrl(body?.folderUrl);
    if (!folderId) return NextResponse.json({ error: '구글 드라이브 폴더 링크가 아닙니다.' }, { status: 400 });
    let name = '';
    try {
      const meta = await sa.drive.files.get({ fileId: folderId, fields: 'id,name,mimeType', supportsAllDrives: true });
      if (meta.data.mimeType !== DRIVE_FOLDER_MIME) return NextResponse.json({ error: '폴더 링크가 아닙니다 (파일 링크).' }, { status: 400 });
      name = String(meta.data.name ?? '');
    } catch (e) {
      if (noAccess(e)) {
        return NextResponse.json(
          { error: `이 폴더를 읽을 수 없습니다. 드라이브에서 폴더를 ${sa.email} 와 '뷰어'로 공유한 뒤 다시 연결하세요.`, serviceAccount: sa.email },
          { status: 400 }
        );
      }
      throw e;
    }
    const setting: LessonPlanDriveSetting = { folderId, url: String(body?.folderUrl ?? '').trim(), updatedAt: now, updatedBy: by };
    await ref.set({ campCode }, { merge: true });
    await ref.update({ lessonPlanDrive: setting });
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    logger.error('lesson-plan-drive POST', e);
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}
