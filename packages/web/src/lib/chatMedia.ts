/**
 * 채팅 사진·동영상 — 브라우저에서 줄이기 · 작은 그림 · 내려받기 (web 전용)
 *
 * - 사진(일반 화질): createImageBitmap 으로 열어 canvas 로 긴 변 CHAT_LIMITS.imageMaxPx · JPEG 0.82
 * - 사진(원본): 그대로. JPEG/PNG/WebP 가 아니면 크기는 그대로 두고 JPEG 로만 바꾼다
 * - 작은 그림: 긴 변 CHAT_LIMITS.thumbMaxPx · JPEG 0.7 (동영상은 첫 장면)
 * - 동영상: 웹에서는 변환하지 않고 그대로 올린다 (가로·세로·길이는 <video> 로 읽음)
 * - 내려받기: 주소를 blob 으로 받아 <a download> 로 저장, 여러 개면 zip (jszip)
 */
import { CHAT_LIMITS, chatFileExt, fitWithin } from '@smis-mentor/shared';

export type ChatPickKind = 'image' | 'video';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'avif'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', '3gp'];
const extOfName = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

/** 고른 파일이 사진인지 동영상인지 (형식을 모르면 확장자로) — 둘 다 아니면 null */
export function chatPickKindOf(file: File): ChatPickKind | null {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  const ext = extOfName(file.name);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return null;
}

/** 올릴 때 쓸 contentType — Storage 규칙이 image/* · video/* 만 받는다 */
export function chatContentTypeOf(file: File, kind: ChatPickKind): string {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith(`${kind}/`)) return t;
  const ext = extOfName(file.name);
  if (kind === 'video') return ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
}

export class ChatMediaError extends Error {
  constructor(public code: 'decode' | 'tooLarge' | 'encode') {
    super(code);
  }
}

interface Decoded {
  src: CanvasImageSource;
  w: number;
  h: number;
  close: () => void;
}

/** 사진 열기 — EXIF 회전을 반영한다. 못 여는 형식(크롬의 HEIC 등)이면 ChatMediaError('decode') */
async function decodeImage(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* 아래 <img> 로 한 번 더 */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ChatMediaError('decode');
  }
}

/** iOS Safari canvas 넓이 한도 (4096×4096) — 넘으면 그리지 못한다 */
const MAX_CANVAS_AREA = 16_777_216;

function drawToJpeg(d: Pick<Decoded, 'src' | 'w' | 'h'>, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  let { w, h } = fitWithin(d.w, d.h, maxSide);
  if (w * h > MAX_CANVAS_AREA) {
    const s = Math.sqrt(MAX_CANVAS_AREA / (w * h));
    w = Math.max(1, Math.floor(w * s));
    h = Math.max(1, Math.floor(h * s));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new ChatMediaError('encode'));
  // JPEG 에는 투명이 없다 — PNG 의 투명한 곳은 흰색으로
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(d.src, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      // 메모리 바로 돌려주기 (Safari 는 canvas 메모리를 늦게 푼다)
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve({ blob, w, h });
      else reject(new ChatMediaError('encode'));
    }, 'image/jpeg', quality);
  });
}

export interface ChatImageProbe {
  w: number;
  h: number;
  /** 작은 그림 (긴 변 480 · JPEG 0.7) */
  thumb: Blob;
}

/** 고를 때 — 열 수 있는지 보고 작은 그림을 만든다 (보내기 전 미리보기 · 올릴 작은 그림) */
export async function probeChatImage(file: Blob): Promise<ChatImageProbe> {
  const d = await decodeImage(file);
  try {
    const t = await drawToJpeg(d, CHAT_LIMITS.thumbMaxPx, CHAT_LIMITS.thumbQuality);
    return { w: d.w, h: d.h, thumb: t.blob };
  } finally {
    d.close();
  }
}

export interface PreparedChatMedia {
  kind: ChatPickKind;
  body: Blob;
  contentType: string;
  ext: string;
  thumb: Blob | null;
  w: number;
  h: number;
  durationMs?: number;
  original: boolean;
}

const KEEP_AS_IS = ['image/jpeg', 'image/png', 'image/webp'];

