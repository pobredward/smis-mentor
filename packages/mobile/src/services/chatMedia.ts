/**
 * 채팅 사진·동영상 — 고르기 · 보낼 파일 만들기(줄이기 · 작은 그림) · 올리기 · 사진 보관함에 저장
 *
 * 일반 화질: 사진은 긴 변 CHAT_LIMITS.imageMaxPx 로 줄여 JPEG 0.82 (위치 정보 같은 EXIF 도 빠진다),
 *           동영상은 iOS 에서 고를 때 720p 로 내보낸다 (Android 는 고른 그대로).
 * 원본: 사진은 그대로 (JPEG/PNG/WebP 가 아니면 크기 그대로 JPEG 로), 동영상도 그대로.
 * 모든 사진·동영상에 작은 그림(긴 변 480, JPEG 0.7) — 동영상은 첫 장면.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Directory, File, Paths } from 'expo-file-system';
import {
  CHAT_LIMITS,
  chatDownloadName,
  chatFileExt,
  chatMediaPath,
  logger,
  uploadChatFile,
  type ChatMediaItem,
} from '@smis-mentor/shared';
import { storage } from '../config/firebase';

/** 보내기 전 미리보기 줄의 한 칸 */
export interface ChatPickedAsset {
  key: string;
  kind: 'image' | 'video';
  uri: string;
  /** 미리보기 그림 (사진은 uri, 동영상은 첫 장면) */
  previewUri?: string;
  width: number;
  height: number;
  durationMs?: number;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  /** iOS 동영상을 원본(Passthrough)으로 내보냈는가 — 일반으로 골랐으면 이미 720p */
  exportedOriginal: boolean;
}

/** 올릴 준비가 끝난 파일 */
export interface ChatPreparedFile {
  kind: 'image' | 'video';
  uri: string;
  contentType: string;
  ext: string;
  width: number;
  height: number;
  durationMs?: number;
  original: boolean;
  thumbUri?: string;
}

export class ChatMediaError extends Error {
  constructor(public code: 'permission' | 'too-large' | 'failed', message: string) {
    super(message);
  }
}

const MB = 1024 * 1024;
export const IMAGE_MAX_MB = Math.round(CHAT_LIMITS.imageMaxBytes / MB);
export const VIDEO_MAX_MB = Math.round(CHAT_LIMITS.videoMaxBytes / MB);

let keySeq = 0;
const nextKey = () => `p${Date.now().toString(36)}_${(keySeq += 1)}`;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', webm: 'video/webm',
};

function extOf(name?: string | null): string {
  const m = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(String(name ?? ''));
  return m ? m[1].toLowerCase() : '';
}

function mimeOf(asset: Pick<ChatPickedAsset, 'mimeType' | 'fileName' | 'uri' | 'kind'>): string {
  const given = String(asset.mimeType ?? '').toLowerCase();
  if (given.includes('/')) return given;
  const byExt = EXT_MIME[extOf(asset.fileName) || extOf(asset.uri)];
  if (byExt) return byExt;
  return asset.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

// ── 고르기 ──────────────────────────────────────────────────────────

async function previewOf(kind: 'image' | 'video', uri: string): Promise<string | undefined> {
  if (kind === 'image') return uri;
  try {
    const t = await VideoThumbnails.getThumbnailAsync(uri, { time: 100, quality: 0.6 });
    return t.uri;
  } catch (e) {
    logger.warn('동영상 미리보기 실패:', e);
    return undefined;
  }
}

async function toPicked(assets: ImagePicker.ImagePickerAsset[], exportedOriginal: boolean): Promise<ChatPickedAsset[]> {
  const out: ChatPickedAsset[] = [];
  for (const a of assets) {
    const kind: 'image' | 'video' = a.type === 'video' ? 'video' : 'image';
    out.push({
      key: nextKey(),
      kind,
      uri: a.uri,
      previewUri: await previewOf(kind, a.uri),
      width: a.width || 0,
      height: a.height || 0,
      durationMs: kind === 'video' && a.duration ? Math.round(a.duration) : undefined,
      mimeType: a.mimeType ?? undefined,
      fileName: a.fileName ?? undefined,
      fileSize: a.fileSize ?? undefined,
      // Android 는 고른 그대로 올린다 — iOS 동영상만 고를 때의 내보내기 화질을 기억한다
      exportedOriginal: Platform.OS !== 'ios' || kind !== 'video' || exportedOriginal,
    });
  }
  return out;
}

/** 사진·동영상 고르기 (여러 개) — original: 지금 '원본으로 보내기'가 켜져 있는가 (iOS 동영상 내보내기 화질) */
export async function pickChatMediaFromLibrary(opts: { original: boolean; limit: number }): Promise<ChatPickedAsset[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, opts.limit),
    orderedSelection: true,
    quality: 1,
    // iOS: HEIC 사진을 JPEG 로 받는다
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    // iOS: 일반 화질 동영상은 720p 로 내보낸다 (Android 에서는 무시됨)
    videoExportPreset: opts.original ? ImagePicker.VideoExportPreset.Passthrough : ImagePicker.VideoExportPreset.H264_1280x720,
    shouldDownloadFromNetwork: true,
  });
  if (res.canceled) return [];
  return toPicked(res.assets ?? [], opts.original);
}

