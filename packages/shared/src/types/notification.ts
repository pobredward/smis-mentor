// ==================== 푸시 알림 설정 ====================
// 알림 종류를 한 곳에 모아 두고, 보내는 쪽(서버)과 설정 화면(웹·모바일)이 같은 목록을 쓴다.
//
// 저장 위치: users/{uid}.notificationSettings
//  - generalNotifications : 전체 on/off (false면 종류와 상관없이 아무 알림도 보내지 않음)
//  - 그 외 키             : 종류별 on/off (값이 없으면 켜진 것으로 본다)
// 기존 문서와 호환 — generalNotifications·taskReminders 키를 그대로 쓴다.

import { STOCK_MANAGER_GROUP_ROLES } from './inventory';
import { tr } from '../i18n';

/** 알림 종류 키 (= notificationSettings 의 필드명) */
export const NOTIFICATION_KEYS = [
  'taskReminders',
  'lostItem',
  'supplyRequest',
  'supplyBuyer',
  'supplyProgress',
  'supplyComment',
  'supplySettle',
  'supplyIntake',
  'stockLow',
  'stockTransfer',
] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export interface NotificationSettings extends Partial<Record<NotificationKey, boolean>> {
  /** 전체 on/off — 끄면 모든 알림이 오지 않는다 */
  generalNotifications?: boolean;
}

/** 이 사람이 어떤 알림을 받을 수 있는지 판단할 때 쓰는 최소 정보 */
export interface NotificationAudience {
  role?: string;
  jobExperiences?: Array<{ id?: string; group?: string; groupRole?: string }>;
  /** 지금 보고 있는 캠프 (없으면 전체 경력에서 판단) */
  activeJobCodeId?: string;
}

export const isNotifyAdmin = (u?: NotificationAudience | null): boolean => u?.role === 'admin';
/**
 * 어느 캠프에서든 (또는 지정한 캠프에서) 부매니저인가.
 * 재고 화면 권한(inventoryPerm)과 같은 기준을 쓴다 — 매니저까지 포함하려면 STOCK_MANAGER_GROUP_ROLES 한 곳만 고치면 된다.
 */
export const isNotifyStockManager = (u?: NotificationAudience | null): boolean =>
  isNotifyAdmin(u) || (u?.jobExperiences ?? []).some(e =>
    (!u?.activeJobCodeId || e.id === u.activeJobCodeId) && !!e.groupRole && STOCK_MANAGER_GROUP_ROLES.includes(e.groupRole));

/** 알림 종류 1개의 정의 */
export interface NotificationType {
  key: NotificationKey;
  /** 설정 화면 묶음 */
  group: 'task' | 'supply' | 'stock' | 'lost';
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  /** 이 종류를 설정 화면에 보여 줄지 — 권한에 따라 다르다 */
  visible: (u?: NotificationAudience | null) => boolean;
}

const everyone = () => true;

export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: 'taskReminders', group: 'task',
    label: '업무 알림', labelEn: 'Task reminders',
    desc: '배정된 업무를 아직 완료하지 않았을 때',
    descEn: 'When an assigned task is still not done',
    visible: everyone,
  },
  {
    key: 'lostItem', group: 'lost',
    label: '분실물 등록', labelEn: 'Lost & found',
    desc: '캠프에 분실물이 등록되었을 때 (이름표가 있으면 담당 선생님에게만)',
    descEn: 'When a lost item is registered at the camp',
    visible: everyone,
  },
  {
    key: 'supplyRequest', group: 'supply',
    label: '새 구매 요청 (승인 필요)', labelEn: 'New supply request (needs approval)',
    desc: '새 물품 요청이 올라와 승인이 필요할 때 (관리자)',
    descEn: 'A new request that needs your approval (admins)',
    visible: everyone,
  },
  {
    key: 'supplyBuyer', group: 'supply',
    label: '구매 담당 지정', labelEn: 'Assigned as buyer',
    desc: '내가 사 올 물건이 생겼을 때 · 기본 구매 담당이 되었을 때',
    descEn: 'When something is assigned for you to buy',
    visible: everyone,
  },
  {
    key: 'supplyProgress', group: 'supply',
    label: '내 요청 진행', labelEn: 'My request updates',
    desc: '내가 올린 요청이 승인 · 구매 완료 · 반려 · 보류되었을 때',
    descEn: 'When your request is approved, purchased, rejected or put on hold',
    visible: everyone,
  },
  {
    key: 'supplySettle', group: 'supply',
    label: '정산', labelEn: 'Settlement',
    desc: '용돈봉투에서 전달하거나 송금받을 것이 생겼을 때',
    descEn: 'When an envelope payment or transfer is due',
    visible: everyone,
  },
  {
    key: 'supplyIntake', group: 'stock',
    label: '입고 · 학부모 청구', labelEn: 'Intake & parent billing',
    desc: '캠프 공용 물품이 도착해 입고할 때 · 학부모님께 청구할 물품이 생겼을 때',
    descEn: 'Camp supplies to receive, items to bill to parents',
    visible: isNotifyAdmin,
  },
  {
    key: 'stockLow', group: 'stock',
    label: '재고 부족', labelEn: 'Low stock',
    desc: '최소 재고보다 적어졌을 때',
    descEn: 'When stock falls below the minimum',
    visible: isNotifyStockManager,
  },
  {
    key: 'stockTransfer', group: 'stock',
    label: '재고 이동', labelEn: 'Stock moved',
    desc: '다른 그룹 부매니저가 우리 그룹 재고를 가져갔을 때',
    descEn: 'When another group takes stock from your group',
    visible: isNotifyStockManager,
  },
];

