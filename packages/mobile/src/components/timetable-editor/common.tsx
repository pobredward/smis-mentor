/**
 * 시간표 통합 편집기(모바일) 공용 — 작은 UI 조각과 도우미.
 * 편집기 안의 바텀시트·패널이 같은 모양을 쓰도록 여기 한 군데에 둔다.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SUBJECTS,
  ROTATION_COLORS,
  monthDayLabel,
  timetableWorkspace as W,
  type CampTimetable,
  type SubjectPartner,
  type TimetableClassColumn,
  type TimetableSubject,
} from '@smis-mentor/shared';

// ─── 타입 ────────────────────────────────────────────────────────────

/** 지금 표 고치기 — 빈 뼈대면 처음 고칠 때 새 표가 생긴다. key 를 주면 같은 입력칸 연속 수정이 되돌리기 한 번 */
export type EditTable = (fn: (t: CampTimetable) => void, key?: string) => void;
/** 작업 공간 고치기 — fn 은 바로(동기) 불린다 */
export type SetWs = (fn: (w: W.Workspace) => W.Workspace) => void;

export type Scope = '캠프 전체' | '이 그룹 모든 Day' | '이 표만';

// ─── 색 ──────────────────────────────────────────────────────────────

export const C = {
  text: '#111827',
  text2: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  lineStrong: '#d1d5db',
  bg: '#f9fafb',
  bg2: '#f3f4f6',
  blue: '#2563eb',
  blueBg: '#eff6ff',
  blueLine: '#bfdbfe',
  blueText: '#1d4ed8',
  orange: '#f59e0b',
  red: '#dc2626',
  redBg: '#fef2f2',
  redLine: '#fecaca',
  amberBg: '#fffbeb',
  amberLine: '#fde68a',
  amberText: '#b45309',
};

/** 과목·줄 색 견본 — 기본 과목 색 + 로테이션 색 + 회색 */
export const COLOR_CHOICES = [
  ...new Set([...DEFAULT_SUBJECTS.map((s) => s.color ?? ''), ...ROTATION_COLORS, '#f3f4f6', '#e5e7eb', '#fefcc4']),
].filter(Boolean);

// ─── 도우미 ──────────────────────────────────────────────────────────

/** 아래 칸 규칙 — 사람 말 */
export const PARTNER_OPTIONS: Array<{ key: SubjectPartner; label: string; sub: string }> = [
  { key: 'foreign', label: '원어민 수업', sub: '아래 칸에 이 과목 원어민 이름' },
  { key: 'pattern', label: 'Pattern', sub: '아래 칸이 다른 수업 (Pattern)' },
  { key: 'owner', label: '주제 담당 담임(돌아감)', sub: '아래 칸에 정한 반의 담임 — 주제와 함께 이동' },
  { key: 'ownTeacher', label: '그 반 담임', sub: '아래 칸에 그 반 담임 이름' },
  { key: 'staff', label: '칸에 담당자 이름', sub: '과목 이름 없이 담당자 이름만' },
  { key: 'none', label: '없음', sub: '아래 칸 없음' },
];
export const partnerLabel = (p: SubjectPartner | undefined) => PARTNER_OPTIONS.find((o) => o.key === (p ?? 'none'))?.label ?? '없음';

/** 이름을 붙일 수 있는 역할 — 수업(Pattern) · 과목의 원어민 · staff 역할 · 이 그룹에 실제 배정된 역할 */
export function staffRolesOf(
  subjects: TimetableSubject[],
  staffByRole: Record<string, string> = {}
): Array<{ key: string; label: string }> {
  const out = [{ key: '수업', label: '수업(Pattern)' }];
  subjects.forEach((x) => {
    if (x.partner === 'foreign') out.push({ key: x.key.toLowerCase(), label: `${x.key} 원어민` });
    if (x.partner === 'staff' && x.roleKey) out.push({ key: x.roleKey.toLowerCase(), label: `${x.roleKey} 담당` });
  });
  Object.keys(staffByRole).forEach((k) => out.push({ key: k.toLowerCase(), label: k }));
  return out.filter((r, i, a) => !!r.key && a.findIndex((y) => y.key === r.key) === i);
}

