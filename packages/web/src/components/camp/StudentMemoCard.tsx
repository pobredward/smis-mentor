'use client';
/**
 * 학생 자유 메모 (반담당·방담당·그룹매니저) — ST 시트와 연동하지 않고 Firestore 에만 저장.
 * 복용약·특이사항(관리자만 수정) 아래에 둔다.
 */
import { useEffect, useState } from 'react';
import {
  L, logger, STUDENT_MEMO_KEYS, subscribeStudentMemo, saveStudentMemo,
  type StudentMemo, type StudentMemoKey, type MessageKey, type STSheetStudent,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

const LABEL: Record<StudentMemoKey, MessageKey> = {
  classMemo: 'studentMemo.classMemo', unitMemo: 'studentMemo.unitMemo', groupMemo: 'studentMemo.groupMemo',
};

const when = (d?: Date) => (d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');

export default function StudentMemoCard({ campCode, student, actor }: {
  campCode: string; student: STSheetStudent; actor: { uid: string; name: string };
}) {
  const [memoById, setMemoById] = useState<Record<string, StudentMemo | null>>({});
  const [editing, setEditing] = useState<{ key: StudentMemoKey; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = student.studentId;

  useEffect(() => {
    if (!campCode || !id) return;
    return subscribeStudentMemo(db, campCode, id, m => setMemoById(p => ({ ...p, [id]: m })), e => logger.warn('[memo]', e));
  }, [campCode, id]);
  const memo = memoById[id] ?? null;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saveStudentMemo(db, campCode, { studentId: id, name: student.name }, editing.key, editing.text, actor);
      setEditing(null);
    } catch (e) {
      logger.error('[memo] save', e);
      alert(L('studentMemo.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-base leading-none">🗒️</span>
        <h4 className="text-sm font-semibold text-gray-900 flex-1">{L('studentMemo.title')}</h4>
        <span className="text-[10px] text-gray-400">{L('studentMemo.hint')}</span>
      </div>
      <div className="px-4 py-1">
        {STUDENT_MEMO_KEYS.map(k => {
          const entry = memo?.[k];
          const isEdit = editing?.key === k;
          return (
            <div key={k} className="py-2 border-b border-gray-100 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 flex-1">{L(LABEL[k])}</span>
                {entry && !isEdit && <span className="text-[10px] text-gray-400">{L('studentMemo.lastEdited', { v0: entry.by, v1: when(entry.at?.toDate?.()) })}</span>}
                {!isEdit && !editing && (
                  <button type="button" onClick={() => setEditing({ key: k, text: entry?.text ?? '' })}
                    className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50">{L('task.edit')}</button>
                )}
              </div>
              {isEdit ? (
                <div className="mt-1.5 space-y-1.5">
                  <textarea autoFocus rows={3} value={editing.text} placeholder={L('studentMemo.placeholder')}
                    onChange={e => setEditing(p => (p ? { ...p, text: e.target.value } : p))}
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
                    className="w-full text-xs text-gray-900 border border-blue-400 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y" />
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => setEditing(null)} disabled={busy} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100">{L('common.cancel')}</button>
                    <button type="button" onClick={save} disabled={busy} className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">{busy ? '…' : L('common.save')}</button>
                  </div>
                </div>
              ) : (
                <p className={`mt-0.5 text-xs whitespace-pre-wrap break-words ${entry ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                  {entry?.text || L('studentMemo.empty')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