export const NOTIFICATION_GROUP_LABELS: Record<NotificationType['group'], { ko: string; en: string }> = {
  task: { ko: '업무', en: 'Tasks' },
  supply: { ko: '물품 요청 · 구매', en: 'Supply requests' },
  stock: { ko: '재고 관리', en: 'Stock' },
  lost: { ko: '분실물', en: 'Lost & found' },
};

/** 이 사람의 설정 화면에 보여 줄 알림 종류 (권한이 바뀌면 결과도 바로 바뀐다) */
export function visibleNotificationTypes(u?: NotificationAudience | null): NotificationType[] {
  return NOTIFICATION_TYPES.filter(t => t.visible(u));
}

/**
 * 이 알림을 보내도 되는가 — 보내는 쪽에서 쓰는 단 하나의 판단 함수.
 * 전체가 꺼져 있으면 무조건 false, 종류별 값이 없으면 켜진 것으로 본다.
 */
export function notificationAllowed(settings: NotificationSettings | undefined | null, key: NotificationKey): boolean {
  if (!settings) return true;
  if (settings.generalNotifications === false) return false;
  return settings[key] !== false;
}

/** 전체 알림이 켜져 있는가 */
export const notificationMasterOn = (s?: NotificationSettings | null): boolean => s?.generalNotifications !== false;

/**
 * 전체 알림 스위치를 눌렀을 때 저장할 값.
 * - 켤 때: 전체 + 화면에 보이는 종류를 모두 켠다 (예전에 꺼 둔 업무 알림 등이 꺼진 채 남지 않게)
 * - 끌 때: 전체만 끈다 (종류별 값은 그대로 두었다가, 다시 켜면 모두 켜짐)
 */
export function notificationMasterTogglePatch(
  s: NotificationSettings | null | undefined,
  visibleKeys: NotificationKey[],
): NotificationSettings {
  if (notificationMasterOn(s)) return { generalNotifications: false };
  const patch: NotificationSettings = { generalNotifications: true };
  for (const k of visibleKeys) patch[k] = true;
  return patch;
}

// ==================== 알림 수신 가능 여부 (관리자 조회용) ====================

/** 이 사람이 지금 푸시를 받을 수 있는 상태인가 */
export type PushReachState =
  | 'ok'        // 받을 수 있음
  | 'muted'     // 앱에서 전체 알림을 껐음
  | 'denied'    // 휴대폰 설정에서 알림을 거부했음 (앱이 기록한 경우에만 알 수 있음)
  | 'noToken';  // 등록된 푸시 토큰이 없음 — 아래 pushReachReasons() 참고

export const PUSH_REACH_LABELS: Record<PushReachState, { label: string; labelEn: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok:      { label: '받는 중',     labelEn: 'Receiving',   tone: 'ok' },
  muted:   { label: '알림 끔',     labelEn: 'Muted',       tone: 'warn' },
  denied:  { label: '기기에서 거부', labelEn: 'Denied',      tone: 'bad' },
  // '기기 없음'이라고 단정하지 않는다 — 토큰이 없는 이유는 여러 가지다 (pushReachReasons)
  noToken: { label: '알림 못 받음', labelEn: 'Not reachable', tone: 'bad' },
};

/**
 * 토큰이 없는 이유 후보.
 *
 * 앱은 토큰을 **지우지 않는다** (로그아웃해도 그대로). 유일한 삭제 경로는
 * 업무 알림을 보낸 뒤 Expo가 `DeviceNotRegistered` 를 돌려줄 때 서버가 지우는 것이다.
 * 그래서 토큰 0개는 아래 중 하나다.
 */
