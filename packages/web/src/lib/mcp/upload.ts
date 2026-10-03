/**
 * upload_media — 칸 설명·교육 탭 페이지에 넣을 사진·동영상을 사이트 저장소(Storage)에 올린다 (관리자)
 *
 * - 받는 방법: sourceUrl(서버가 내려받음 — 노션 첨부 임시 주소, 구글 드라이브 공개 링크, 캔바 내보내기 주소 등) 또는 base64(작은 파일).
 * - 올리기만 하고 어떤 문서에도 연결하지 않는다 → 화면은 그대로다. 연결은 write_documents(dry-run → 승인 → confirm) 로.
 *   그래서 이 도구 자체는 확인 단계 없이 바로 올린다 (지우거나 덮어쓰는 일이 없고, 감사 로그에 남긴다).
 * - 앱(uploadGuideMedia)과 같은 경로(timetableGuides/{캠프}/{칸}/…)와 같은 형식의 주소(getDownloadURL 의 토큰 주소)를 만든다.
 * - 서버가 남의 주소를 대신 여는 기능이라 https 만, 내부망 주소·과한 리디렉트·용량·파일 종류(실제 바이트로 판별)를 막는다.
 *   SVG·HTML 처럼 스크립트가 들어갈 수 있는 형식은 받지 않는다.
 */
import { createHash, randomUUID } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Timestamp } from 'firebase-admin/firestore';
import { guideKeyOf, guideMediaPath } from '@smis-mentor/shared';
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase-admin';
import { canAccess, type Viewer } from '@/lib/ai-content/site';
import { DataToolError } from './data-tools';

export const UPLOAD_LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  /** 요청 본문 한도(Vercel 4.5MB) 안에 들어가는 크기 */
  base64Bytes: 3 * 1024 * 1024,
  timeoutMs: 25_000,
  maxRedirects: 5,
};

export interface UploadInput {
  campCode: string;
  target?: 'timetableGuide' | 'campPage';
  guideKey?: string;
  sourceUrl?: string;
  base64?: string;
  fileName?: string;
}

export interface SniffedMedia {
  mime: string;
  ext: string;
  kind: 'image' | 'video';
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

/** 실제 바이트로 파일 종류 판별 — 서버가 알려 준 content-type 은 믿지 않는다 */
export function sniffMedia(b: Uint8Array): SniffedMedia | null {
  const ascii = (s: number, e: number) => String.fromCharCode(...b.subarray(s, e));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return { mime: 'image/heic', ext: 'heic', kind: 'image' };
    if (['mif1', 'msf1', 'heif'].includes(brand)) return { mime: 'image/heif', ext: 'heif', kind: 'image' };
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif', kind: 'image' };
    if (['M4A ', 'M4B ', 'M4P ', 'f4a ', 'f4b '].includes(brand)) return null; // 소리 파일
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov', kind: 'video' };
    if (brand.startsWith('M4V')) return { mime: 'video/x-m4v', ext: 'm4v', kind: 'video' };
    if (brand.startsWith('3gp')) return { mime: 'video/3gpp', ext: '3gp', kind: 'video' };
    return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  return null;
}

/** 내부망·특수 주소인가 (서버가 대신 열면 안 되는 곳) */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(v) !== 6) return true;
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) {
    const rest = v.slice(7);
    return isIP(rest) === 4 ? isPrivateAddress(rest) : true;
  }
  return /^(fc|fd|fe[89ab])/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8:');
}

/** 공유 링크 → 파일을 바로 받는 주소 (구글 드라이브·드롭박스) */
export function normalizeSourceUrl(raw: string): string {
  const u = new URL(raw);
  if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
    if (id && !u.pathname.startsWith('/uc')) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
    u.searchParams.set('dl', '1');
    return u.toString();
  }
  return u.toString();
}

