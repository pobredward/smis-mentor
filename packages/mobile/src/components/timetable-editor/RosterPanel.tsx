/**
 * 반·이름 (이 그룹 모든 Day) — 반 목록(반번호·순서·추가·삭제·시트 붙여넣기), 담임·역할 이름 덮어쓰기,
 * 그리고 캠프 전체가 함께 쓰는 반 정보(반이름·강의실·교재·Spare).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import {
  booksFor,
  firstName,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampClassInfo,
  type EslBookList,
  type TimetableClassColumn,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { Btn, C, IconBtn, Input, Notice, ScopeBadge, SectionHead, nextClassCode, squash, staffRolesOf, u, type SetWs } from './common';

export function RosterPanel({
  ws,
  setWs,
  group,
  campCode,
  fallback,
  teacherByClassCode,
  staffByRole,
  groupSubjects,
  books,
  focusClass,
  onDone,
}: {
  ws: W.Workspace;
  setWs: SetWs;
  group: string;
  campCode: string;
  /** 앱 배정에서 온 이 그룹 반 (공통·표가 없을 때) */
  fallback: TimetableClassColumn[];
  teacherByClassCode: Record<string, string>;
  staffByRole: Record<string, string>;
  /** 이 그룹 표들의 과목 (역할 이름 목록용) */
  groupSubjects: TimetableSubject[];
  books?: EslBookList;
  focusClass?: string | null;
  onDone: (msg: string) => void;
}) {
  const classes = W.groupClasses(ws, group, fallback);
  const common = ws.cur.common[W.commonKeyOf(ws, group)] ?? {};
  const roles = staffRolesOf(groupSubjects, staffByRole);
  const infoOf = (code: string): CampClassInfo => ws.cur.classInfo[code] ?? {};

  const setClasses = (next: TimetableClassColumn[]) => setWs((w) => W.setGroupClasses(w, group, next));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= classes.length) return;
    const next = [...classes];
    [next[i], next[j]] = [next[j], next[i]];
    setClasses(next);
  };
  const remove = (code: string) => {
    const n = W.tablesUsingClass(ws, group, code);
    Alert.alert('반 삭제', n ? `${code} 반을 지우면 표 ${n}장에서 이 반 칸이 사라집니다. 지울까요?` : `${code} 반을 지울까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => setClasses(classes.filter((c) => c.classCode !== code)) },
    ]);
  };
  const rename = (from: string, to: string) => {
    const nc = to.trim();
    if (!nc || nc === from) return;
    let changed = false;
    setWs((w) => {
      const next = W.renameClassCode(w, group, from, nc);
      changed = next !== w;
      return next;
    });
    if (!changed) Alert.alert('반번호', `${nc} 는 이 그룹에 이미 있는 반번호입니다.`);
  };
  const setTeacher = (code: string, name: string) =>
    setWs((w) =>
      W.editCommon(
        w,
        group,
        (v) => {
          const base = v.classes?.length ? v.classes : W.groupClasses(w, group, fallback).map((c) => ({ ...c }));
          v.classes = base.map((c) => (c.classCode === code ? { ...c, teacherName: name || undefined } : c));
        },
        `teacher:${code}`
      )
    );
  const setStaff = (role: string, name: string) =>
    setWs((w) =>
      W.editCommon(
        w,
        group,
        (v) => {
          const next = { ...(v.staffOverrides ?? {}) };
          if (name) next[role] = name;
          else delete next[role];
          v.staffOverrides = next;
        },
        `staff:${role}`
      )
    );
  const setInfo = (code: string, field: keyof CampClassInfo, value: string) =>
    setWs((w) => W.setClassInfo(w, code, { ...(w.cur.classInfo[code] ?? {}), [field]: value }, field));

  /**
   * 시트에서 복사한 값(탭·줄바꿈)을 붙여넣으면 아래 반까지 채운다 — 기존 편집기 방식 그대로.
   * 칸 순서: 반번호 · 강의실 · 반이름 · 교재 · Spare
   * @returns 표로 처리했으면 true
   */
  const paste = (row: number, col: number, text: string): boolean => {
    const grid = D.parseClipboardTable(text);
    if (!grid) return false;
    const rows = grid.slice(0, 30);
    setWs((w0) => {
      let w = w0;
      let list = [...W.groupClasses(w, group, fallback)];
      // 모자란 반은 새로 만든다
      if (row + rows.length > list.length) {
        while (list.length < row + rows.length) list.push({ classCode: nextClassCode(list, campCode) });
        w = W.setGroupClasses(w, group, list);
      }
      rows.forEach((cells, r) => {
        const i = row + r;
        cells.forEach((value, ci) => {
          const field = D.CLASS_PASTE_FIELDS[col + ci];
          if (!field || !value) return;
          list = W.groupClasses(w, group, fallback);
          const code = list[i]?.classCode;
          if (!code) return;
          if (field === 'classCode') w = W.renameClassCode(w, group, code, value);
          else w = W.setClassInfo(w, code, { ...(w.cur.classInfo[code] ?? {}), [field]: value });
        });
      });
      return squash(w0, w);
    });
    onDone(`${rows.length}개 반에 붙여넣었습니다`);
    return true;
  };

  return (
    <View>
      <SectionHead
        title={`반 (${classes.length})`}
        scope="이 그룹 모든 Day"
        right={<Btn label="+ 반 추가" onPress={() => setClasses([...classes, { classCode: nextClassCode(classes, campCode) }])} />}
      />
      <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>
        반번호·순서·담임 이름은 {group} 의 모든 Day 표가 함께 씁니다. 관리시트에서 여러 칸을 복사해 붙여넣으면 아래 반까지 채워집니다.
      </Text>
      {!classes.length && <Notice tone="amber" text="이 그룹에 반이 없습니다. [+ 반 추가] 로 넣거나, 관리자 > 지원 유저 관리에서 반번호를 배정하세요." />}

      {classes.map((c, i) => {
        const assigned = teacherByClassCode[c.classCode];
        const manual = common.classes?.find((x) => x.classCode === c.classCode)?.teacherName ?? '';
        const info = infoOf(c.classCode);
        const set = booksFor(books, info.bookCode);
        const unknownBook = !!info.bookCode?.trim() && !!books && !set;
        const focused = focusClass === c.classCode;
        return (
          <View key={`${c.classCode}-${i}`} style={[s.card, focused && s.cardFocus]}>
            <View style={u.row}>
              <CodeInput value={c.classCode} onCommit={(to) => rename(c.classCode, to)} onPaste={(v) => paste(i, 0, v)} />
              <View style={{ flex: 1 }} />
              <IconBtn name="arrow-up" disabled={i === 0} onPress={() => move(i, -1)} />
              <IconBtn name="arrow-down" disabled={i === classes.length - 1} onPress={() => move(i, 1)} />
              <IconBtn name="close" onPress={() => remove(c.classCode)} />
            </View>
            <View style={[u.row, { marginTop: 6 }]}>
              <Text style={s.lbl}>담임</Text>
              <Input
                value={manual}
                onChangeText={(v) => setTeacher(c.classCode, v)}
                placeholder={assigned || '담임 미배정'}
                manual={!!manual.trim()}
                style={{ flex: 1 }}
              />
              {!!manual.trim() && <Text style={s.tag}>직접</Text>}
            </View>
            <View style={[u.row, { marginTop: 8 }]}>
              <ScopeBadge scope="캠프 전체" />
              <Text style={s.infoHint}>반 정보</Text>
            </View>
            <View style={[u.row, { marginTop: 6 }]}>
              <Input
                value={info.className ?? ''}
                onChangeText={(v) => !paste(i, 2, v) && setInfo(c.classCode, 'className', v)}
                placeholder="반이름 (Grit)"
                style={{ flex: 1.3 }}
              />
              <Input
                value={info.classroom ?? ''}
                onChangeText={(v) => !paste(i, 1, v) && setInfo(c.classCode, 'classroom', v)}
                placeholder="강의실"
                style={{ flex: 1 }}
              />
            </View>
            <View style={[u.row, { marginTop: 6 }]}>
              <Input
                value={info.bookCode ?? ''}
                onChangeText={(v) => !paste(i, 3, v) && setInfo(c.classCode, 'bookCode', v)}
                placeholder="교재"
                invalid={unknownBook}
                autoCapitalize="none"
                style={{ width: 70 }}
              />
              <Input
                value={info.spareBookCode ?? ''}
                onChangeText={(v) => !paste(i, 4, v) && setInfo(c.classCode, 'spareBookCode', v)}
                placeholder="Spare"
                autoCapitalize="none"
                style={{ width: 70 }}
              />
              <Text style={s.bookHint} numberOfLines={2}>
                {set ? [set.speaking, set.reading, set.writing].filter(Boolean).join(' / ') || '교재 없음' : unknownBook ? '리스트에 없는 코드' : ''}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={{ height: 8 }} />
      <SectionHead title="역할 이름 덮어쓰기" scope="이 그룹 모든 Day" />
      <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>비워 두면 앱 배정 이름을 씁니다. 직접 넣은 이름은 앱과 연동되지 않습니다.</Text>
      {roles.map((r) => {
        const manual = common.staffOverrides?.[r.key] ?? '';
        return (
          <View key={r.key} style={[u.row, { marginBottom: 6 }]}>
            <Text style={s.roleLbl} numberOfLines={1}>
              {r.label}
            </Text>
            <Input
              value={manual}
              onChangeText={(v) => setStaff(r.key, v)}
              placeholder={firstName(staffByRole[r.key]) || '미배정'}
              manual={!!manual.trim()}
              style={{ flex: 1 }}
            />
            {!!manual.trim() && <Text style={s.tag}>직접</Text>}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 반번호 입력 — 쓰는 동안은 화면에만, 입력을 마치면(blur) 그룹의 모든 표·반 정보와 함께 바꾼다.
 * 시트에서 여러 칸을 붙여넣으면 onPaste 가 받는다.
 */
function CodeInput({ value, onCommit, onPaste }: { value: string; onCommit: (v: string) => void; onPaste: (text: string) => boolean }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const pasted = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const finish = () => {
    if (pasted.current) {
      pasted.current = false;
      setText(value);
      return;
    }
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else setText(value);
  };
  return (
    <Input
      value={text}
      autoCapitalize="characters"
      onFocus={() => {
        focused.current = true;
      }}
      onChangeText={(v) => {
        if (onPaste(v)) {
          pasted.current = true;
          return;
        }
        setText(v);
      }}
      onBlur={() => {
        focused.current = false;
        finish();
      }}
      style={s.code}
    />
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 9, marginBottom: 8, backgroundColor: '#fff' },
  cardFocus: { borderColor: C.blue, backgroundColor: C.blueBg },
  code: { width: 76, fontWeight: '700' },
  lbl: { width: 30, fontSize: 11, color: C.muted },
  roleLbl: { width: 110, fontSize: 11.5, color: C.muted, fontWeight: '500' },
  tag: { fontSize: 10, color: C.muted },
  infoHint: { fontSize: 11, color: C.faint },
  bookHint: { flex: 1, fontSize: 10, color: C.faint },
});