/** 카메라로 찍기 (사진·동영상) */
export async function captureChatMedia(opts: { original: boolean }): Promise<ChatPickedAsset[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new ChatMediaError('permission', 'camera');
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    videoExportPreset: opts.original ? ImagePicker.VideoExportPreset.Passthrough : ImagePicker.VideoExportPreset.H264_1280x720,
  });
  if (res.canceled) return [];
  return toPicked(res.assets ?? [], opts.original);
}

/** 고른 것 중 너무 큰 것 — 동영상은 늘 (어떻게 보내도 크기가 그대로), 사진은 원본으로 보낼 때만 */
export function oversizedOf(asset: ChatPickedAsset, original: boolean): 'image' | 'video' | null {
  const size = asset.fileSize ?? 0;
  if (!size) return null;
  if (asset.kind === 'video') return size > CHAT_LIMITS.videoMaxBytes ? 'video' : null;
  return original && size > CHAT_LIMITS.imageMaxBytes ? 'image' : null;
}

// ── 보낼 파일 만들기 ─────────────────────────────────────────────────

const release = (r: { release?: () => void } | null | undefined) => {
  try {
    r?.release?.();
  } catch {
    // 이미 풀린 경우
  }
};

/** 파일을 그림으로 읽기 */
async function decode(uri: string): Promise<ImageRef> {
  const ctx = ImageManipulator.manipulate(uri);
  try {
    return await ctx.renderAsync();
  } finally {
    release(ctx);
  }
}

/** 긴 변이 max 를 넘으면 줄인 새 그림 — 넘지 않으면 null (원래 그림을 그대로 쓴다) */
async function fitRef(ref: ImageRef, max: number): Promise<ImageRef | null> {
  if (Math.max(ref.width, ref.height) <= max) return null;
  const ctx = ImageManipulator.manipulate(ref);
  try {
    ctx.resize(ref.width >= ref.height ? { width: max } : { height: max });
    return await ctx.renderAsync();
  } finally {
    release(ctx);
  }
}

/** 작은 그림 (긴 변 480, JPEG 0.7) — 실패해도 메시지는 보낸다 */
async function makeThumb(ref: ImageRef): Promise<string | undefined> {
  try {
    const small = await fitRef(ref, CHAT_LIMITS.thumbMaxPx);
    try {
      return (await (small ?? ref).saveAsync({ compress: CHAT_LIMITS.thumbQuality, format: SaveFormat.JPEG })).uri;
    } finally {
      release(small);
    }
  } catch (e) {
    logger.warn('작은 그림 만들기 실패:', e);
    return undefined;
  }
}

const KEEP_ORIGINAL_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

/** 올릴 파일 · 작은 그림 만들기 */
export async function prepareChatMedia(asset: ChatPickedAsset, original: boolean): Promise<ChatPreparedFile> {
  if (asset.kind === 'video') {
    const contentType = mimeOf(asset);
    let width = asset.width;
    let height = asset.height;
    let thumbUri: string | undefined;
    try {
      const frame = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 100, quality: 0.8 });
      // 세로 영상의 가로·세로가 뒤집혀 오는 경우가 있어 첫 장면 방향에 맞춘다
      if (frame.width && frame.height && width && height && (frame.width > frame.height) !== (width > height)) {
        [width, height] = [height, width];
      }
      if (!width || !height) {
        width = frame.width;
        height = frame.height;
      }
      const ref = await decode(frame.uri);
      try {
        thumbUri = await makeThumb(ref);
      } finally {
        release(ref);
      }
    } catch (e) {
      logger.warn('동영상 첫 장면 만들기 실패:', e);
    }
    return {
      kind: 'video',
      uri: asset.uri,
      contentType,
      ext: chatFileExt(contentType, asset.fileName || asset.uri),
      width,
      height,
      durationMs: asset.durationMs,
      // iOS 에서 일반으로 고른 동영상은 이미 720p — 원본이 아니다
      original: original && asset.exportedOriginal,
      thumbUri,
    };
  }

  const mime = mimeOf(asset);
  const decoded = await decode(asset.uri);
  try {
    if (original) {
      const thumbUri = await makeThumb(decoded);
      if (KEEP_ORIGINAL_IMAGE.includes(mime)) {
        return {
          kind: 'image', uri: asset.uri, contentType: mime, ext: chatFileExt(mime, asset.fileName || asset.uri),
          width: decoded.width, height: decoded.height, original: true, thumbUri,
        };
      }
      // HEIC·GIF 등 — 크기는 그대로 JPEG 로
      const saved = await decoded.saveAsync({ compress: 1, format: SaveFormat.JPEG });
      return { kind: 'image', uri: saved.uri, contentType: 'image/jpeg', ext: 'jpg', width: saved.width, height: saved.height, original: true, thumbUri };
    }
    const fitted = await fitRef(decoded, CHAT_LIMITS.imageMaxPx);
    try {
      const target = fitted ?? decoded;
      const saved = await target.saveAsync({ compress: CHAT_LIMITS.jpegQuality, format: SaveFormat.JPEG });
      const thumbUri = await makeThumb(target);
      return { kind: 'image', uri: saved.uri, contentType: 'image/jpeg', ext: 'jpg', width: saved.width, height: saved.height, original: false, thumbUri };
    } finally {
      release(fitted);
    }
  } finally {
    release(decoded);
  }
}

