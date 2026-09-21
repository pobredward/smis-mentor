'use client';

import { useEffect, useState } from 'react';
import {
  LODGING_PLACE_COLORS,
  LODGING_PLACE_KIND_LABEL,
  LODGING_PURPOSES,
  lodgingPurposeColor,
  lodgingRoomColor,
  lodgingRoomTone,
  occupantFilterValue,
  LODGING_FILTER_EMPTY_LABEL,
  toDriveImageUrl,
  type LodgingFilterKey,
  type LodgingOccupant,
  type LodgingPlaceSetting,
  type LodgingPlaceView,
  type LodgingRoomSetting,
  type LodgingRoomView,
  type STSheetStudent,
} from '@smis-mentor/shared';

export type LodgingTarget = { kind: 'room'; room: LodgingRoomView } | { kind: 'place'; place: LodgingPlaceView };

interface Props {
  target: LodgingTarget;
  isAdmin: boolean;
  isForeign: boolean;
  /** 명단 표에 같이 보여 줄 열 — 그룹별·공항별을 열어 두면 */
  columns?: LodgingFilterKey[];
  /** 선생님 고르기용 — 캠프 구성원 이름 */
  memberNames: string[];
  saving: boolean;
  onClose: () => void;
  /** 명단 칸의 학생 → 시트 원본 (사진 등) */
  studentOf?: (student: LodgingOccupant) => STSheetStudent | undefined;
  onSaveRoom: (num: string, setting: LodgingRoomSetting) => Promise<void>;
  onSavePlace: (id: string, setting: LodgingPlaceSetting) => Promise<void>;
}

/**
 * 방·장소 상세 — 화면 가운데 모달. 명단은 시트에서 오고, 용도·선생님·메모는 관리자가 여기서 고친다.
 */