async function assertSafeUrl(u: URL) {
  if (u.protocol !== 'https:') throw new DataToolError('https 주소만 받을 수 있습니다.');
  if (u.username || u.password) throw new DataToolError('아이디·비밀번호가 들어간 주소는 받을 수 없습니다.');
  if (u.port && u.port !== '443') throw new DataToolError('기본 포트(443)가 아닌 주소는 받을 수 없습니다.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) throw new DataToolError('내부망 주소는 받을 수 없습니다.');
  let addrs: string[];
  if (isIP(host)) addrs = [host];
  else {
    try {
      addrs = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new DataToolError(`주소를 찾을 수 없습니다: ${host}`);
    }
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new DataToolError('내부망 주소는 받을 수 없습니다.');
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new DataToolError(`파일이 너무 큽니다 (${mb(max)} 초과)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 주소에서 파일 받기 — 리디렉트는 한 번씩 직접 따라가며 매번 주소를 검사한다 */
async function fetchSource(raw: string): Promise<{ bytes: Buffer; finalUrl: URL; headerType: string }> {
  let url: URL;
  try {
    url = new URL(normalizeSourceUrl(raw));
  } catch {
    throw new DataToolError('sourceUrl 이 올바른 주소가 아닙니다.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_LIMITS.timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      await assertSafeUrl(url);
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMIS-Mentor-MCP/1.0)', Accept: 'image/*,video/*;q=0.9,*/*;q=0.5' },
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        if (hop >= UPLOAD_LIMITS.maxRedirects) throw new DataToolError('리디렉트가 너무 많습니다.');
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DataToolError(
          res.status === 401 || res.status === 403
            ? `주소를 열 수 없습니다 (HTTP ${res.status}) — 로그인 없이 열리는 공개 링크인지, 노션 첨부 주소라면 1시간이 지나 만료되지 않았는지 확인하세요.`
            : `내려받지 못했습니다 (HTTP ${res.status}).`
        );
      }
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > UPLOAD_LIMITS.videoBytes) {
        await res.body?.cancel().catch(() => undefined);
        throw new DataToolError(`파일이 너무 큽니다 (${mb(len)}, 최대 ${mb(UPLOAD_LIMITS.videoBytes)})`);
      }
      return { bytes: await readCapped(res, UPLOAD_LIMITS.videoBytes), finalUrl: url, headerType: res.headers.get('content-type') ?? '' };
    }
  } catch (e) {
    if (e instanceof DataToolError) throw e;
    if ((e as Error).name === 'AbortError') throw new DataToolError(`시간이 초과됐습니다 (${UPLOAD_LIMITS.timeoutMs / 1000}초).`);
    throw new DataToolError(`내려받지 못했습니다: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64(raw: string): Buffer {
  const b64 = raw.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new DataToolError('base64 형식이 아닙니다.');
  if (Math.floor((b64.length * 3) / 4) > UPLOAD_LIMITS.base64Bytes + 4) {
    throw new DataToolError(`base64 는 ${mb(UPLOAD_LIMITS.base64Bytes)} 까지입니다 — 큰 파일은 공개 링크(sourceUrl)로 주세요.`);
  }
  return Buffer.from(b64, 'base64');
}

/** 파일 이름 — 준 이름 > 주소의 마지막 조각 > image. 확장자는 실제 종류에 맞춘다 */
function fileNameOf(given: string | undefined, fromUrl: string, type: SniffedMedia): string {
  const base = (given || fromUrl || type.kind)
    .replace(/\.[^./]{1,5}$/, '')
    .replace(/[^\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `${base || type.kind}.${type.ext}`;
}

export async function uploadMedia(input: UploadInput, viewer: Viewer) {
  if (!canAccess('admin', viewer)) throw new DataToolError('upload_media 는 관리자 계정만 사용할 수 있습니다.');
  const campCode = (input.campCode ?? '').trim();
  if (!campCode || campCode.includes('/')) throw new DataToolError('campCode 가 올바르지 않습니다.');
  if (!!input.sourceUrl === !!input.base64) throw new DataToolError('sourceUrl 과 base64 중 하나만 주세요.');
  const target = input.target ?? 'timetableGuide';

  const db = getAdminFirestore();
  const camp = await db.collection('jobCodes').where('code', '==', campCode).limit(1).get();
  if (camp.empty) throw new DataToolError(`캠프 코드 "${campCode}" 가 없습니다.`);

  let bytes: Buffer;
  let source: string;
  let urlName = '';
  let headerType = '';
  if (input.sourceUrl) {
    const got = await fetchSource(input.sourceUrl);
    bytes = got.bytes;
    headerType = got.headerType;
    source = got.finalUrl.hostname;
    try {
      // 저장소 주소는 경로가 %2F 로 한 조각에 들어 있다 → 풀고 나서 마지막 조각, 앞의 타임스탬프는 뺀다
      urlName = (decodeURIComponent(got.finalUrl.pathname).split('/').pop() ?? '').replace(/^\d{10,}_/, '');
    } catch {
      urlName = '';
    }
  } else {
    bytes = decodeBase64(input.base64 as string);
    source = 'base64';
  }
  if (!bytes.length) throw new DataToolError('빈 파일입니다.');

  const type = sniffMedia(bytes);
  if (!type) {
    const hint = headerType.includes('text/html') ? ' — 파일 대신 웹페이지가 왔습니다. 로그인 없이 열리는 공개 링크인지 확인하세요.' : '';
    throw new DataToolError(`사진(JPG·PNG·GIF·WEBP·HEIC·AVIF)이나 동영상(MP4·MOV·WEBM)이 아닙니다${hint}`);
  }
  if (type.kind === 'image' && bytes.length > UPLOAD_LIMITS.imageBytes) throw new DataToolError(`사진이 너무 큽니다 (${mb(bytes.length)}, 최대 ${mb(UPLOAD_LIMITS.imageBytes)})`);

  const fileName = fileNameOf(input.fileName, urlName, type);
  const guideKey = guideKeyOf(input.guideKey);
  const storagePath =
    target === 'timetableGuide' ? guideMediaPath(campCode, guideKey, fileName) : `camp-page-images/${Date.now()}_${randomUUID().slice(0, 6)}.${type.ext}`;

  const token = randomUUID();
  const bucket = getAdminStorage();
  await bucket.file(storagePath).save(bytes, {
    resumable: false,
    metadata: {
      contentType: type.mime,
      cacheControl: 'public, max-age=31536000',
      metadata: { firebaseStorageDownloadTokens: token, uploadedBy: viewer.uid, uploadedVia: 'mcp' },
    },
  });
  // 앱의 getDownloadURL 과 같은 형식 (저장소 규칙과 상관없이 토큰으로 열린다)
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  const sha256 = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

  await db
    .collection('mcpAuditLogs')
    .add({
      uid: viewer.uid,
      name: viewer.name,
      role: viewer.role,
      note: `upload_media (${target}${guideKey ? ` · ${guideKey}` : ''})`,
      operations: [{ op: 'upload', collection: 'storage', id: storagePath, summary: `${type.mime} ${Math.round(bytes.length / 1024)}KB · ${source}` }],
      at: Timestamp.now(),
    })
    .catch(() => undefined);

  const warnings: string[] = [];
  if (type.mime === 'image/heic' || type.mime === 'image/heif') warnings.push('HEIC 사진은 웹(크롬 등)에서 안 보일 수 있습니다 — 가능하면 JPG·PNG 로 올리세요.');
  if (target === 'timetableGuide' && !guideKey) warnings.push('guideKey 가 없어 etc 폴더에 저장했습니다 (동작에는 문제 없음).');

  return {
    ok: true,
    url,
    storagePath,
    contentType: type.mime,
    kind: type.kind,
    bytes: bytes.length,
    sha256,
    source,
    ...(target === 'timetableGuide'
      ? {
          guideItem: { type: type.kind, url, storagePath, text: '' },
          next: `칸 설명에 넣으려면 write_documents(update campSettings/${campCode}, data: { timetableGuides: { "${guideKey || '칸 이름'}": { …, sections: [{ title, items: [ …, guideItem(캡션은 text) ] }] } } }) 를 dry-run → 승인 → confirm 하세요. 올리기만 해서는 화면이 바뀌지 않습니다.`,
        }
      : { next: `교육 탭 페이지에 넣으려면 campPages 의 content HTML 에 <img src="${url}"> 를 넣고 write_documents 로 dry-run → 승인 → confirm 하세요.` }),
    ...(warnings.length ? { warnings } : {}),
  };
}