export function pushReachReasons(r: Pick<PushReach, 'lastMobileMs'>): string[] {
  const usedApp = !!r.lastMobileMs;
  return [
    ...(usedApp ? [] : ['앱으로 로그인한 적이 없음 (웹만 사용)']),
    '앱에서 알림 권한을 거부함 — 이 경우 토큰이 아예 발급되지 않습니다',
    '앱을 지웠거나 기기를 바꿔서 토큰이 만료됨 — 서버가 자동으로 정리합니다',
  ];
}

export interface PushReach {
  state: PushReachState;
  /** 등록된 기기 수 */
  devices: number;
  /** 기기 플랫폼 (ios / android) */
  platforms: string[];
  /** 가장 최근에 앱이 토큰을 확인한 시각 (ms) */
  lastUsedMs?: number;
  /** 앱을 마지막으로 연 시각 (ms) — 앱이 기록하기 시작한 뒤부터 쌓인다 */
  lastMobileMs?: number;
  /** 종류별로 꺼 둔 알림 (전체를 끈 경우는 제외) */
  offKeys: NotificationKey[];
}

interface PushUserLike {
  pushTokens?: Record<string, { platform?: string; lastUsed?: { toMillis?: () => number } | null }> | null;
  notificationSettings?: NotificationSettings | null;
  notificationPermission?: { status?: string } | null;
  lastMobileAt?: { toMillis?: () => number } | null;
}

/** 관리자 화면에서 "이 사람 알림 받을 수 있나?"를 한 번에 계산 */
export function pushReachOf(u: PushUserLike | null | undefined): PushReach {
  const tokens = Object.entries(u?.pushTokens ?? {});
  const platforms = [...new Set(tokens.map(([, v]) => v?.platform).filter(Boolean) as string[])];
  const lastUsedMs = tokens
    .map(([, v]) => v?.lastUsed?.toMillis?.() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0) || undefined;
  const s = u?.notificationSettings ?? undefined;
  const offKeys = NOTIFICATION_KEYS.filter(k => s?.[k] === false);

  let state: PushReachState;
  if (u?.notificationPermission?.status === 'denied') state = 'denied';
  else if (tokens.length === 0) state = 'noToken';
  else if (s?.generalNotifications === false) state = 'muted';
  else state = 'ok';

  return { state, devices: tokens.length, platforms, lastUsedMs, lastMobileMs: u?.lastMobileAt?.toMillis?.(), offKeys };
}

/** 이 사람이 꼭 받아야 하는 알림이 있는데 못 받고 있는가 (부매니저·관리자 등) */
export function pushReachWarning(u: (PushUserLike & NotificationAudience) | null | undefined): string | undefined {
  const r = pushReachOf(u);
  if (r.state === 'ok' && r.offKeys.length === 0) return undefined;
  if (isNotifyStockManager(u)) {
    if (r.state !== 'ok') return '재고 부족 알림을 받지 못합니다';
    if (r.offKeys.includes('stockLow')) return '재고 부족 알림을 꺼 두었습니다';
  }
  return undefined;
}

// ==================== 보낸 사람에게 알려 줄 '못 받은 사람' ====================

/** 알림을 못 받은 이유 (서버가 돌려주는 state 값) */
export const MISSED_STATE_LABELS: Record<string, { ko: string; en: string }> = {
  noToken: { ko: '앱 알림 미설정', en: 'app not set up' },
  denied:  { ko: '휴대폰에서 거부', en: 'denied on phone' },
  muted:   { ko: '알림 전체 꺼둠', en: 'all notifications off' },
  typeOff: { ko: '이 알림 꺼둠',   en: 'this type off' },
};

/**
 * "누가 못 받았는지" 한 줄 요약.
 * 보낸 사람이 그 자리에서 "알림 켜 주세요"라고 말할 수 있게 이름과 이유를 함께 보여 준다.
 * 받을 사람이 모두 정상이면 null.
 */
export function missedSummary(
  missed: Array<{ name: string; state: string }> | undefined | null,
  isForeign = false
): string | null {
  if (!missed?.length) return null;
  const byState = new Map<string, string[]>();
  missed.forEach(m => {
    const k = m.state;
    if (!byState.has(k)) byState.set(k, []);
    byState.get(k)!.push(m.name);
  });
  const parts = [...byState.entries()].map(([state, names]) => {
    const label = MISSED_STATE_LABELS[state] ?? { ko: '알림 꺼짐', en: 'notifications off' };
    return `${names.join(', ')} (${isForeign ? label.en : label.ko})`;
  });
  return tr(isForeign, 'notification.notDeliveredToV0Ask', { v0: parts.join(' · ') });
}

