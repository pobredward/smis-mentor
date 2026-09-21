import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  LODGING_PLACE_COLORS,
  LODGING_PLACE_KIND_LABEL,
  LODGING_PURPOSES,
  lodgingPurposeColor,
  lodgingRoomColor,
  lodgingRoomTone,
  occupantFilterValue,
  LODGING_FILTER_EMPTY_LABEL,
  type LodgingFilterKey,
  type LodgingOccupant,
  type LodgingPlaceSetting,
  type LodgingPlaceView,
  type LodgingRoomSetting,
  type LodgingRoomView,
} from '@smis-mentor/shared';

export type LodgingTarget = { kind: 'room'; room: LodgingRoomView } | { kind: 'place'; place: LodgingPlaceView };

interface Props {
  target: LodgingTarget | null;
  isAdmin: boolean;
  isForeign: boolean;
  /** 명단 표에 같이 보여 줄 열 — 그룹별·공항별을 열어 두면 */
  columns?: LodgingFilterKey[];
  memberNames: string[];
  saving: boolean;
  onClose: () => void;
  onStudent?: (student: LodgingOccupant, room: LodgingRoomView) => void;
  onSaveRoom: (num: string, setting: LodgingRoomSetting) => Promise<void>;
  onSavePlace: (id: string, setting: LodgingPlaceSetting) => Promise<void>;
}

