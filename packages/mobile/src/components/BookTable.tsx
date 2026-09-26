import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import {
  booksFor,
  classNameLabel,
  subjectTint,
  type CampClassInfo,
  type EslBookList,
  type TimetableClassColumn,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { L } from '@smis-mentor/shared';

interface Props {
  classes: TimetableClassColumn[];
  classInfo: Record<string, CampClassInfo>;
  books: EslBookList | undefined;
  /** 시간표의 과목 목록 — 줄 배경을 그 과목 색으로 맞추는 데 쓴다 */
  subjects?: TimetableSubject[];
  isForeign?: boolean;
}

const LABEL_W = 56;
const MIN_COL_W = 52;
const OUTER = 26;
const ROW_H = 24;

const ROWS = [
  { key: 'speaking' as const, label: 'Speaking' },
  { key: 'reading' as const, label: 'Reading' },
  { key: 'writing' as const, label: 'Writing' },
];

/**
 * 반별 교재표 (web 과 같은 규칙).
 * 반에는 코드만 붙어 있고 교재 3권은 교재 리스트에서 조회한다.
 */
export function BookTable({ classes, classInfo, books, subjects, isForeign = false }: Props) {
  // 시간표 칸과 같은 색을 연하게 깔아 어느 과목 줄인지 바로 보이게
  const tint = (key: string, amount?: number) => subjectTint(subjects, key, amount);
  const { width: screenW } = useWindowDimensions();

  const codeOf = (c: TimetableClassColumn) => classInfo[c.classCode]?.bookCode?.trim() ?? '';
  const spareOf = (c: TimetableClassColumn) => classInfo[c.classCode]?.spareBookCode?.trim() ?? '';

  if (!classes.some((c) => codeOf(c) || spareOf(c))) return null;

  const hasSpare = classes.some((c) => spareOf(c));
  const colW = Math.max(
    MIN_COL_W,
    Math.floor((Math.max(280, screenW - OUTER) - LABEL_W) / Math.max(1, classes.length))
  );
  const font = colW >= 68 ? 10 : 9;

  const bookCell = (code: string, field: 'speaking' | 'reading' | 'writing', muted?: boolean) => {
    if (!code) return '미정';
    const set = booksFor(books, code);
    if (!set) return '?';
    return set[field] || '—';
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>{L('schedule.books')}</Text>
        <Text style={s.hint}>{L('schedule.byLevelCode')}</Text>
      </View>

      <View style={s.card}>
        {/* 헤더 */}
        <View style={s.row}>
          <View style={[s.labelCell, { width: LABEL_W }]}>
            <Text style={s.labelText}>{L('schedule.code')}</Text>
          </View>
          {classes.map((c) => {
            const info = classInfo[c.classCode];
            return (
              <View key={c.classCode} style={[s.headCell, { width: colW }]}>
                <Text style={[s.headCode, { fontSize: font + 1 }]} numberOfLines={1}>
                  {c.classCode}
                </Text>
                {!!info?.className && (
                  <Text style={[s.headName, { fontSize: font - 1 }]} numberOfLines={1}>
                    {classNameLabel(info.className)}
                  </Text>
                )}
                <Text style={[s.code, { fontSize: font }]} numberOfLines={1}>
                  {codeOf(c) || L('lodging.tbd')}
                </Text>
              </View>
            );
          })}
        </View>

        {ROWS.map((row) => (
          <View key={row.key} style={s.row}>
            <View
              style={[s.labelCell, { width: LABEL_W, height: ROW_H }, { backgroundColor: tint(row.label) }]}
            >
              <Text style={s.labelText}>{row.label}</Text>
            </View>
            {classes.map((c) => (
              <View
                key={c.classCode}
                style={[s.cell, { width: colW, height: ROW_H }, { backgroundColor: tint(row.label) }]}
              >
                <Text style={[s.cellText, { fontSize: font }]} numberOfLines={1}>
                  {bookCell(codeOf(c), row.key)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {hasSpare && (
          <>
            <View style={s.row}>
              <View style={[s.labelCell, { width: LABEL_W, height: ROW_H }]}>
                <Text style={s.labelText}>Spare</Text>
              </View>
              {classes.map((c) => (
                <View key={c.classCode} style={[s.cell, { width: colW, height: ROW_H }]}>
                  <Text style={[s.code, { fontSize: font }]} numberOfLines={1}>
                    {spareOf(c) || L('lodging.tbd')}
                  </Text>
                </View>
              ))}
            </View>
            {ROWS.map((row) => (
              <View key={`spare-${row.key}`} style={s.row}>
                <View
                  style={[
                    s.labelCell,
                    { width: LABEL_W, height: ROW_H },
                    { backgroundColor: tint(row.label, 0.75) },
                  ]}
                >
                  <Text style={[s.labelText, s.dim]}>{row.label}</Text>
                </View>
                {classes.map((c) => (
                  <View
                    key={c.classCode}
                    style={[s.cell, { width: colW, height: ROW_H }, { backgroundColor: tint(row.label, 0.75) }]}
                  >
                    <Text style={[s.cellText, s.dim, { fontSize: font }]} numberOfLines={1}>
                      {bookCell(spareOf(c), row.key)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </View>

      {classes.some((c) => {
        const code = codeOf(c) || spareOf(c);
        return code && !booksFor(books, code);
      }) && <Text style={s.warn}>{L('content.someCodesAreNotIn')}</Text>}
    </View>
  );
}

const BORDER = '#e5e7eb';

const s = StyleSheet.create({
  wrap: { marginTop: 20 },
  head: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', color: '#111827' },
  hint: { marginLeft: 6, fontSize: 10, color: '#9ca3af' },

  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row' },

  labelCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  labelText: { fontSize: 9.5, color: '#6b7280' },

  headCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headCode: { fontWeight: '700', color: '#111827' },
  headName: { color: '#374151' },
  code: { color: '#1d4ed8', fontWeight: '600', textAlign: 'center' },

  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cellText: { color: '#111827', textAlign: 'center' },
  dim: { color: '#9ca3af' },

  warn: { marginTop: 6, fontSize: 10, color: '#d97706' },
});

export default BookTable;
