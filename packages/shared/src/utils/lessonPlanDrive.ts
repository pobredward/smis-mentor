/**
 * 원어민 레슨플랜 — 캠프별 구글 드라이브 폴더 연동.
 *
 * 드라이브 구조 (예: J28): 캠프 폴더 / "01) Keith", "02) Adam" … 원어민마다 하위 폴더 / 레슨플랜 파일들.
 * 캠프 폴더는 campSettings/{campCode}.lessonPlanDrive 에 한 번 연결하고,
 * 원어민 폴더는 이름으로 자동으로 찾는다 (못 찾거나 틀리면 관리자가 골라 teachers[userId] 에 고정).
 * 드라이브 읽기는 서버(/api/admin/lesson-plan-drive)가 서비스 계정으로 한다 — 캠프 폴더 아래만.
 */

export interface LessonPlanDriveSetting {
  /** 캠프 레슨플랜 폴더 id */
  folderId: string;
  /** 붙여 넣은 원래 링크 */
  url?: string;
  /** userId → 그 원어민 폴더 id (이름으로 못 찾을 때 관리자가 고른 것) */
  teachers?: Record<string, string>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  /** 드라이브에서 열기 */
  url: string;
  modifiedTime?: string;
  iconUrl?: string;
}

/** 캠프 폴더 + 그 아래 폴더들 */
export interface LessonPlanDriveRoot {
  configured: boolean;
  root?: { id: string; name: string; url: string };
  folders?: DriveItem[];
  /** 캠프 폴더 바로 아래 파일 (공용 자료) */
  files?: DriveItem[];
  teachers?: Record<string, string>;
  /** 서비스 계정이 폴더를 못 읽을 때 — 이 주소에 '보기' 공유를 하면 된다 */
  serviceAccount?: string;
  error?: string;
}

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export const driveFolderUrl = (id: string): string => `https://drive.google.com/drive/folders/${id}`;

/** 붙여 넣은 링크·id → 폴더 id (모르면 null) */
export function driveFolderIdFromUrl(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** "01) Jenna ★" → "jenna" — 앞 번호·별표·괄호 설명을 걷고 소문자로 */
export function driveFolderNameKey(name: string | null | undefined): string {
  return (name ?? '')
    .replace(/^\s*\d+\s*[).:_-]\s*/, '')
    .replace(/[★☆*]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const keysOf = (s: string | null | undefined): string[] => {
  const full = (s ?? '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!full) return [];
  const first = full.split(' ')[0];
  return [...new Set([full, first])];
};

/**
 * 원어민 폴더 찾기 — 고정해 둔 폴더 → 이름이 같은 폴더 → 이름(첫 단어)이 같은 폴더.
 * 같은 이름이 둘 이상이면 고르지 않는다 (관리자가 고르게).
 */
export function matchTeacherDriveFolder(
  folders: DriveItem[],
  teacher: { userId?: string; name?: string; englishName?: string },
  pinned?: Record<string, string>
): { folder: DriveItem | null; how: 'pinned' | 'name' | null } {
  const pin = teacher.userId ? pinned?.[teacher.userId] : undefined;
  if (pin) {
    const f = folders.find((x) => x.id === pin);
    if (f) return { folder: f, how: 'pinned' };
  }
  const wants = [...keysOf(teacher.englishName), ...keysOf(teacher.name)];
  for (const w of wants) {
    const hits = folders.filter((f) => f.isFolder && driveFolderNameKey(f.name) === w);
    if (hits.length === 1) return { folder: hits[0], how: 'name' };
    if (hits.length > 1) return { folder: null, how: null };
  }
  for (const w of wants) {
    const hits = folders.filter((f) => f.isFolder && driveFolderNameKey(f.name).split(' ')[0] === w);
    if (hits.length === 1) return { folder: hits[0], how: 'name' };
  }
  return { folder: null, how: null };
}

/** 파일 종류 짧은 이름 (목록 배지) */
export function driveKindLabel(mimeType: string, name = ''): string {
  if (mimeType === DRIVE_FOLDER_MIME) return '폴더';
  if (/document|msword|wordprocessingml/.test(mimeType) || /\.docx?$/i.test(name)) return '문서';
  if (/presentation|powerpoint/.test(mimeType) || /\.pptx?$/i.test(name)) return '슬라이드';
  if (/spreadsheet|excel/.test(mimeType) || /\.xlsx?$/i.test(name)) return '시트';
  if (/pdf/.test(mimeType)) return 'PDF';
  if (/^image\//.test(mimeType)) return '이미지';
  if (/^video\//.test(mimeType)) return '동영상';
  return '파일';
}
