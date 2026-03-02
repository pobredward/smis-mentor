import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useWebViewCache } from '../context/WebViewCacheContext';
import { useAuth } from '../context/AuthContext';
import { AddLinkModal } from '../components';
import { generationResourcesService } from '../services';

export function GuideScreen() {
  const { guides, loadingStates, zoomLevels, setZoomLevel, applyZoom, renderWebView, refreshResources, loading } = useWebViewCache();
  const { userData } = useAuth();
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0]?.id);
  const [showAddModal, setShowAddModal] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  const selectedGuide = guides.find(g => g.id === selectedGuideId) || guides[0];
  const currentZoom = selectedGuideId ? (zoomLevels[selectedGuideId] || 0.6) : 0.6;
  const isLoading = selectedGuideId ? (loadingStates[selectedGuideId] ?? true) : true;

  const handleZoomIn = () => {
    if (!selectedGuideId) return;
    const newZoom = Math.min(currentZoom + 0.2, 3.0);
    setZoomLevel(selectedGuideId, newZoom);
    applyZoom(selectedGuideId, newZoom);
  };

  const handleZoomOut = () => {
    if (!selectedGuideId) return;
    const newZoom = Math.max(currentZoom - 0.2, 0.5);
    setZoomLevel(selectedGuideId, newZoom);
    applyZoom(selectedGuideId, newZoom);
  };

  const handleZoomReset = () => {
    if (!selectedGuideId) return;
    setZoomLevel(selectedGuideId, 1.0);
    applyZoom(selectedGuideId, 1.0);
  };

  const handleDeleteGuide = async (guideId: string) => {
    if (!activeJobCodeId) return;

    Alert.alert(
      '삭제 확인',
      '이 인솔표를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await generationResourcesService.deleteLink(activeJobCodeId, 'guideLinks', guideId);
              await refreshResources();
              Alert.alert('성공', '인솔표가 삭제되었습니다.');
              if (selectedGuideId === guideId && guides.length > 1) {
                setSelectedGuideId(guides[0].id);
              }
            } catch (error) {
              console.error('인솔표 삭제 실패:', error);
              Alert.alert('오류', '인솔표 삭제에 실패했습니다.');
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
        <Text style={styles.loadingText}>인솔표 로딩 중...</Text>
      </View>
    );
  }

  if (guides.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>등록된 인솔표가 없습니다.</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButtonLarge}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonLargeText}>+ 첫 인솔표 추가하기</Text>
          </TouchableOpacity>
        )}
        {isAdmin && activeJobCodeId && (
          <AddLinkModal
            visible={showAddModal}
            onClose={() => setShowAddModal(false)}
            jobCodeId={activeJobCodeId}
            linkType="guideLinks"
            userId={userData?.userId || ''}
            onSuccess={refreshResources}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 인솔 선택 버튼들 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.buttonContainer}
        contentContainerStyle={styles.buttonContent}
      >
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}

        {guides.map((guide) => (
          <TouchableOpacity
            key={guide.id}
            style={[
              styles.button,
              selectedGuideId === guide.id && styles.buttonActive
            ]}
            onPress={() => setSelectedGuideId(guide.id)}
            onLongPress={() => isAdmin && handleDeleteGuide(guide.id)}
          >
            <Text style={[
              styles.buttonText,
              selectedGuideId === guide.id && styles.buttonTextActive
            ]}>
              {guide.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 줌 컨트롤 버튼들 */}
      <View style={styles.zoomControls}>
        <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
          <Text style={styles.zoomButtonText}>-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomResetButton} onPress={handleZoomReset}>
          <Text style={styles.zoomResetText}>{Math.round(currentZoom * 100)}%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* 웹뷰 컨테이너 */}
      <View style={styles.webViewContainer}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>인솔표 로딩 중...</Text>
          </View>
        )}
        
        {/* 모든 웹뷰 렌더링 (선택된 것만 표시) */}
        {guides.map((guide) => (
          <View
            key={guide.id}
            style={[
              styles.webViewWrapper,
              selectedGuideId !== guide.id && styles.hidden
            ]}
          >
            {renderWebView(guide.id, selectedGuideId === guide.id)}
          </View>
        ))}
      </View>

      {/* 인솔표 추가 모달 */}
      {isAdmin && activeJobCodeId && (
        <AddLinkModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          jobCodeId={activeJobCodeId}
          linkType="guideLinks"
          userId={userData?.userId || ''}
          onSuccess={refreshResources}
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
  buttonContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 42,
  },
  buttonContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  addButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  button: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 3,
  },
  buttonActive: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  buttonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 6,
  },
  zoomButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  zoomButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  zoomResetButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 60,
    alignItems: 'center',
  },
  zoomResetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webViewWrapper: {
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
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    zIndex: 10,
  },
});