/** 보낼 때 — 사진을 화질에 맞게 만든다. 이미 만든 작은 그림이 있으면 다시 쓴다 */
export async function prepareChatImage(file: File, original: boolean, probe?: ChatImageProbe | null): Promise<PreparedChatMedia> {
  const type = chatContentTypeOf(file, 'image');
  const keep = KEEP_AS_IS.includes(type);
  if (original && keep) {
    if (file.size > CHAT_LIMITS.imageMaxBytes) throw new ChatMediaError('tooLarge');
    const p = probe ?? (await probeChatImage(file));
    return { kind: 'image', body: file, contentType: type, ext: chatFileExt(type, file.name), thumb: p.thumb, w: p.w, h: p.h, original: true };
  }
  const d = await decodeImage(file);
  try {
    const thumb = probe?.thumb ?? (await drawToJpeg(d, CHAT_LIMITS.thumbMaxPx, CHAT_LIMITS.thumbQuality)).blob;
    let body: Blob;
    let w: number;
    let h: number;
    if (original) {
      // 원본 — 크기는 그대로, 형식만 JPEG 로
      const r = await drawToJpeg(d, Number.POSITIVE_INFINITY, 0.92);
      body = r.blob; w = r.w; h = r.h;
    } else {
      const r = await drawToJpeg(d, CHAT_LIMITS.imageMaxPx, CHAT_LIMITS.jpegQuality);
      // 이미 작은 JPEG 은 다시 압축한 쪽이 더 크면 원래 파일을 쓴다
      if (type === 'image/jpeg' && r.w === d.w && r.h === d.h && file.size <= r.blob.size) {
        body = file; w = d.w; h = d.h;
      } else {
        body = r.blob; w = r.w; h = r.h;
      }
    }
    if (body.size > CHAT_LIMITS.imageMaxBytes) throw new ChatMediaError('tooLarge');
    return { kind: 'image', body, contentType: 'image/jpeg', ext: 'jpg', thumb, w, h, original };
  } finally {
    d.close();
  }
}

function waitFor(el: HTMLMediaElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
      if (ok) resolve();
      else reject(new Error(`video ${event}`));
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    el.addEventListener(event, onOk);
    el.addEventListener('error', onErr);
  });
}

export interface ChatVideoProbe {
  w: number;
  h: number;
  durationMs: number;
  /** 첫 장면 (긴 변 480 · JPEG 0.7) — 브라우저가 못 여는 코덱이면 null */
  thumb: Blob | null;
}

/** 동영상 가로·세로·길이 + 첫 장면. 못 읽어도 오류 없이 0 · null 을 돌려준다 (그래도 보낼 수 있게) */
export async function probeChatVideo(file: Blob): Promise<ChatVideoProbe> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const out: ChatVideoProbe = { w: 0, h: 0, durationMs: 0, thumb: null };
  try {
    await waitFor(v, 'loadedmetadata', 10_000);
    out.w = v.videoWidth;
    out.h = v.videoHeight;
    out.durationMs = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0;
    try {
      // 0초는 검은 화면인 경우가 많아 조금 뒤 장면
      const at = Math.min(0.1, (Number.isFinite(v.duration) ? v.duration : 0) / 2);
      if (at > 0) {
        v.currentTime = at;
        await waitFor(v, 'seeked', 5_000);
      }
      if (v.readyState < 2) {
        // iOS 는 재생해야 장면을 불러온다 (소리 없는 재생은 허용)
        await v.play().catch(() => undefined);
        v.pause();
        if (v.readyState < 2) await waitFor(v, 'loadeddata', 3_000);
      }
      if (out.w && out.h) out.thumb = (await drawToJpeg({ src: v, w: out.w, h: out.h }, CHAT_LIMITS.thumbMaxPx, CHAT_LIMITS.thumbQuality)).blob;
    } catch {
      out.thumb = null;
    }
  } catch {
    /* 메타데이터도 못 읽는 코덱 — 그대로 보낸다 */
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
  return out;
}

/** 보낼 때 — 동영상은 그대로 (크기만 확인) */
export async function prepareChatVideo(file: File, original: boolean, probe?: ChatVideoProbe | null): Promise<PreparedChatMedia> {
  if (file.size > CHAT_LIMITS.videoMaxBytes) throw new ChatMediaError('tooLarge');
  const p = probe ?? (await probeChatVideo(file));
  const contentType = chatContentTypeOf(file, 'video');
  return {
    kind: 'video',
    body: file,
    contentType,
    ext: chatFileExt(contentType, file.name),
    thumb: p.thumb,
    w: p.w,
    h: p.h,
    durationMs: p.durationMs || undefined,
    original,
  };
}

// ── 내려받기 ─────────────────────────────────────────────────────────

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** 파일 한 개 저장 — 받지 못하면 새 탭으로 연다 (false) */
export async function downloadChatFile(url: string, name: string): Promise<boolean> {
  try {
    saveBlob(await fetchBlob(url), name);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

/** 여러 개를 zip 하나로 저장 — 저장한 개수 (하나도 못 받으면 오류) */
export async function downloadChatZip(files: Array<{ url: string; name: string }>, zipName: string): Promise<number> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let saved = 0;
  // 한꺼번에 너무 많이 받지 않게 3개씩
  for (let i = 0; i < files.length; i += 3) {
    await Promise.all(files.slice(i, i + 3).map(async (f) => {
      try {
        zip.file(f.name, await fetchBlob(f.url));
        saved += 1;
      } catch {
        /* 못 받은 파일은 빼고 */
      }
    }));
  }
  if (!saved) throw new Error('nothing downloaded');
  // 사진·동영상은 이미 압축돼 있어 다시 압축하지 않는다 (빠르게)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  saveBlob(blob, zipName);
  return saved;
}
