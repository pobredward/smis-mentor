import { describe, expect, it } from './_expect';
import * as C from '../src/utils/chat';
import type { ChatRoom } from '../src/types/chat';

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as import('firebase/firestore').Timestamp;
const J = 'jc29';
const exp = (groupRole: string, group = 'summer') => [{ id: J, group, groupRole }];
const users = [
  { userId: 'admin1', name: '신선웅', role: 'admin', status: 'active', jobCodeIds: [J], jobExperiences: [{ id: J, group: 'manager', groupRole: '담임' }] },
  { userId: 'mgr', name: '매니저', role: 'mentor', status: 'active', jobCodeIds: [J], jobExperiences: exp('매니저', 'manager') },
  { userId: 'sub', name: '부매니저', role: 'mentor', status: 'active', jobCodeIds: [J], jobExperiences: exp('부매니저') },
  { userId: 'm1', name: '멘토1', role: 'mentor', status: 'active', jobCodeIds: [J], jobExperiences: exp('담임') },
  { userId: 'f1', name: 'Amy', role: 'foreign', status: 'active', jobCodeIds: [J], jobExperiences: exp('Speaking') },
  { userId: 'fsub', name: 'Ben', role: 'foreign', status: 'active', jobCodeIds: [J], jobExperiences: exp('Sub Manager') },
  { userId: 'fmgr', name: 'Cara', role: 'foreign', status: 'active', jobCodeIds: [J], jobExperiences: exp('Manager') },
  // 들어가지 않는 사람
  { userId: 'gone', name: '탈퇴', role: 'mentor', status: 'inactive', jobCodeIds: [J], jobExperiences: exp('담임') },
  { userId: 'temp', name: '임시', role: 'mentor_temp', status: 'active', jobCodeIds: [J], jobExperiences: exp('담임') },
  { userId: 'other', name: '다른캠프', role: 'mentor', status: 'active', jobCodeIds: ['x'], jobExperiences: [{ id: 'x', group: 'summer', groupRole: '담임' }] },
];

describe('chat — 방 구성', () => {
  const plan = C.campChatRoomPlan(users, { jobCodeId: J, campCode: 'J29' });
  const members = (type: string) => plan.find((p) => p.type === type)!.memberIds;

  it('자리 — 관리자·매니저(Manager)는 매니저, 부매니저·Sub Manager 는 멘토·원어민', () => {
    expect(C.chatMemberKindOf(users[0], J)).toBe('manager');
    expect(C.chatMemberKindOf(users[1], J)).toBe('manager');
    expect(C.chatMemberKindOf(users[2], J)).toBe('mentor');
    expect(C.chatMemberKindOf(users[5], J)).toBe('foreign');
    expect(C.chatMemberKindOf(users[6], J)).toBe('manager');
    expect(C.chatMemberKindOf(users[7], J)).toBe(null);
    expect(C.chatMemberKindOf(users[8], J)).toBe(null);
    expect(C.chatMemberKindOf(users[9], J)).toBe(null);
  });

  it('방 5개 — 끼리 방에는 매니저가 없다', () => {
    expect(plan.map((p) => p.id)).toEqual(['jc29_camp_all', 'jc29_camp_mentor', 'jc29_camp_mentor_only', 'jc29_camp_foreign', 'jc29_camp_foreign_only']);
    expect(members('camp_all')).toEqual(['admin1', 'f1', 'fmgr', 'fsub', 'm1', 'mgr', 'sub']);
    expect(members('camp_mentor')).toEqual(['admin1', 'fmgr', 'm1', 'mgr', 'sub']);
    expect(members('camp_mentor_only')).toEqual(['m1', 'sub']);
    expect(members('camp_foreign')).toEqual(['admin1', 'f1', 'fmgr', 'fsub', 'mgr']);
    expect(members('camp_foreign_only')).toEqual(['f1', 'fsub']);
  });

  it('사람 정보 · 바뀐 게 없으면 다시 쓰지 않는다', () => {
    const all = plan[0];
    expect(all.memberInfo.m1).toEqual({ name: '멘토1', kind: 'mentor', role: 'mentor', label: 'Summer 담임' });
    const room = { memberIds: [...all.memberIds].reverse(), memberInfo: { ...all.memberInfo }, campCode: 'J29' };
    expect(C.chatRoomNeedsSync(room, all)).toBe(false);
    expect(C.chatRoomNeedsSync({ ...room, memberInfo: { ...all.memberInfo, m1: { ...all.memberInfo.m1, name: '바뀐이름' } } }, all)).toBe(true);
    expect(C.chatRoomNeedsSync({ ...room, memberIds: all.memberIds.slice(1) }, all)).toBe(true);
    expect(C.chatRoomNeedsSync(null, all)).toBe(true);
  });

  it('관리자는 같은 기수 캠프 하나에만 배정돼도 그 기수 모든 캠프의 매니저 (끼리 방 제외)', () => {
    const E = 'jcE29';
    const gen = [J, E, 'jcS29'];
    const a2 = { userId: 'adm2', name: '오호석', role: 'admin', status: 'active', jobCodeIds: ['jcS29'], jobExperiences: [{ id: 'jcS29', group: 'manager', groupRole: '매니저' }] };
    const old = { userId: 'adm3', name: '예전 관리자', role: 'admin', status: 'active', jobCodeIds: ['old'], jobExperiences: [{ id: 'old' }] };
    expect(C.chatMemberKindOf(a2, E, gen)).toBe('manager');
    expect(C.chatMemberKindOf(a2, E)).toBe(null);
    expect(C.chatMemberKindOf(old, E, gen)).toBe(null);
    // 멘토는 기수와 상관없이 배정된 캠프만
    expect(C.chatMemberKindOf(users[3], E, gen)).toBe(null);
    const ePlan = C.campChatRoomPlan([...users, a2, old], { jobCodeId: E, campCode: 'E29', generation: '29기', generationJobCodeIds: gen });
    expect(ePlan.map((p) => [p.type, p.memberIds])).toEqual([
      ['camp_all', ['adm2', 'admin1']], ['camp_mentor', ['adm2', 'admin1']], ['camp_mentor_only', []], ['camp_foreign', ['adm2', 'admin1']], ['camp_foreign_only', []],
    ]);
    expect(ePlan[0].generation).toBe('29기');
    expect(ePlan[0].memberInfo.adm2).toEqual({ name: '오호석', kind: 'manager', role: 'admin' });
    // 기수가 바뀌면 다시 맞춘다
    const room = { memberIds: ePlan[0].memberIds, memberInfo: ePlan[0].memberInfo, campCode: 'E29', generation: null };
    expect(C.chatRoomNeedsSync(room, ePlan[0])).toBe(true);
    expect(C.chatRoomNeedsSync({ ...room, generation: '29기' }, ePlan[0])).toBe(false);
  });

  it('DM — 같은 캠프였거나 관리자', () => {
    expect(C.dmRoomId('b', 'a')).toBe('dm_a_b');
    expect(C.canStartDm(users[3], users[4])).toBe(true);
    expect(C.canStartDm(users[3], users[9])).toBe(false);
    expect(C.canStartDm(users[0], users[9])).toBe(true);
    expect(C.canStartDm(users[3], users[3])).toBe(false);
    expect(C.canStartDm(users[3], users[7])).toBe(false);
    expect(C.dmCandidates(users, users[3]).map((u) => u.userId)).toEqual(['mgr', 'sub', 'admin1', 'f1', 'fsub', 'fmgr']);
  });
});

