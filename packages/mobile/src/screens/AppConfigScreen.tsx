import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackScreenProps } from '../navigation/types';
import { db } from '../config/firebase';
import { getAppConfig, updateAppConfig, DEFAULT_LOADING_QUOTES, logger } from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';

export function AppConfigScreen({ navigation }: AdminStackScreenProps<'AppConfig'>) {
  const { user } = useAuth();
  const [loadingQuotes, setLoadingQuotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuote, setNewQuote] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await getAppConfig(db);
      
      if (config && config.loadingQuotes.length > 0) {
        setLoadingQuotes(config.loadingQuotes);
      } else {
        setLoadingQuotes(DEFAULT_LOADING_QUOTES);
      }
      
      logger.info('✅ 앱 설정 불러오기 성공');
    } catch (error) {
      logger.error('❌ 앱 설정 불러오기 실패:', error);
      Alert.alert('오류', '설정을 불러오는데 실패했습니다.');
      setLoadingQuotes(DEFAULT_LOADING_QUOTES);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuote = () => {
    const trimmed = newQuote.trim();
    if (!trimmed) {
      Alert.alert('알림', '문구를 입력해주세요.');
      return;
    }
    
    if (loadingQuotes.includes(trimmed)) {
      Alert.alert('알림', '이미 존재하는 문구입니다.');
      return;
    }
    
    setLoadingQuotes([...loadingQuotes, trimmed]);
    setNewQuote('');
    Alert.alert('완료', '문구가 추가되었습니다.');
  };

  const handleRemoveQuote = (index: number) => {
    if (loadingQuotes.length <= 1) {
      Alert.alert('알림', '최소 1개의 문구가 필요합니다.');
      return;
    }
    
    Alert.alert(
      '문구 삭제',
      '이 문구를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            const newQuotes = loadingQuotes.filter((_, i) => i !== index);
            setLoadingQuotes(newQuotes);
            Alert.alert('완료', '문구가 삭제되었습니다.');
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!user?.uid) {
      Alert.alert('오류', '사용자 정보를 찾을 수 없습니다.');
      return;
    }
    
    if (loadingQuotes.length === 0) {
      Alert.alert('알림', '최소 1개의 로딩 문구가 필요합니다.');
      return;
    }
    
    try {
      setSaving(true);
      await updateAppConfig(
        db,
        { loadingQuotes },
        user.uid
      );
      logger.info('✅ 앱 설정 저장 성공');
      Alert.alert('완료', '설정이 저장되었습니다!');
    } catch (error) {
      logger.error('❌ 앱 설정 저장 실패:', error);
      Alert.alert('오류', '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      '초기화',
      '기본 문구로 초기화하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            setLoadingQuotes(DEFAULT_LOADING_QUOTES);
            Alert.alert('완료', '기본 문구로 초기화되었습니다.');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>로딩 문구 관리</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>로딩 문구 관리</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* 로딩 문구 목록 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>로딩 문구 목록</Text>
              <Text style={styles.countBadge}>{loadingQuotes.length}개</Text>
            </View>
            <View style={styles.quoteList}>
              {loadingQuotes.map((quote, index) => (
                <View key={index} style={styles.quoteItem}>
                  <Text style={styles.quoteNumber}>{(index + 1).toString().padStart(2, '0')}</Text>
                  <Text style={styles.quoteText}>{quote}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveQuote(index)}
                    disabled={saving}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* 새 문구 추가 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>새 문구 추가</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={newQuote}
                onChangeText={setNewQuote}
                placeholder="예: 오늘도 학생들과 함께 성장하는 하루 되세요 ✨"
                placeholderTextColor="#9ca3af"
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={handleAddQuote}
              />
              <TouchableOpacity
                style={[styles.addButton, saving && styles.buttonDisabled]}
                onPress={handleAddQuote}
                disabled={saving}
              >
                <Text style={styles.addButtonText}>추가</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tip}>
              💡 팁: 이모지를 포함하면 더 생동감 있는 문구가 됩니다!
            </Text>
          </View>

          {/* 버튼 */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.resetButton, saving && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={saving}
            >
              <Text style={styles.resetButtonText}>기본값으로 초기화</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>저장</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 안내 */}
          <View style={styles.infoBox}>
            <View style={styles.infoHeader}>
              <Ionicons name="information-circle" size={20} color="#3b82f6" />
              <Text style={styles.infoTitle}>참고 사항</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoText}>
                • 로딩 문구는 모바일 앱 실행 시 랜덤으로 1개가 표시됩니다.
              </Text>
              <Text style={styles.infoText}>
                • 변경사항은 즉시 반영되며, 다음 앱 실행부터 적용됩니다.
              </Text>
              <Text style={styles.infoText}>
                • 최소 1개 이상의 문구가 필요합니다.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  countBadge: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  tip: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  quoteList: {
    marginTop: 8,
  },
  quoteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  quoteNumber: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginRight: 12,
    marginTop: 2,
  },
  quoteText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginHorizontal: 16,
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginLeft: 8,
  },
  infoContent: {
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
});