// ==================== 분실물 알림 대상 미리보기 ====================
// 서버(발송)와 클라이언트(등록 화면 미리보기)가 **같은 기준**을 쓰도록 한 곳에 둔다.

/** 대상 판정에 필요한 사용자 최소 정보 */
export interface NotifyUserLike extends PushUserLikePublic {
  userId?: string;
  id?: string;
  name?: string;
  jobExperiences?: Array<{ id?: string; group?: string; groupRole?: string }>;
}
/** pushReachOf 가 보는 필드 (외부에서도 쓸 수 있게 공개) */
export interface PushUserLikePublic {
  pushTokens?: Record<string, { platform?: string; lastUsed?: { toMillis?: () => number } | null }> | null;
  notificationSettings?: NotificationSettings | null;
  notificationPermission?: { status?: string } | null;
  lastMobileAt?: { toMillis?: () => number } | null;
}

/**
 * 분실물 알림의 '부매니저' 대상 — 그 그룹의 **부매니저만** (매니저는 제외).
 * 재고 화면 권한과 같은 기준(STOCK_MANAGER_GROUP_ROLES)을 쓴다.
 */
const LOST_GROUP_MANAGER_ROLES = STOCK_MANAGER_GROUP_ROLES;

/** 그 그룹의 부매니저들 — 등록 화면에서 이름을 보여 주기 위해 따로 뽑는다 */
export function lostGroupManagers<T extends NotifyUserLike>(
  users: T[], jobCodeId?: string, ownerGroup?: string
): T[] {
  if (!ownerGroup) return [];
  return users.filter(u => (u.jobExperiences ?? []).some(e =>
    e.id === jobCodeId
    && String(e.group ?? '').toLowerCase() === ownerGroup
    && !!e.groupRole && LOST_GROUP_MANAGER_ROLES.includes(e.groupRole)));
}

export interface LostNotifyQuery {
  jobCodeId?: string;
  /** 'all' 이면 캠프 전체 */
  scope: 'owner' | 'all';
  targets: readonly ('classMentor' | 'unitMentor' | 'groupManager')[];
  ownerClassMentor?: string;
  ownerUnitMentor?: string;
  /** 소문자 그룹 키 (예: summer) */
  ownerGroup?: string;
  /** 등록한 사람 — 자기 자신에게는 보내지 않는다 */
  excludeId?: string;
}

/** 이 설정으로 알림이 갈 사람들 */
export function lostNotifyRecipients<T extends NotifyUserLike>(users: T[], q: LostNotifyQuery): T[] {
  const uid = (u: T) => u.userId ?? u.id;
  let list = users;
  if (q.scope !== 'all') {
    const names = new Set([
      ...(q.targets.includes('classMentor') ? [q.ownerClassMentor] : []),
      ...(q.targets.includes('unitMentor') ? [q.ownerUnitMentor] : []),
    ].map(s => s?.trim()).filter(Boolean) as string[]);
    const managerIds = new Set(
      q.targets.includes('groupManager')
        ? lostGroupManagers(users, q.jobCodeId, q.ownerGroup).map(u => u.userId ?? u.id)
        : []);
    list = list.filter(u => names.has(String(u.name ?? '').trim()) || managerIds.has(u.userId ?? u.id));
  }
  return list.filter(u => uid(u) !== q.excludeId);
}

export interface LostNotifyPreview {
  /** 받을 수 있는 사람 */
  ok: string[];
  /** 못 받는 사람 + 이유 */
  missed: Array<{ name: string; state: MissedStateLike }>;
  total: number;
}
export type MissedStateLike = PushReachState | 'typeOff';

/** 보내기 전에 "누가 받고 누가 못 받는지" 계산 */
export function lostNotifyPreview<T extends NotifyUserLike>(users: T[], q: LostNotifyQuery): LostNotifyPreview {
  const list = lostNotifyRecipients(users, q);
  const ok: string[] = [];
  const missed: Array<{ name: string; state: MissedStateLike }> = [];
  list.forEach(u => {
    const name = String(u.name ?? '').trim() || '이름 없음';
    const reach = pushReachOf(u);
    const state: MissedStateLike | null =
      reach.state !== 'ok' ? reach.state
      : !notificationAllowed(u.notificationSettings ?? undefined, 'lostItem') ? 'typeOff'
      : null;
    if (state) missed.push({ name, state });
    else ok.push(name);
  });
  return { ok, missed, total: list.length };
}
