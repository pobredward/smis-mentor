import React, { useState, useLayoutEffect, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { CampPageWebEditor } from '../components/CampPageWebEditor';
import { campPageService } from '../services/campPageService';
import { logger } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CampEditor'>;

export function CampEditorScreen({ route, navigation }: Props) {
  const { category, itemId, itemTitle, initialContent } = route.params;
  const { userData } = useAuth();
  const [content, setContent] = useState(initialContent || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: itemTitle ? `${itemTitle} 편집` : '새 페이지',
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          style={styles.headerButton}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <Text style={styles.headerButtonText}>저장</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, itemTitle, isSaving, content]);

  const handleSave = async () => {
    if (!activeJobCodeId || !userData || !userData.id) {
      logger.error('저장 실패 - 사용자 정보 없음:', { activeJobCodeId, userData });
      Alert.alert('오류', '로그인 정보를 확인할 수 없습니다.');
      return;
    }

    if (!content.trim()) {
      Alert.alert('알림', '내용을 입력해주세요.');
      return;
    }

    await performSave();
  };

  // 테이블 컨트롤 제거 함수
  const removeTableControls = (html: string): string => {
    if (!html) return html;
    // <div class="table-controls">...</div> 제거
    return html.replace(/<div class="table-controls"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  };

  const performSave = async () => {
    if (!userData?.id) return;

    try {
      setIsSaving(true);

      // 저장 전 테이블 컨트롤 제거
      const cleanContent = removeTableControls(content);

      logger.info('저장 시도:', { 
        itemId, 
        userId: userData.id, 
        contentLength: cleanContent.length 
      });

      await campPageService.updatePage(itemId, {
        content: cleanContent,
        userId: userData.id,
      });

      logger.info(`✅ 캠프 페이지 저장 완료: ${itemId}`);
      Alert.alert('성공', '페이지가 저장되었습니다.', [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      logger.error('캠프 페이지 저장 실패:', error);
      Alert.alert('오류', '페이지 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <CampPageWebEditor
        content={content}
        onChange={handleContentChange}
        placeholder="내용을 입력하세요..."
        editable={true}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
});