describe('chat — 방 이름 · 목록', () => {
  const room = (id: string, type: ChatRoom['type'], at: number, extra: Partial<ChatRoom> = {}): ChatRoom =>
    ({ id, type, memberIds: ['me', 'you'], lastMessageAt: at ? ts(at) : null, lastMessage: at ? { kind: 'text', text: 'hi', senderId: 'you', senderName: 'You' } : null, ...extra }) as ChatRoom;

  it('방 이름 — 캠프 방은 캠프 코드 + 이름, DM 은 상대 이름', () => {
    expect(C.chatRoomTitle({ type: 'camp_mentor_only', campCode: 'J29', memberIds: [] }, 'ko')).toBe('J29 멘토끼리');
    expect(C.chatRoomTitle({ type: 'camp_foreign', campCode: 'J29', memberIds: [] }, 'en')).toBe('J29 Native Teachers & Managers');
    expect(C.chatRoomTitle({ type: 'dm', memberIds: ['me', 'you'], memberInfo: { you: { name: '김멘토', kind: 'mentor' } } }, 'ko', 'me')).toBe('김멘토');
  });

  it('지금 기수 캠프들 (J·E·S 순) · 1:1 대화 · 지난 기수', () => {
    const rooms = [
      room('dm_1', 'dm', 500), room('dm_2', 'dm', 900), room('dm_empty', 'dm', 0),
      room('s_camp_all', 'camp_all', 10, { jobCodeId: 's', campCode: 'S29', generation: '29기' }),
      room('a_camp_all', 'camp_all', 100, { jobCodeId: 'a', campCode: 'J29', generation: '29기' }),
      room('a_camp_mentor', 'camp_mentor', 50, { jobCodeId: 'a', campCode: 'J29', generation: '29기' }),
      room('b_camp_mentor', 'camp_mentor', 300, { jobCodeId: 'b', campCode: 'E29' }),
      room('b_camp_all', 'camp_all', 0, { jobCodeId: 'b', campCode: 'E29' }),
      room('c_camp_all', 'camp_all', 800, { jobCodeId: 'c', campCode: 'S28', generation: '28기' }),
      room('d_camp_all', 'camp_all', 0, { jobCodeId: 'd', campCode: 'J27' }),
    ];
    const g = C.chatRoomGroups(rooms, { activeJobCodeId: 'b' });
    expect(g.generation).toBe('29기');
    expect(g.camps.map((c) => c.campCode)).toEqual(['J29', 'E29', 'S29']);
    expect(g.camps[1].rooms.map((r) => r.id)).toEqual(['b_camp_all', 'b_camp_mentor']);
    expect(g.otherGenerations.map((x) => [x.generation, x.camps.map((c) => c.campCode)])).toEqual([['28기', ['S28']], ['27기', ['J27']]]);
    expect(g.dms.map((r) => r.id)).toEqual(['dm_2', 'dm_1']);
    expect(C.chatRoomGroups(rooms, { activeJobCodeId: 'a', keepEmptyDmId: 'dm_empty' }).dms.map((r) => r.id)).toEqual(['dm_2', 'dm_1', 'dm_empty']);
    // 지금 캠프 방이 없으면 가장 최근 기수
    expect(C.chatRoomGroups(rooms, { activeJobCodeId: 'zzz' }).generation).toBe('29기');
    expect(C.chatRoomGroups(rooms, { activeJobCodeId: 'c' }).camps.map((c) => c.campCode)).toEqual(['S28']);
    // [All] · 캠프 하나
    expect(C.filterCampGroups(g.camps, 'all').length).toBe(3);
    expect(C.filterCampGroups(g.camps, 'b').map((c) => c.campCode)).toEqual(['E29']);
    expect(C.filterCampGroups(g.camps, 'gone').length).toBe(3);
    expect(C.chatRoomGeneration({ campCode: 'F25_1' })).toBe('25기');
  });

  it('안 읽은 수 합은 지금 들어가 있는 방만', () => {
    const state = { unread: { a: 3, b: 2, left: 9 } };
    expect(C.totalUnread(state, [{ id: 'a' }, { id: 'b' }])).toBe(5);
    expect(C.unreadBadgeText(301)).toBe('300+');
  });
});

