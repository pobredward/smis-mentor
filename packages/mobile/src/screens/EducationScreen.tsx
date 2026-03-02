import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { generationResourcesService, ResourceLink } from '../services';
import { AddLinkModal } from '../components';

export function EducationScreen() {
  const { userData } = useAuth();
  const [educationLinks, setEducationLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState<Record<string, boolean>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const webViewRefs = useRef<Record<string, WebView | null>>({});

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  useEffect(() => {
    console.log('🔄 EducationScreen: activeJobCodeId 변경됨:', activeJobCodeId);
    if (activeJobCodeId) {
      loadEducationLinks();
    }
  }, [userData?.activeJobExperienceId, userData?.jobExperiences?.[0]?.id]);

  const loadEducationLinks = async () => {
    if (!activeJobCodeId) {
      console.log('⚠️ EducationScreen: activeJobCodeId 없음');
      setLoading(false);
      return;
    }

    try {
      console.log('📥 EducationScreen: 교육 링크 로드 시작 -', activeJobCodeId);
      setLoading(true);
      
      // 기존 데이터 초기화
      setEducationLinks([]);
      setSelectedLinkId(null);
      
      const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
      
      if (resources?.educationLinks) {
        console.log('✅ EducationScreen: 교육 링크 로드 성공 -', resources.educationLinks.length, '개');
        setEducationLinks(resources.educationLinks);
        if (resources.educationLinks.length > 0) {
          setSelectedLinkId(resources.educationLinks[0].id);
        }
      } else {
        console.log('⚠️ EducationScreen: 해당 기수의 교육 링크 없음');
      }
    } catch (error) {
      console.error('❌ EducationScreen: 교육 링크 로드 실패:', error);
      Alert.alert('오류', '교육 링크를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigationStateChange = (linkId: string) => (navState: WebViewNavigation) => {
    setCanGoBack((prev) => ({
      ...prev,
      [linkId]: navState.canGoBack,
    }));
  };

  const handleGoBack = () => {
    if (!selectedLinkId) return;
    const webView = webViewRefs.current[selectedLinkId];
    if (webView && canGoBack[selectedLinkId]) {
      webView.goBack();
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!activeJobCodeId) return;

    Alert.alert(
      '삭제 확인',
      '이 링크를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await generationResourcesService.deleteLink(activeJobCodeId, 'educationLinks', linkId);
              await loadEducationLinks();
              Alert.alert('성공', '링크가 삭제되었습니다.');
            } catch (error) {
              console.error('링크 삭제 실패:', error);
              Alert.alert('오류', '링크 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>교육 자료 로딩 중...</Text>
      </View>
    );
  }

  if (educationLinks.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>등록된 교육 링크가 없습니다.</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButtonLarge}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonLargeText}>+ 첫 링크 추가하기</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const selectedLink = educationLinks.find(link => link.id === selectedLinkId);

  return (
    <View style={styles.container}>
      {/* 링크 선택 토글 */}
      <View style={styles.toggleContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toggleContent}
        >
          {isAdmin && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          )}
          
          {educationLinks.map((link) => (
            <TouchableOpacity
              key={link.id}
              style={[
                styles.toggleButton,
                selectedLinkId === link.id && styles.toggleButtonActive,
              ]}
              onPress={() => setSelectedLinkId(link.id)}
              onLongPress={() => isAdmin && handleDeleteLink(link.id)}
            >
              <Text
                style={[
                  styles.toggleText,
                  selectedLinkId === link.id && styles.toggleTextActive,
                ]}
              >
                {link.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 뒤로가기 버튼 */}
      {selectedLinkId && canGoBack[selectedLinkId] && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Text style={styles.backButtonText}>← 뒤로</Text>
        </TouchableOpacity>
      )}

      {/* 모든 노션 페이지 웹뷰 프리로드 */}
      <View style={styles.webviewContainer}>
        {educationLinks.map((link) => (
          <View
            key={link.id}
            style={[
              styles.webviewWrapper,
              selectedLinkId !== link.id && styles.hidden,
            ]}
          >
            <WebView
              ref={(ref) => { webViewRefs.current[link.id] = ref; }}
              source={{ uri: link.url }}
              style={styles.webview}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>로딩 중...</Text>
                </View>
              )}
              onNavigationStateChange={handleNavigationStateChange(link.id)}
              cacheEnabled={true}
              cacheMode="LOAD_CACHE_ELSE_NETWORK"
              incognito={false}
              androidLayerType="hardware"
            />
          </View>
        ))}
      </View>

      {/* 링크 추가 모달 */}
      {isAdmin && activeJobCodeId && (
        <AddLinkModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          jobCodeId={activeJobCodeId}
          linkType="educationLinks"
          userId={userData?.userId || ''}
          onSuccess={loadEducationLinks}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 20,
  },
  addButtonLarge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addButtonLargeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 48,
  },
  toggleContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 4,
  },
  toggleButtonActive: {
    backgroundColor: '#3b82f6',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  webviewContainer: {
    flex: 1,
    position: 'relative',
  },
  webviewWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    opacity: 0,
    zIndex: -1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
});