export const subjectsOf = (t: Pick<CampTimetable, 'subjects'> | null | undefined): TimetableSubject[] =>
  t?.subjects?.length ? t.subjects : DEFAULT_SUBJECTS;

export const datesText = (dates: string[] | undefined) => (dates ?? []).map(monthDayLabel).join(', ');

/**
 * 여러 번 고친 결과를 되돌리기 한 번으로 묶는다 (가져오기·붙여넣기처럼 한 동작이 여러 변경일 때).
 * 공용 Workspace 의 past 를 직접 다루므로 shared 에 W.batch 같은 함수로 옮기면 좋다.
 */
export function squash(start: W.Workspace, end: W.Workspace): W.Workspace {
  if (start === end || start.cur === end.cur) return end;
  return { ...end, past: [...start.past, start.cur].slice(-100), future: [], lastKey: null, lastAt: 0 };
}

/** 이 그룹에 없는 다음 반번호 (J01, J02 …) */
export function nextClassCode(classes: TimetableClassColumn[], campCode: string): string {
  const prefix = campCode.slice(0, 1) || 'C';
  const taken = new Set(classes.map((c) => c.classCode));
  for (let n = classes.length + 1; n < 200; n++) {
    const code = `${prefix}${String(n).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `${prefix}${Date.now().toString(36).slice(-3)}`;
}

/** iOS 는 모달을 닫는 중에 다른 모달을 열면 안 뜬다 — 닫힌 뒤에 연다 */
export const afterModal = (fn: () => void) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 50);

// ─── 작은 UI ─────────────────────────────────────────────────────────

/** 표가 있으면 회색 점, 이번에 바뀌었으면 주황 점 */
export function Dot({ state }: { state: 'saved' | 'changed' | null }) {
  if (!state) return null;
  return <View style={[u.dot, { backgroundColor: state === 'changed' ? C.orange : C.faint }]} />;
}

export function Chip({
  label,
  on,
  onPress,
  dot = null,
  disabled,
  dashed,
  style,
  color,
}: {
  label: string;
  on?: boolean;
  onPress?: () => void;
  dot?: 'saved' | 'changed' | null;
  disabled?: boolean;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
  /** 견본 색 — 칩 왼쪽에 작은 네모 */
  color?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[u.chip, on && u.chipOn, dashed && u.chipDashed, disabled && u.chipDisabled, style]}
    >
      {!!color && <View style={[u.swatch, { backgroundColor: color }]} />}
      <Text style={[u.chipText, on && u.chipTextOn, disabled && { color: '#d1d5db' }]} numberOfLines={1}>
        {label}
      </Text>
      <Dot state={dot} />
    </TouchableOpacity>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'default',
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'default' | 'primary' | 'danger' | 'soft';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = kind === 'primary' ? '#fff' : kind === 'danger' ? C.red : kind === 'soft' ? C.blueText : C.text2;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        u.btn,
        kind === 'primary' && u.btnPrimary,
        kind === 'danger' && u.btnDanger,
        kind === 'soft' && u.btnSoft,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {!!icon && <Ionicons name={icon} size={13} color={color} style={{ marginRight: 3 }} />}
      <Text style={[u.btnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconBtn({
  name,
  onPress,
  disabled,
  color = C.muted,
  size = 16,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[u.iconBtn, disabled && { opacity: 0.25 }]} hitSlop={6}>
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

export function ScopeBadge({ scope }: { scope: Scope }) {
  const camp = scope === '캠프 전체';
  const group = scope === '이 그룹 모든 Day';
  return (
    <View style={[u.scope, camp ? u.scopeCamp : group ? u.scopeGroup : u.scopeTable]}>
      <Text style={[u.scopeText, { color: camp ? '#7c3aed' : group ? C.blueText : C.muted }]}>{scope}</Text>
    </View>
  );
}

export function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: 10 }, style]}>
      <Text style={u.label}>{label}</Text>
      {children}
      {!!hint && <Text style={u.hint}>{hint}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps & { manual?: boolean; invalid?: boolean }) {
  const { style, manual, invalid, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={C.faint}
      {...rest}
      style={[u.input, manual && u.inputManual, invalid && u.inputInvalid, style]}
    />
  );
}

/** 섹션 제목 줄 */
export function SectionHead({ title, scope, right }: { title: string; scope?: Scope; right?: React.ReactNode }) {
  return (
    <View style={u.sectionHead}>
      <Text style={u.sectionTitle}>{title}</Text>
      {!!scope && <ScopeBadge scope={scope} />}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** 안내 상자 */
export function Notice({ text, tone = 'blue' }: { text: string; tone?: 'blue' | 'amber' | 'gray' }) {
  return (
    <View style={[u.notice, tone === 'amber' ? u.noticeAmber : tone === 'gray' ? u.noticeGray : null]}>
      <Text style={[u.noticeText, tone === 'amber' ? { color: C.amberText } : tone === 'gray' ? { color: C.muted } : null]}>{text}</Text>
    </View>
  );
}

/** 세그먼트 — GuideAudienceTabs 와 같은 모양 */
export function Seg<K extends string>({
  items,
  value,
  onChange,
  style,
  stretch = true,
}: {
  items: Array<{ key: K; label: string; dot?: 'saved' | 'changed' | null }>;
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  stretch?: boolean;
}) {
  return (
    <View style={[u.seg, style]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <TouchableOpacity key={it.key} onPress={() => onChange(it.key)} style={[u.segItem, stretch && { flex: 1 }, on && u.segItemOn]}>
            <Text style={[u.segText, on && u.segTextOn]} numberOfLines={1}>
              {it.label}
            </Text>
            <Dot state={it.dot ?? null} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * 고르기 — 누르면 아래로 펼쳐지는 목록 (바텀시트 안에서도 겹치는 모달 없이 쓴다).
 */
export function InlineSelect<K extends string>({
  value,
  options,
  onChange,
  placeholder = '고르기',
  style,
}: {
  value: K | '' | undefined;
  options: Array<{ key: K | ''; label: string; sub?: string; color?: string }>;
  onChange: (k: K | '') => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.key === (value ?? ''));
  return (
    <View style={style}>
      <TouchableOpacity style={u.select} onPress={() => setOpen((v) => !v)}>
        {!!cur?.color && <View style={[u.swatch, { backgroundColor: cur.color }]} />}
        <Text style={[u.selectText, !cur && { color: C.faint }]} numberOfLines={1}>
          {cur?.label ?? placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={C.faint} />
      </TouchableOpacity>
      {open && (
        <View style={u.selectList}>
          {options.map((o) => {
            const on = o.key === (value ?? '');
            return (
              <TouchableOpacity
                key={o.key || '__none'}
                style={[u.selectItem, on && { backgroundColor: C.blueBg }]}
                onPress={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
              >
                {!!o.color && <View style={[u.swatch, { backgroundColor: o.color }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={[u.selectItemText, on && { color: C.blueText, fontWeight: '600' }]}>{o.label}</Text>
                  {!!o.sub && <Text style={u.selectItemSub}>{o.sub}</Text>}
                </View>
                {on && <Ionicons name="checkmark" size={14} color={C.blue} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * 이름 입력 — 입력하는 동안 onLive 로 바로 바꾸고(칸이 따라온다), 입력을 마치면 onDone(처음 이름, 마지막 이름).
 * 비운 채로 끝내면 원래 이름으로 돌아간다 (빈 이름이 되면 칸과의 연결이 끊기므로).
 */
export function RenameInput({
  value,
  onLive,
  onDone,
  style,
  placeholder,
  allowEmpty = false,
  autoCapitalize,
}: {
  value: string;
  onLive: (v: string) => void;
  onDone?: (from: string, to: string) => void;
  style?: TextInputProps['style'];
  placeholder?: string;
  allowEmpty?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const start = useRef(value);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      autoCapitalize={autoCapitalize}
      onFocus={() => {
        focused.current = true;
        start.current = value;
      }}
      onChangeText={(v) => {
        setText(v);
        if (allowEmpty || v.trim()) onLive(v);
      }}
      onBlur={() => {
        focused.current = false;
        if (!allowEmpty && !text.trim()) setText(value);
        onDone?.(start.current, value);
      }}
      style={style}
    />
  );
}

const HHMM = /^\d{1,2}:\d{2}$/;

/**
 * 시각 입력 — "930" · "9시30" 도 받는다. 다 쓴 시각(09:30)이거나 입력을 마칠 때 정리해서 넘긴다.
 * 쓰는 도중의 값(9:3)은 표에 넣지 않는다 — 넣으면 줄 순서가 입력 도중에 뒤집힌다.
 */
export function TimeInput({
  value,
  onCommit,
  style,
  placeholder = '09:00',
  allowEmpty = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  style?: TextInputProps['style'];
  placeholder?: string;
  /** 비워 두는 것도 값 (활동표의 끝 시각 등) */
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = (raw: string, final: boolean) => {
    if (!raw.trim()) {
      if (final && allowEmpty) {
        setBad(false);
        if (value) onCommit('');
      } else if (final) setText(value);
      return;
    }
    const n = W.normalizeTime(raw);
    if (n && (final || HHMM.test(raw.trim()))) {
      setBad(false);
      if (n !== value) onCommit(n);
      if (final) setText(n);
    } else if (final) {
      setBad(true);
      setText(value);
    }
  };
  return (
    <Input
      value={text}
      placeholder={placeholder}
      keyboardType="numbers-and-punctuation"
      onFocus={() => {
        focused.current = true;
        setBad(false);
      }}
      onChangeText={(v) => {
        setText(v);
        commit(v, false);
      }}
      onBlur={() => {
        focused.current = false;
        commit(text, true);
      }}
      onSubmitEditing={() => commit(text, true)}
      invalid={bad}
      style={[u.time, style]}
    />
  );
}

/** 색 고르기 — 견본 + hex 직접 + 없음 */
export function ColorPicker({ value, onChange, allowNone = true }: { value?: string; onChange: (c: string | undefined) => void; allowNone?: boolean }) {
  const [hex, setHex] = useState(value ?? '');
  useEffect(() => setHex(value ?? ''), [value]);
  return (
    <View style={u.colorRow}>
      {allowNone && (
        <TouchableOpacity onPress={() => onChange(undefined)} style={[u.colorSwatch, !value && u.colorOn, { backgroundColor: '#fff' }]}>
          <Ionicons name="close" size={12} color={C.faint} />
        </TouchableOpacity>
      )}
      {COLOR_CHOICES.map((c) => (
        <TouchableOpacity key={c} onPress={() => onChange(c)} style={[u.colorSwatch, { backgroundColor: c }, value?.toLowerCase() === c && u.colorOn]} />
      ))}
      <Input
        value={hex}
        onChangeText={(v) => {
          setHex(v);
          if (/^#[0-9a-f]{6}$/i.test(v.trim())) onChange(v.trim().toLowerCase());
        }}
        placeholder="#hex"
        autoCapitalize="none"
        style={u.hexInput}
      />
    </View>
  );
}

/** 바텀시트 — 칸·줄 편집, 고르기 목록 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  tall,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={u.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <SafeAreaView edges={['bottom']} style={[u.sheet, tall && { height: '88%' }]}>
            <View style={u.sheetHandle} />
            <View style={u.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={u.sheetTitle} numberOfLines={1}>
                  {title}
                </Text>
                {!!subtitle && (
                  <Text style={u.sheetSub} numberOfLines={2}>
                    {subtitle}
                  </Text>
                )}
              </View>
              <IconBtn name="close" size={20} onPress={onClose} />
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer}
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 전체 화면 대화상자 — 가져오기 · 일괄 변경 */
export function FullModal({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={u.fullHead}>
            <IconBtn name="close" size={22} color={C.text2} onPress={onClose} />
            <Text style={u.fullTitle}>{title}</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={u.fullFoot}>{footer}</View>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** 체크 줄 */
export function CheckRow({ on, label, sub, onPress }: { on: boolean; label: string; sub?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={u.checkRow} onPress={onPress}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? C.blue : C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={u.checkText}>{label}</Text>
        {!!sub && <Text style={u.checkSub}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export const u = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipDashed: { borderStyle: 'dashed' },
  chipDisabled: { backgroundColor: C.bg2, borderColor: C.bg2 },
  chipText: { fontSize: 12, color: C.text2, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  swatch: { width: 11, height: 11, borderRadius: 3, marginRight: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  btnPrimary: { backgroundColor: C.blue, borderColor: C.blue },
  btnDanger: { borderColor: C.redLine, backgroundColor: '#fff' },
  btnSoft: { borderColor: C.blueLine, backgroundColor: C.blueBg },
  btnText: { fontSize: 12, fontWeight: '600' },
  iconBtn: { padding: 6 },

  scope: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  scopeCamp: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  scopeGroup: { backgroundColor: C.blueBg, borderColor: C.blueLine },
  scopeTable: { backgroundColor: C.bg, borderColor: C.line },
  scopeText: { fontSize: 10, fontWeight: '600' },

  label: { fontSize: 11, fontWeight: '600', color: C.muted, marginBottom: 4 },
  hint: { fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: Platform.OS === 'ios' ? 8 : 5,
    fontSize: 13,
    color: C.text,
    backgroundColor: '#fff',
  },
  inputManual: { borderColor: '#6b7280' },
  inputInvalid: { borderColor: '#f87171', backgroundColor: C.redBg },
  time: { width: 66, textAlign: 'center' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.text },

  notice: { borderWidth: 1, borderColor: C.blueLine, backgroundColor: C.blueBg, borderRadius: 8, padding: 9, marginBottom: 10 },
  noticeAmber: { borderColor: C.amberLine, backgroundColor: C.amberBg },
  noticeGray: { borderColor: C.line, backgroundColor: C.bg },
  noticeText: { fontSize: 11.5, color: '#1e40af', lineHeight: 16 },

  seg: { flexDirection: 'row', backgroundColor: C.bg2, borderRadius: 8, padding: 2 },
  segItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6 },
  segItemOn: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: 12, fontWeight: '600', color: C.muted },
  segTextOn: { color: C.text },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: '#fff',
    gap: 4,
  },
  selectText: { flex: 1, fontSize: 13, color: C.text },
  selectList: { borderWidth: 1, borderColor: C.line, borderRadius: 8, marginTop: 4, backgroundColor: '#fff', overflow: 'hidden' },
  selectItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.bg2 },
  selectItemText: { fontSize: 13, color: C.text },
  selectItemSub: { fontSize: 10.5, color: C.faint, marginTop: 1 },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  colorSwatch: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  colorOn: { borderWidth: 2, borderColor: C.blue },
  hexInput: { width: 84, paddingVertical: 4, fontSize: 12 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 14, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  sheetSub: { fontSize: 11.5, color: C.muted, marginTop: 1 },

  fullHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  fullTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  fullFoot: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff' },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7 },
  checkText: { fontSize: 13, color: C.text },
  checkSub: { fontSize: 11, color: C.faint, marginTop: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 11, marginBottom: 10, backgroundColor: '#fff' },
  divider: { height: 1, backgroundColor: C.bg2, marginVertical: 10 },
});