/** 방·장소 상세 — 아래에서 올라오는 시트. 명단은 시트에서, 용도·선생님은 관리자가 여기서 */
export function LodgingRoomSheet({
  target,
  isAdmin,
  isForeign,
  columns,
  memberNames,
  saving,
  onClose,
  onStudent,
  onSaveRoom,
  onSavePlace,
}: Props) {
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fill}>
        {/* 바깥(어두운 곳)을 누르면 닫힌다 — 화면 전체를 덮는 판을 카드 뒤에 깔고,
            카드를 가운데 두는 층은 빈 곳의 터치를 그 판으로 흘려보낸다 (box-none) */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.sheet}>
          {target?.kind === 'room' && (
            <RoomBody
              room={target.room}
              isAdmin={isAdmin}
              isForeign={isForeign}
              columns={columns}
              memberNames={memberNames}
              saving={saving}
              onClose={onClose}
              onStudent={onStudent}
              onSave={onSaveRoom}
            />
          )}
          {target?.kind === 'place' && (
            <PlaceBody place={target.place} isAdmin={isAdmin} saving={saving} onClose={onClose} onSave={onSavePlace} />
          )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function RoomBody({
  room,
  isAdmin,
  isForeign,
  columns,
  memberNames,
  saving,
  onClose,
  onStudent,
  onSave,
}: {
  room: LodgingRoomView;
  isAdmin: boolean;
  isForeign: boolean;
  /** 명단 표에 같이 보여 줄 열 — 그룹별·공항별을 열어 두면 */
  columns?: LodgingFilterKey[];
  memberNames: string[];
  saving: boolean;
  onClose: () => void;
  onStudent?: (student: LodgingOccupant, room: LodgingRoomView) => void;
  onSave: (num: string, setting: LodgingRoomSetting) => Promise<void>;
}) {
  const c = lodgingRoomColor(room);
  const [editing, setEditing] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [label, setLabel] = useState('');
  const [teachers, setTeachers] = useState<string[]>([]);
  const [teacherInput, setTeacherInput] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => setEditing(false), [room.num]);

  const startEdit = () => {
    setPurpose(room.settingPurpose ?? '');
    setLabel(room.label ?? '');
    setTeachers(room.teachers);
    setTeacherInput('');
    setNote(room.settingNote ?? '');
    setEditing(true);
  };
  const addTeacher = (name: string) => {
    const n = name.trim();
    if (!n || teachers.includes(n)) return;
    setTeachers([...teachers, n]);
    setTeacherInput('');
  };
  const candidates = memberNames.filter((n) => !teachers.includes(n) && (!teacherInput || n.includes(teacherInput)));

  return (
    <>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={styles.headRow}>
            <Text style={styles.num}>{room.num}</Text>
            <View style={[styles.badge, { backgroundColor: c.bg }]}>
              <Text style={[styles.badgeText, { color: c.ink }]}>{lodgingRoomTone(room)}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {room.wing === 'main' ? '본관' : '별관'} {room.floor}층
            {room.label ? ` · ${room.label}` : ''}
            {room.note ? ` · ${room.note}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {(room.teachers.length > 0 || (room.unitMentor && room.students.length > 0)) && (
          <View style={styles.kv}>
            {room.teachers.length > 0 && (
              <Text style={styles.kvText}>
                <Text style={styles.kvKey}>{isForeign ? 'Teachers  ' : '선생님  '}</Text>
                {room.teachers.join(', ')}
              </Text>
            )}
            {!!room.unitMentor && room.students.length > 0 && (
              <Text style={styles.kvText}>
                <Text style={styles.kvKey}>{isForeign ? 'Unit mentor  ' : '유닛 멘토  '}</Text>
                {room.unitMentor}
              </Text>
            )}
          </View>
        )}
        {!!room.settingNote && <Text style={styles.note}>{room.settingNote}</Text>}

        {room.students.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.thText, { flex: 2 }]}>{isForeign ? 'Name' : '이름'}</Text>
              <Text style={[styles.td, styles.thText]}>{isForeign ? 'Grade' : '학년'}</Text>
              <Text style={[styles.td, styles.thText, { flex: 1.4 }]}>{isForeign ? 'Class' : '반'}</Text>
              <Text style={[styles.td, styles.thText, { flex: 1.4 }]}>{isForeign ? 'Mentor' : '담임'}</Text>
            </View>
            {room.students.map((s) => (
              <TouchableOpacity
                key={s.studentId + s.rowNumber}
                style={styles.tr}
                disabled={!onStudent}
                onPress={() => onStudent?.(s, room)}
              >
                <View style={{ flex: 2 }}>
                  <Text style={[styles.td, { color: '#111827' }]} numberOfLines={1}>
                    {s.name}
                    {s.englishName ? <Text style={styles.eng}>  {s.englishName}</Text> : null}
                  </Text>
                  {(columns ?? []).length > 0 && (
                    <Text style={styles.subLine} numberOfLines={1}>
                      {(columns ?? [])
                        .map((k) => (k === 'airport' ? s.departureGroup || occupantFilterValue(s, k) : occupantFilterValue(s, k)) || LODGING_FILTER_EMPTY_LABEL[k])
                        .join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={styles.td}>{s.grade}</Text>
                <Text style={[styles.td, { flex: 1.4 }]} numberOfLines={1}>
                  {s.className || s.classNumber}
                </Text>
                <Text style={[styles.td, { flex: 1.4 }]} numberOfLines={1}>
                  {s.classMentor}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>{isForeign ? 'No students in this room.' : '시트에 이 방으로 배정된 학생이 없습니다.'}</Text>
        )}


        {isAdmin && !editing && (
          <TouchableOpacity style={styles.darkBtn} onPress={startEdit}>
            <Text style={styles.darkBtnText}>용도·선생님 편집</Text>
          </TouchableOpacity>
        )}

        {isAdmin && editing && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>용도</Text>
            <View style={styles.chips}>
              <Chip on={purpose === ''} onPress={() => setPurpose('')} label="자동" />
              {LODGING_PURPOSES.filter((p) => p !== '빈방').map((p) => (
                <Chip key={p} on={purpose === p} onPress={() => setPurpose(p)} label={p} />
              ))}
            </View>
            <TextInput
              value={purpose}
              onChangeText={setPurpose}
              placeholder="직접 입력 (비우면 자동: 명단 있으면 학생방)"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>
              칸에 찍히는 한 줄 <Text style={styles.hint}>예: Middle · Speaking</Text>
            </Text>
            <TextInput value={label} onChangeText={setLabel} style={styles.input} />
            <Text style={styles.fieldLabel}>선생님 (이 방에 묵는 사람)</Text>
            {teachers.length > 0 && (
              <View style={styles.chips}>
                {teachers.map((t) => (
                  <Chip key={t} on onPress={() => setTeachers(teachers.filter((x) => x !== t))} label={`${t} ✕`} />
                ))}
              </View>
            )}
            <TextInput
              value={teacherInput}
              onChangeText={setTeacherInput}
              onSubmitEditing={() => addTeacher(teacherInput)}
              placeholder="이름 입력 후 완료, 또는 아래에서 고르기"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              blurOnSubmit={false}
            />
            {candidates.length > 0 && (
              <View style={styles.chips}>
                {candidates.slice(0, 30).map((n) => (
                  <Chip key={n} on={false} onPress={() => addTeacher(n)} label={`+ ${n}`} />
                ))}
              </View>
            )}
            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.multi]} multiline />
            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(false)} disabled={saving}>
                <Text style={styles.ghostBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.5 }]}
                disabled={saving}
                onPress={async () => {
                  await onSave(room.num, { purpose, label, teachers, note });
                  setEditing(false);
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>저장</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function PlaceBody({
  place,
  isAdmin,
  saving,
  onClose,
  onSave,
}: {
  place: LodgingPlaceView;
  isAdmin: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, setting: LodgingPlaceSetting) => Promise<void>;
}) {
  const c = LODGING_PLACE_COLORS[place.kind] ?? LODGING_PLACE_COLORS.etc;
  const [editing, setEditing] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => setEditing(false), [place.id]);
  return (
    <>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={styles.headRow}>
            <Text style={styles.placeName}>{place.name}</Text>
            <View style={[styles.badge, { backgroundColor: c.bg }]}>
              <Text style={[styles.badgeText, { color: c.ink }]}>{LODGING_PLACE_KIND_LABEL[place.kind]}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            지하 1층{place.area ? ` · ${place.area}㎡` : ''}
            {place.cap ? ` · ${place.cap}명 수용` : ''}
            {place.purpose ? ` · ${place.purpose}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {place.settingNote ? (
          <Text style={styles.note}>{place.settingNote}</Text>
        ) : (
          <Text style={styles.empty}>
            {place.kind === 'hall' ? '강당·홀 — 전체 집합이나 야외수업조 편성에 씁니다.' : '시설 — 명단은 없습니다.'}
          </Text>
        )}
        {isAdmin && !editing && (
          <TouchableOpacity
            style={styles.darkBtn}
            onPress={() => {
              setPurpose(place.purpose ?? '');
              setNote(place.settingNote ?? '');
              setEditing(true);
            }}
          >
            <Text style={styles.darkBtnText}>이 캠프에서의 용도 편집</Text>
          </TouchableOpacity>
        )}
        {isAdmin && editing && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>
              용도 <Text style={styles.hint}>예: 전체 집합, 원어민 수업</Text>
            </Text>
            <TextInput value={purpose} onChangeText={setPurpose} style={styles.input} />
            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.multi]} multiline />
            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(false)} disabled={saving}>
                <Text style={styles.ghostBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.5 }]}
                disabled={saving}
                onPress={async () => {
                  await onSave(place.id, { purpose, note });
                  setEditing(false);
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>저장</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Chip({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'box-none' },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    maxHeight: '84%',
    paddingBottom: 8,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  num: { fontSize: 24, fontWeight: '800', color: '#111827', fontVariant: ['tabular-nums'] },
  placeName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  close: { padding: 4 },
  closeText: { fontSize: 16, color: '#9ca3af' },
  body: { paddingHorizontal: 16, paddingTop: 10 },
  kv: { marginBottom: 8, gap: 2 },
  kvText: { fontSize: 13, color: '#111827' },
  kvKey: { color: '#6b7280' },
  note: { backgroundColor: '#fffbeb', color: '#92400e', fontSize: 12, padding: 8, borderRadius: 6, marginBottom: 8 },
  table: { marginBottom: 12 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  th: { borderTopWidth: 0, paddingVertical: 4 },
  td: { flex: 1, fontSize: 13, color: '#4b5563' },
  thText: { fontSize: 10, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eng: { fontSize: 11, color: '#9ca3af' },
  subLine: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  empty: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  ghostBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8, flex: 1 },
  ghostBtnText: { fontSize: 13, color: '#374151' },
  darkBtn: { backgroundColor: '#111827', borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  darkBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center', flex: 1, marginBottom: 8 },
  primaryBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  form: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4b5563', marginTop: 4 },
  hint: { fontWeight: '400', color: '#9ca3af' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, backgroundColor: '#fff', color: '#111827' },
  multi: { minHeight: 60, textAlignVertical: 'top' },
  formBtns: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
