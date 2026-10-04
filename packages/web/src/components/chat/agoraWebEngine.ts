'use client';

/**
 * 웹 Agora 엔진 (agora-rtc-sdk-ng) — shared createCallController 가 쓰는 CallEngine.
 * SDK 는 통화를 처음 걸거나 받을 때 불러온다 (첫 화면 무게를 늘리지 않게).
 *
 * - 마이크: 들어갈 때 만들고 publish. 끄면 setMuted (상대에게 '마이크 꺼짐').
 * - 카메라: 켤 때 만들고 publish, 끄면 setEnabled(false) (카메라 불도 꺼진다).
 * - 상대 소리는 자동 재생, 영상 트랙은 화면(AgoraVideo)이 그린다 — trackOf(agoraUid) · onVideoChange.
 * - 스피커 선택은 웹에서 못 한다 (setSpeaker 는 아무 일도 안 함).
 */
import type { CallEngine, CallEngineEvents } from '@smis-mentor/shared';
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng';

type VideoTrack = ICameraVideoTrack | IRemoteVideoTrack;

export interface AgoraWebEngine extends CallEngine {
  /** 영상 트랙 (0 = 나) — 없으면 null */
  trackOf(agoraUid: number): VideoTrack | null;
  /** 영상 트랙이 생기거나 없어질 때 */
  onVideoChange(cb: () => void): () => void;
}

/** 브라우저가 마이크·카메라를 막았는가 */
export const isMediaPermissionError = (e: unknown): boolean => {
  const s = String((e as { code?: string; name?: string; message?: string } | null)?.code ?? (e as { name?: string })?.name ?? '') + String((e as { message?: string })?.message ?? '');
  return /PERMISSION_DENIED|NotAllowedError|Permission denied|NOT_READABLE|NotReadableError/i.test(s);
};

export function createAgoraWebEngine(): AgoraWebEngine {
  let client: IAgoraRTCClient | null = null;
  let mic: IMicrophoneAudioTrack | null = null;
  let cam: ICameraVideoTrack | null = null;
  let myUid = 0;
  let front = true;
  const remoteVideo = new Map<number, IRemoteVideoTrack>();
  const videoSubs = new Set<() => void>();
  const videoChanged = () => videoSubs.forEach((cb) => cb());
  const sdk = () => import('agora-rtc-sdk-ng').then((m) => m.default);

  const makeCam = async (frontCamera: boolean) => {
    const AgoraRTC = await sdk();
    const cams = await AgoraRTC.getCameras().catch(() => []);
    // 휴대폰 브라우저 — 앞/뒤 카메라 고르기
    const pick = cams.find((c) => (frontCamera ? /front|user|전면/i : /back|rear|environment|후면/i).test(c.label));
    return AgoraRTC.createCameraVideoTrack({ encoderConfig: '720p_1', optimizationMode: 'motion', ...(pick ? { cameraId: pick.deviceId } : {}) });
  };

  return {
    async join(o, ev: CallEngineEvents) {
      const AgoraRTC = await sdk();
      AgoraRTC.setLogLevel(3);
      const c = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      client = c;
      myUid = o.uid;
      front = o.frontCamera;
      const num = (u: string | number) => Number(u);
      c.on('user-joined', (u) => ev.onRemoteJoined(num(u.uid)));
      c.on('user-left', (u) => {
        remoteVideo.delete(num(u.uid));
        videoChanged();
        ev.onRemoteLeft(num(u.uid));
      });
      c.on('user-published', async (u, kind) => {
        if (kind !== 'audio' && kind !== 'video') return;
        try {
          await c.subscribe(u, kind);
        } catch {
          return;
        }
        if (kind === 'audio') u.audioTrack?.play();
        if (kind === 'video' && u.videoTrack) {
          remoteVideo.set(num(u.uid), u.videoTrack);
          videoChanged();
        }
        ev.onRemoteMedia(num(u.uid), kind, true);
      });
      c.on('user-unpublished', (u, kind) => {
        if (kind !== 'audio' && kind !== 'video') return;
        if (kind === 'video') {
          remoteVideo.delete(num(u.uid));
          videoChanged();
        }
        ev.onRemoteMedia(num(u.uid), kind, false);
      });
      c.on('user-info-updated', (uid, msg) => {
        if (msg === 'mute-audio' || msg === 'unmute-audio') ev.onRemoteMedia(num(uid), 'audio', msg === 'unmute-audio');
        if (msg === 'mute-video' || msg === 'disable-local-video') ev.onRemoteMedia(num(uid), 'video', false);
      });
      c.enableAudioVolumeIndicator();
      c.on('volume-indicator', (list) => ev.onVolumes(list.map((v) => ({ uid: num(v.uid) === myUid ? 0 : num(v.uid), level: v.level }))));
      c.on('network-quality', (q) => {
        const worst = Math.max(q.uplinkNetworkQuality, q.downlinkNetworkQuality);
        if (worst > 0) ev.onNetwork(worst >= 4 ? 'poor' : 'good');
      });
      c.on('connection-state-change', (cur, _prev, reason) => {
        if (cur === 'CONNECTING') ev.onConnection('connecting');
        else if (cur === 'CONNECTED') ev.onConnection('connected');
        else if (cur === 'RECONNECTING') ev.onConnection('reconnecting');
        else if (cur === 'DISCONNECTED' && reason !== 'LEAVE') ev.onConnection('disconnected');
      });
      c.on('token-privilege-will-expire', () => ev.onTokenWillExpire());

      await c.join(o.appId, o.channel, o.token, o.uid);
      mic = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      if (!o.mic) await mic.setMuted(true);
      const tracks: Array<IMicrophoneAudioTrack | ICameraVideoTrack> = [mic];
      if (o.cam) {
        cam = await makeCam(o.frontCamera).catch(() => null);
        if (cam) tracks.push(cam);
        videoChanged();
      }
      await c.publish(tracks);
    },
    async leave() {
      const c = client;
      client = null;
      mic?.close();
      cam?.close();
      mic = null;
      cam = null;
      remoteVideo.clear();
      videoChanged();
      if (c) await c.leave().catch(() => undefined);
    },
    async renewToken(token) {
      await client?.renewToken(token);
    },
    async setMic(on) {
      await mic?.setMuted(!on);
    },
    async setCamera(on) {
      if (!client) return;
      if (on && !cam) {
        cam = await makeCam(front);
        await client.publish(cam);
      } else if (cam) {
        await cam.setEnabled(on);
      }
      videoChanged();
    },
    async switchCamera() {
      if (!cam) return;
      front = !front;
      const AgoraRTC = await sdk();
      const cams = await AgoraRTC.getCameras().catch(() => []);
      if (cams.length < 2) return;
      const cur = cam.getTrackLabel();
      const next = cams.find((c) => (front ? /front|user|전면/i : /back|rear|environment|후면/i).test(c.label)) ?? cams.find((c) => c.label !== cur);
      if (next) await cam.setDevice(next.deviceId);
    },
    setSpeaker() {
      /* 웹은 소리 나갈 곳을 고를 수 없다 */
    },
    trackOf(agoraUid) {
      if (agoraUid === 0) return cam && cam.enabled ? cam : null;
      return remoteVideo.get(agoraUid) ?? null;
    },
    onVideoChange(cb) {
      videoSubs.add(cb);
      return () => { videoSubs.delete(cb); };
    },
  };
}