describe('chat — 미리보기 · 묶음 · 시간', () => {
  it('미리보기 글', () => {
    const img = { kind: 'image' as const, url: 'u', path: 'p' };
    const vid = { kind: 'video' as const, url: 'u', path: 'p' };
    expect(C.chatPreviewText({ kind: 'media', text: '', media: [img, img, img] }, 'ko')).toBe('사진 3장');
    expect(C.chatPreviewText({ kind: 'media', text: '', media: [vid] }, 'ko')).toBe('동영상');
    expect(C.chatPreviewText({ kind: 'media', text: '오늘 사진', media: [img, vid] }, 'ko')).toBe('사진 1장 · 동영상 1개 · 오늘 사진');
    expect(C.chatPreviewText({ kind: 'text', text: 'a\n  b', media: [] }, 'en')).toBe('a b');
    expect(C.chatPreviewText({ kind: 'text', text: 'x', deleted: true }, 'ko')).toBe('삭제된 메시지입니다.');
    const last = C.chatLastMessageOf({ id: 'm', kind: 'media', text: '', media: [img, img], senderId: 's', senderName: 'S' });
    expect(last).toEqual({ messageId: 'm', kind: 'media', text: '', senderId: 's', senderName: 'S', imageCount: 2 });
    expect(C.chatPreviewText(last, 'en')).toBe('2 photo(s)');
  });

  it('묶음 칸 (카톡 묶어 보내기)', () => {
    const want: Record<number, number[]> = { 0: [], 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [3, 2, 2], 8: [3, 3, 2], 9: [3, 3, 3], 10: [3, 3, 2, 2], 14: [3, 3, 2, 2] };
    Object.entries(want).forEach(([n, rows]) => expect(C.bundleRows(Number(n))).toEqual(rows));
    for (let n = 1; n <= 10; n++) expect(C.bundleRows(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('크기 줄이기 · 파일 이름 · 경로', () => {
    expect(C.fitWithin(4032, 3024, 2048)).toEqual({ w: 2048, h: 1536 });
    expect(C.fitWithin(800, 600, 2048)).toEqual({ w: 800, h: 600 });
    expect(C.chatMediaPath('r', 'u', 'm', 0, '.JPG', true)).toBe('chat/r/u/m/0_t.jpg');
    expect(C.chatDownloadName({ campCode: 'J29', at: new Date(2026, 0, 5, 15, 3), index: 0, ext: 'jpg' })).toBe('SMIS_J29_20260105_1503_01.jpg');
    expect(C.chatFileExt('video/quicktime')).toBe('mov');
    expect(C.chatFileExt('', 'IMG_1.HEIC')).toBe('heic');
  });

  it('안 읽은 사람 수', () => {
    const m = { senderId: 'a', createdAt: ts(1000), kind: 'text' as const };
    expect(C.unreadReaders(m, ['a', 'b', 'c', 'd'], { b: 1000, c: 999 })).toBe(2);
    expect(C.unreadReaders({ ...m, createdAt: null }, ['a', 'b'], {})).toBe(null);
  });

  it('시각 표시', () => {
    expect(C.chatTimeLabel(new Date(2026, 9, 4, 15, 5), 'ko')).toBe('오후 3:05');
    expect(C.chatTimeLabel(new Date(2026, 9, 4, 0, 7), 'en')).toBe('12:07 AM');
    expect(C.chatDayLabel(new Date(2026, 9, 4), 'ko')).toBe('2026년 10월 4일 일요일');
    expect(C.chatDayLabel(new Date(2026, 9, 4), 'en')).toBe('Sunday, October 4, 2026');
    const now = new Date(2026, 9, 4, 12);
    expect(C.chatListTimeLabel(new Date(2026, 9, 3, 9), 'ko', now)).toBe('어제');
    expect(C.chatListTimeLabel(new Date(2026, 8, 1, 9), 'ko', now)).toBe('9월 1일');
    expect(C.chatListTimeLabel(new Date(2025, 8, 1, 9), 'en', now)).toBe('9/1/2025');
  });

  it('말풍선 묶기 — 같은 사람·같은 분은 이름 한 번, 시각은 마지막에', () => {
    const at = (h: number, m: number, s = 0) => ts(new Date(2026, 9, 4, h, m, s).getTime());
    const list = [
      { senderId: 'a', createdAt: at(9, 0, 1), kind: 'text' as const },
      { senderId: 'a', createdAt: at(9, 0, 30), kind: 'text' as const },
      { senderId: 'me', createdAt: at(9, 0, 40), kind: 'text' as const },
      { senderId: 'a', createdAt: at(9, 1, 0), kind: 'text' as const },
      { senderId: 'a', createdAt: ts(new Date(2026, 9, 5, 9, 1).getTime()), kind: 'text' as const },
    ];
    expect(C.chatMessageLayout(list, 'me')).toEqual([
      { showDay: true, showSender: true, showTime: false, mine: false },
      { showDay: false, showSender: false, showTime: true, mine: false },
      { showDay: false, showSender: false, showTime: true, mine: true },
      { showDay: false, showSender: true, showTime: true, mine: false },
      { showDay: true, showSender: true, showTime: true, mine: false },
    ]);
  });
});

describe('chat — 대화 내용 검색', () => {
  const at = (ms: number) => ({ toMillis: () => ms }) as unknown as import('firebase/firestore').Timestamp;
  const msgs = [
    { id: 'a', senderId: 'x', kind: 'text' as const, text: '내일 집결 시간은 9시', createdAt: at(1) },
    { id: 'b', senderId: 'y', kind: 'text' as const, text: '집결  장소는 로비', createdAt: at(3) },
    { id: 'c', senderId: 'x', kind: 'text' as const, text: '집결', createdAt: at(2), deleted: true },
    { id: 'd', senderId: 'z', kind: 'text' as const, text: 'Bus at 9', createdAt: at(4) },
    { id: 'e', senderId: 'blk', kind: 'text' as const, text: '집결 취소', createdAt: at(5) },
    { id: 'f', senderId: 'x', kind: 'media' as const, text: '', createdAt: at(6) },
  ];
  it('최신 결과부터 · 삭제·차단 제외 · 공백·대소문자 무시', () => {
    expect(C.searchChatMessages(msgs, ' 집결 ', { blk: true })).toEqual(['b', 'a']);
    expect(C.searchChatMessages(msgs, '집결 장소')).toEqual(['b']);
    expect(C.searchChatMessages(msgs, 'BUS')).toEqual(['d']);
    expect(C.searchChatMessages(msgs, '   ')).toEqual([]);
  });
  it('강조 표시 나누기', () => {
    expect(C.splitByQuery('Bus at 9 and bus at 10', 'bus')).toEqual([
      { text: 'Bus', hit: true }, { text: ' at 9 and ', hit: false }, { text: 'bus', hit: true }, { text: ' at 10', hit: false },
    ]);
    expect(C.splitByQuery('집결  장소는 로비', '집결 장소')).toEqual([{ text: '집결  장소', hit: true }, { text: '는 로비', hit: false }]);
    expect(C.splitByQuery('a+b (c)', '+b (')).toEqual([{ text: 'a', hit: false }, { text: '+b (', hit: true }, { text: 'c)', hit: false }]);
    expect(C.splitByQuery('hello', '')).toEqual([{ text: 'hello', hit: false }]);
  });
});