export default function LodgingDetail({
  target,
  isAdmin,
  isForeign,
  columns,
  memberNames,
  saving,
  onClose,
  studentOf,
  onSaveRoom,
  onSavePlace,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className={`relative flex max-h-[85vh] w-full ${target.kind === 'room' && target.room.students.length ? 'max-w-2xl' : 'max-w-lg'} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
        role="dialog"
        aria-modal
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3">
          {target.kind === 'room' ? <RoomHead room={target.room} /> : <PlaceHead place={target.place} />}
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {target.kind === 'room' ? (
            <RoomBody
              room={target.room}
              isAdmin={isAdmin}
              isForeign={isForeign}
              columns={columns}
              memberNames={memberNames}
              saving={saving}
              studentOf={studentOf}
              onSave={onSaveRoom}
            />
          ) : (
            <PlaceBody place={target.place} isAdmin={isAdmin} saving={saving} onSave={onSavePlace} />
          )}
        </div>
      </div>
    </div>
  );
}

function RoomHead({ room }: { room: LodgingRoomView }) {
  const c = lodgingRoomColor(room);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xl font-bold text-gray-900">{room.num}</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: c.bg, color: c.ink }}>
          {lodgingRoomTone(room)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        {room.wing === 'main' ? '본관' : '별관'} {room.floor}층
        {room.label ? ` · ${room.label}` : ''}
        {room.note ? ` · ${room.note}` : ''}
      </p>
    </div>
  );
}

function PlaceHead({ place }: { place: LodgingPlaceView }) {
  const c = LODGING_PLACE_COLORS[place.kind] ?? LODGING_PLACE_COLORS.etc;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-gray-900">{place.name}</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: c.bg, color: c.ink }}>
          {LODGING_PLACE_KIND_LABEL[place.kind]}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        지하 1층{place.area ? ` · ${place.area}㎡` : ''}
        {place.cap ? ` · ${place.cap}명 수용` : ''}
        {place.purpose ? ` · ${place.purpose}` : ''}
      </p>
    </div>
  );
}

function RoomBody({
  room,
  isAdmin,
  isForeign,
  columns,
  memberNames,
  saving,
  studentOf,
  onSave,
}: {
  room: LodgingRoomView;
  isAdmin: boolean;
  isForeign: boolean;
  columns?: LodgingFilterKey[];
  memberNames: string[];
  saving: boolean;
  studentOf?: (student: LodgingOccupant) => STSheetStudent | undefined;
  onSave: (num: string, setting: LodgingRoomSetting) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [label, setLabel] = useState('');
  const [teachers, setTeachers] = useState<string[]>([]);
  const [teacherInput, setTeacherInput] = useState('');
  const [note, setNote] = useState('');

  // 다른 방을 열면 편집 상태를 버린다
  useEffect(() => {
    setEditing(false);
  }, [room.num]);

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
  const save = async () => {
    await onSave(room.num, { purpose, label, teachers, note });
    setEditing(false);
  };

  const candidates = memberNames.filter((n) => !teachers.includes(n) && (!teacherInput || n.includes(teacherInput)));

  return (
    <div className="space-y-4">
      {(room.teachers.length > 0 || room.unitMentor) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {room.teachers.length > 0 && (
            <>
              <dt className="text-gray-500">{isForeign ? 'Teachers' : '선생님'}</dt>
              <dd className="text-gray-900">{room.teachers.join(', ')}</dd>
            </>
          )}
          {room.unitMentor && room.students.length > 0 && (
            <>
              <dt className="text-gray-500">{isForeign ? 'Unit mentor' : '유닛 멘토'}</dt>
              <dd className="text-gray-900">{room.unitMentor}</dd>
            </>
          )}
        </dl>
      )}
      {room.settingNote && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{room.settingNote}</p>}

      {room.students.length > 0 ? (
        // 명단 탭 호수 보기와 같은 학생 카드 — 한 줄에 4명까지
        <div className="grid grid-cols-4 gap-1.5">
          {room.students.map((s) => (
            <StudentCard
              key={s.studentId + s.rowNumber}
              occ={s}
              student={studentOf?.(s)}
              roomNum={room.num}
              isForeign={isForeign}
              extra={(columns ?? [])
                .map((k) => (k === 'airport' ? s.departureGroup || occupantFilterValue(s, k) : occupantFilterValue(s, k)) || LODGING_FILTER_EMPTY_LABEL[k])
                .join(' · ')}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {isForeign ? 'No students in this room.' : '시트에 이 방으로 배정된 학생이 없습니다.'}
        </p>
      )}


      {isAdmin && !editing && (
        <button
          onClick={startEdit}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          용도·선생님 편집
        </button>
      )}

      {isAdmin && editing && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Field label="용도">
            <div className="flex flex-wrap gap-1">
              <Chip on={purpose === ''} onClick={() => setPurpose('')}>
                자동
              </Chip>
              {LODGING_PURPOSES.filter((p) => p !== '빈방').map((p) => (
                <Chip key={p} on={purpose === p} onClick={() => setPurpose(p)}>
                  {p}
                </Chip>
              ))}
            </div>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="직접 입력 (비우면 자동: 명단 있으면 학생방)"
              className="mt-1.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="칸에 찍히는 한 줄" hint="예: Middle · Speaking">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="선생님 (이 방에 묵는 사람)">
            {teachers.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {teachers.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-gray-300">
                    {t}
                    <button
                      onClick={() => setTeachers(teachers.filter((x) => x !== t))}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`${t} 빼기`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={teacherInput}
              onChange={(e) => setTeacherInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTeacher(teacherInput);
                }
              }}
              placeholder="이름 입력 후 Enter, 또는 아래에서 고르기"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            {candidates.length > 0 && (
              <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {candidates.slice(0, 40).map((n) => (
                  <Chip key={n} on={false} onClick={() => addTeacher(n)}>
                    + {n}
                  </Chip>
                ))}
              </div>
            )}
          </Field>
          <Field label="메모">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              disabled={saving}
            >
              취소
            </button>
            <button
              onClick={save}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceBody({
  place,
  isAdmin,
  saving,
  onSave,
}: {
  place: LodgingPlaceView;
  isAdmin: boolean;
  saving: boolean;
  onSave: (id: string, setting: LodgingPlaceSetting) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setEditing(false);
  }, [place.id]);
  const startEdit = () => {
    setPurpose(place.purpose ?? '');
    setNote(place.settingNote ?? '');
    setEditing(true);
  };
  return (
    <div className="space-y-4">
      {place.settingNote ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{place.settingNote}</p>
      ) : (
        <p className="text-sm text-gray-500">
          {place.kind === 'hall' ? '강당·홀 — 전체 집합이나 야외수업조 편성에 씁니다.' : '시설 — 명단은 없습니다.'}
        </p>
      )}
      {isAdmin && !editing && (
        <button
          onClick={startEdit}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          이 캠프에서의 용도 편집
        </button>
      )}
      {isAdmin && editing && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <Field label="용도" hint="예: 전체 집합, 원어민 수업, 저녁 식사">
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="메모">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
              disabled={saving}
            >
              취소
            </button>
            <button
              onClick={async () => {
                await onSave(place.id, { purpose, note });
                setEditing(false);
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs ${
        on ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

/** 명단 탭(호수)의 학생 카드와 같은 모양 — 사진·이름(학년·성별)·반번호·영어 이름·반·방 */
function StudentCard({
  occ,
  student,
  roomNum,
  isForeign,
  extra,
}: {
  occ: LodgingOccupant;
  student?: STSheetStudent;
  roomNum: string;
  isForeign: boolean;
  extra?: string;
}) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : toDriveImageUrl(student?.profilePhoto);
  const male = occ.gender === 'M';
  const gradeNum = occ.grade?.replace(/[^0-9]/g, '') ?? '';
  const gradePrefix = occ.grade?.replace(/[0-9].*/g, '') || 'G';
  const gradeBadge = gradeNum ? `${gradePrefix}${gradeNum}${male ? 'M' : 'F'}` : '';
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
      {photo ? (
        <img
          src={photo}
          alt={occ.name}
          className="aspect-square w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="flex aspect-square w-full items-center justify-center"
          style={{ backgroundColor: male ? '#dbeafe' : '#fef9c3' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-1/2 w-1/2" style={{ color: male ? '#93c5fd' : '#fcd34d' }}>
            <path
              fillRule="evenodd"
              d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
      <div className="px-1.5 pt-1.5 pb-1.5">
      <p className={`truncate text-xs font-bold leading-tight ${male ? 'text-blue-600' : 'text-yellow-600'}`}>
        {occ.name}
        {gradeBadge ? ` (${gradeBadge})` : ''}
      </p>
      <p className="truncate text-[10px] font-medium text-gray-900">
        {occ.classNumber || '-'} | {occ.studentId || '-'}
      </p>
      <div className="my-1 h-px bg-gray-200" />
      <div className="space-y-0.5 text-[10px] text-gray-600">
        <p className="truncate">{occ.englishName || '-'}</p>
        <p className="truncate text-[9px]">
          {isForeign ? 'Class' : '반'}:{occ.classMentor || '-'}
          {occ.className ? `(${occ.className}반)` : ''}
        </p>
        <p className="truncate text-[9px]">
          {isForeign ? 'Room' : '방'}:{occ.unitMentor || '-'}({roomNum}호)
        </p>
        {extra && <p className="truncate text-[9px] font-semibold text-green-600">{extra}</p>}
      </div>
      </div>
    </div>
  );
}
