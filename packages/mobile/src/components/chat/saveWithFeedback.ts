/**
 * 사진·동영상 저장 + 결과 안내 (보기 화면 · 메시지 메뉴 공용)
 */
import { Alert, Linking } from 'react-native';
import { L, logger, type ChatMediaItem } from '@smis-mentor/shared';
import { saveChatMediaToLibrary } from '../../services/chatMedia';

export async function saveChatMediaWithFeedback(
  entries: Array<{ item: ChatMediaItem; index: number }>,
  opts: { campCode?: string | null; at?: Date | null; onProgress?: (done: number, total: number) => void },
): Promise<void> {
  try {
    const r = await saveChatMediaToLibrary(entries, opts);
    if (r.denied) {
      Alert.alert(L('common.permissionRequired'), L('chat.permissionSave'), [
        { text: L('common.cancel'), style: 'cancel' },
        { text: L('common.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]);
      return;
    }
    if (r.saved === 0) {
      Alert.alert(L('chat.saveFailed'));
    } else if (r.failed > 0) {
      Alert.alert(L('chat.appPartialSaved', { saved: r.saved, failed: r.failed }));
    } else {
      Alert.alert(r.saved === 1 ? L('chat.saved') : L('chat.savedN', { n: r.saved }));
    }
  } catch (e) {
    logger.warn('채팅 사진 저장 오류:', e);
    Alert.alert(L('chat.saveFailed'));
  }
}
