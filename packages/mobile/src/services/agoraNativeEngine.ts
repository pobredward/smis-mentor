/**
 * 앱 Agora 엔진 (react-native-agora) — shared createCallController 가 쓰는 CallEngine.
 *
 * - 엔진은 처음 통화할 때 한 번 만들고(initialize) 계속 쓴다. 통화마다 joinChannel · leaveChannel.
 * - 통신(Communication) 모드 · 회의용 소리(AudioScenarioMeeting).
 * - 영상: 카메라를 켜면 enableVideo + startPreview, 내 칸은 uid 0 · 상대 칸은 그 사람 uid 로 RtcSurfaceView 가 그린다.
 * - 마이크 끔 = muteLocalAudioStream(상대에게 '마이크 꺼짐'), 카메라 끔 = enableLocalVideo(false) (카메라 불도 꺼짐).
 * - 스피커: 영상이면 기본 스피커, 음성이면 기본 수화기 — 버튼으로 바꾼다.
 * - Android 는 들어가기 전에 마이크(영상이면 카메라) 권한을 묻는다. iOS 는 처음 쓸 때 시스템이 묻는다.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import {
  AudioScenarioType,
  ChannelProfileType,
  ClientRoleType,
  ConnectionStateType,
  QualityType,
  RemoteAudioState,
  RemoteVideoState,
  createAgoraRtcEngine,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from 'react-native-agora';
import type { CallEngine, CallEngineEvents } from '@smis-mentor/shared';

export class CallPermissionError extends Error {
  constructor() {
    super('chat.callPermission');
  }
}

async function askPermissions(cam: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(cam ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  if (res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) throw new CallPermissionError();
  // 블루투스 이어폰 (Android 12+) — 거절해도 통화는 된다
  if (Number(Platform.Version) >= 31) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT).catch(() => undefined);
  }
}

export interface AgoraNativeEngine extends CallEngine {
  /** 카메라 권한이 있는가 (영상으로 켤 때) */
  ensureCamera(): Promise<boolean>;
}

export function createAgoraNativeEngine(): AgoraNativeEngine {
  let engine: IRtcEngine | null = null;
  let appIdUsed = '';
  let handler: IRtcEngineEventHandler | null = null;
  let videoOn = false;

  const ensure = (appId: string): IRtcEngine => {
    if (engine && appIdUsed === appId) return engine;
    if (engine) {
      engine.release();
      engine = null;
    }
    const e = createAgoraRtcEngine();
    e.initialize({ appId, channelProfile: ChannelProfileType.ChannelProfileCommunication, audioScenario: AudioScenarioType.AudioScenarioMeeting });
    engine = e;
    appIdUsed = appId;
    return e;
  };

  return {
    async join(o, ev: CallEngineEvents) {
      await askPermissions(o.cam);
      const e = ensure(o.appId);
      if (handler) e.unregisterEventHandler(handler);
      handler = {
        onUserJoined: (_c, uid) => ev.onRemoteJoined(uid),
        onUserOffline: (_c, uid) => ev.onRemoteLeft(uid),
        onUserMuteAudio: (_c, uid, muted) => ev.onRemoteMedia(uid, 'audio', !muted),
        onRemoteAudioStateChanged: (_c, uid, state) => {
          if (state === RemoteAudioState.RemoteAudioStateDecoding) ev.onRemoteMedia(uid, 'audio', true);
        },
        onUserMuteVideo: (_c, uid, muted) => ev.onRemoteMedia(uid, 'video', !muted),
        onRemoteVideoStateChanged: (_c, uid, state) => {
          if (state === RemoteVideoState.RemoteVideoStateDecoding) ev.onRemoteMedia(uid, 'video', true);
          else if (state === RemoteVideoState.RemoteVideoStateStopped) ev.onRemoteMedia(uid, 'video', false);
        },
        // 소리 크기 0~255 → 0~100, 나는 uid 0
        onAudioVolumeIndication: (_c, speakers) => ev.onVolumes(speakers.map((s) => ({ uid: Number(s.uid ?? 0), level: Math.round((Number(s.volume ?? 0) / 255) * 100) }))),
        onNetworkQuality: (_c, uid, tx, rx) => {
          const worst = Math.max(tx, rx);
          if (worst === QualityType.QualityUnknown) return;
          const q = worst >= QualityType.QualityBad ? 'poor' : 'good';
          if (uid === 0) ev.onNetwork(q);
          else ev.onRemoteNetwork?.(uid, q);
        },
        onConnectionStateChanged: (_c, state) => {
          if (state === ConnectionStateType.ConnectionStateConnecting) ev.onConnection('connecting');
          else if (state === ConnectionStateType.ConnectionStateConnected) ev.onConnection('connected');
          else if (state === ConnectionStateType.ConnectionStateReconnecting) ev.onConnection('reconnecting');
          else if (state === ConnectionStateType.ConnectionStateFailed) ev.onConnection('disconnected');
        },
        onTokenPrivilegeWillExpire: () => ev.onTokenWillExpire(),
      };
      e.registerEventHandler(handler);
      e.enableAudio();
      e.enableAudioVolumeIndication(400, 3, true);
      videoOn = o.cam;
      if (o.cam) {
        e.enableVideo();
        e.startPreview();
      } else {
        // 상대 영상은 받을 수 있게 비디오 모듈은 켜 두고 내 카메라만 끈다
        e.enableVideo();
        e.enableLocalVideo(false);
      }
      e.setDefaultAudioRouteToSpeakerphone(o.speaker);
      e.muteLocalAudioStream(!o.mic);
      const r = e.joinChannel(o.token, o.channel, o.uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
        publishMicrophoneTrack: true,
        publishCameraTrack: o.cam,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      if (r < 0) throw new Error(`agora join ${r}`);
    },
    async leave() {
      const e = engine;
      if (!e) return;
      if (handler) e.unregisterEventHandler(handler);
      handler = null;
      if (videoOn) e.stopPreview();
      videoOn = false;
      e.leaveChannel();
    },
    async renewToken(token) {
      engine?.renewToken(token);
    },
    setMic(on) {
      engine?.muteLocalAudioStream(!on);
    },
    async setCamera(on) {
      const e = engine;
      if (!e) return;
      if (on) {
        await askPermissions(true);
        e.enableLocalVideo(true);
        e.startPreview();
        e.updateChannelMediaOptions({ publishCameraTrack: true });
      } else {
        e.updateChannelMediaOptions({ publishCameraTrack: false });
        e.enableLocalVideo(false);
        e.stopPreview();
      }
      videoOn = on;
    },
    switchCamera() {
      engine?.switchCamera();
    },
    setSpeaker(on) {
      engine?.setEnableSpeakerphone(on);
    },
    async ensureCamera() {
      try {
        await askPermissions(true);
        return true;
      } catch {
        return false;
      }
    },
  };
}

