import { describe, expect, it } from './_expect';
import { rosterAccountCells, rosterAccountKeys, rosterColumnsOf, rosterRowWithAccount, rosterTierOf } from '../src/types/campRoster';
import { buildCampTeachers } from '../src/utils/campTeachers';

describe('선생님 표 — 멘토 영어 이름 · 성별은 계정 값만', () => {
  it('멘토 표만 계정 칸 — J·E 는 영어 이름 · 성별, 해외(S·F)는 주민번호 · 여권 · 단체티 · 휴대폰까지', () => {
    expect(rosterAccountKeys('mentor', 'JE').sort()).toEqual(['englishName', 'gender']);
    expect(rosterAccountKeys('mentor', 'S').sort()).toEqual(['englishName', 'gender', 'passportExpiry', 'passportName', 'passportNumber', 'phoneModel', 'phoneNumber', 'rrn', 'shirtSize']);
    expect(rosterTierOf('F29')).toBe('S');
    expect(rosterTierOf('S29')).toBe('S');
    expect(rosterTierOf('E29')).toBe('JE');
    expect(rosterAccountKeys('foreign', 'S')).toEqual([]);
    expect(rosterColumnsOf('foreign', 'JE').some((c) => c.fromAccount)).toBe(false);
  });

  it('계정 값 → 칸 (안 넣었으면 빈 칸)', () => {
    expect(rosterAccountCells({ englishNickname: ' Luka ', gender: 'M' })).toEqual({ englishName: 'Luka', gender: 'M' });
    expect(rosterAccountCells({ gender: 'x' })).toEqual({ englishName: '', gender: '' });
    expect(rosterAccountCells(null)).toEqual({ englishName: '', gender: '' });
  });

  it('표에 적은 값은 버리고 계정 값으로 — 연결이 없으면 비운다', () => {
    const row = { cells: { name: '고성모', englishName: 'Seongmo', gender: 'M', grade: 'G3~G5' }, userId: 'u1' };
    expect(rosterRowWithAccount('mentor', 'S', row, { englishNickname: 'Luka', gender: 'M' }).cells)
      .toEqual({ name: '고성모', englishName: 'Luka', gender: 'M', grade: 'G3~G5' });
    // 멘토가 아직 안 넣음 → 빈 칸 (재촉할 수 있게)
    expect(rosterRowWithAccount('mentor', 'S', { cells: { name: '이서경', englishName: 'SeoKyoung', gender: 'F' }, userId: 'u2' }, { gender: 'F' }).cells)
      .toEqual({ name: '이서경', gender: 'F' });
    // 계정 없는 자리표시 줄
    expect(rosterRowWithAccount('mentor', 'JE', { cells: { name: '남', gender: 'M' }, userId: null }, { englishNickname: 'X', gender: 'F' }).cells)
      .toEqual({ name: '남' });
    // 민감 칸은 건드리지 않는다 (서버가 개인 저장소 값으로 채운다)
    expect(rosterRowWithAccount('mentor', 'S', { cells: { name: '유세아', passportNumber: 'M123', englishName: 'X' }, userId: 'u4' }, { englishNickname: 'Sage', gender: 'F' }).cells)
      .toEqual({ name: '유세아', passportNumber: 'M123', englishName: 'Sage', gender: 'F' });
    // 원어민 표는 그대로 (영어 이름이 찾는 이름)
    const f = { cells: { englishName: 'Berna', subject: 'Speaking' }, userId: 'u3' };
    expect(rosterRowWithAccount('foreign', 'S', f, { englishNickname: 'B' })).toEqual(f);
  });

  it('설명회 카드 영어 이름도 계정 값만', () => {
    const roster = {
      jobCodeId: 'jc', campCode: 'S29', tier: 'S' as const, foreign: [],
      mentors: [
        { cells: { role: '담임 멘토', group: 'Spring', classCode: 'S01', name: '고성모', englishName: 'Seongmo' }, userId: 'u1' },
        { cells: { role: '담임 멘토', group: 'Spring', classCode: 'S02', name: '이서경', englishName: 'SeoKyoung' }, userId: 'u2' },
      ],
    };
    const people = buildCampTeachers('jc', [
      { userId: 'u1', name: '고성모', englishNickname: 'Luka', role: 'mentor' },
      { userId: 'u2', name: '이서경', role: 'mentor' },
    ] as never, roster);
    expect(people.map((p) => p.englishName)).toEqual(['Luka', '']);
  });
});