// ── 올리기 ──────────────────────────────────────────────────────────

const closeBlob = (b: Blob) => {
  try {
    (b as unknown as { close?: () => void }).close?.();
  } catch {
    // 무시
  }
};

async function blobOf(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

/**
 * 파일 한 개 (+ 작은 그림) 올리기 → 메시지에 넣을 항목
 * @param onProgress 0~1
 */
export async function uploadChatMedia(
  args: { roomId: string; uid: string; messageId: string; index: number; file: ChatPreparedFile },
  onProgress?: (fraction: number) => void,
): Promise<ChatMediaItem> {
  const { roomId, uid, messageId, index, file } = args;
  const blob = await blobOf(file.uri);
  try {
    const max = file.kind === 'video' ? CHAT_LIMITS.videoMaxBytes : CHAT_LIMITS.imageMaxBytes;
    if (blob.size > max) throw new ChatMediaError('too-large', file.kind);
    const path = chatMediaPath(roomId, uid, messageId, index, file.ext);
    const url = await uploadChatFile(storage, path, blob, file.contentType, (sent, total) => {
      if (total > 0) onProgress?.(Math.min(1, sent / total));
    });
    const item: ChatMediaItem = {
      kind: file.kind,
      url,
      path,
      w: file.width || undefined,
      h: file.height || undefined,
      size: blob.size,
      contentType: file.contentType,
    };
    if (file.durationMs) item.durationMs = file.durationMs;
    if (file.original) item.original = true;
    if (file.thumbUri) {
      try {
        const tb = await blobOf(file.thumbUri);
        const thumbPath = chatMediaPath(roomId, uid, messageId, index, 'jpg', true);
        item.thumbUrl = await uploadChatFile(storage, thumbPath, tb, 'image/jpeg');
        item.thumbPath = thumbPath;
        closeBlob(tb);
      } catch (e) {
        // 작은 그림이 없어도 보낼 수 있다 (칸에는 원래 그림)
        logger.warn('작은 그림 올리기 실패:', e);
      }
    }
    return item;
  } finally {
    closeBlob(blob);
  }
}

// ── 사진 보관함에 저장 ───────────────────────────────────────────────

export interface ChatSaveResult {
  saved: number;
  failed: number;
  /** 사진 보관함 권한이 없다 */
  denied?: boolean;
}

/**
 * 사진·동영상을 내려받아 사진 보관함에 저장 (쓰기 권한만 요청)
 * @param entries 저장할 항목 · 그 메시지 안에서의 순서 (파일 이름에 쓴다)
 */
export async function saveChatMediaToLibrary(
  entries: Array<{ item: ChatMediaItem; index: number }>,
  opts: { campCode?: string | null; at?: Date | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<ChatSaveResult> {
  if (!entries.length) return { saved: 0, failed: 0 };
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return { saved: 0, failed: entries.length, denied: true };

  const dir = new Directory(Paths.cache, `chat-save-${Date.now().toString(36)}`);
  let saved = 0;
  let failed = 0;
  try {
    dir.create({ intermediates: true, idempotent: true });
    opts.onProgress?.(0, entries.length);
    for (const { item, index } of entries) {
      try {
        const ext = chatFileExt(item.contentType, item.path);
        const target = new File(dir, chatDownloadName({ campCode: opts.campCode, at: opts.at, index, ext }));
        const file = await File.downloadFileAsync(item.url, target, { idempotent: true });
        await MediaLibrary.saveToLibraryAsync(file.uri);
        saved += 1;
      } catch (e) {
        logger.warn('채팅 사진 저장 실패:', e);
        failed += 1;
      }
      opts.onProgress?.(saved + failed, entries.length);
    }
  } finally {
    try {
      if (dir.exists) dir.delete();
    } catch {
      // 임시 폴더는 시스템이 정리한다
    }
  }
  return { saved, failed };
}
