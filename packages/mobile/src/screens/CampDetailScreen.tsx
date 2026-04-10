import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Linking,
  RefreshControl,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import RenderHTML from 'react-native-render-html';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getDisplayItems } from '../services';
import type { DisplayItem, CampPageCategory } from '@smis-mentor/shared';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CampDetail'>;

export function CampDetailScreen({ route, navigation }: Props) {
  const { category, itemId, itemTitle } = route.params;
  const { userData } = useAuth();
  const { width } = useWindowDimensions();
  const [item, setItem] = useState<DisplayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasTable, setHasTable] = useState(false);
  const webViewRef = React.useRef<WebView>(null);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: itemTitle,
      headerBackVisible: true, // 명시적으로 뒤로 버튼 표시
      headerRight: () =>
        isAdmin && item?.type === 'page' ? (
          <TouchableOpacity
            onPress={handleEditPress}
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>편집</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, itemTitle, isAdmin, item]);

  // 화면이 포커스될 때마다 데이터 새로고침
  const loadItem = React.useCallback(async () => {
    if (!activeJobCodeId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      const foundItem = displayItems.find(i => i.id === itemId);
      
      if (!foundItem) {
        Alert.alert('오류', '항목을 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }

      // 권한 체크
      const hasAccess = 
        isAdmin ||
        !foundItem.targetRole ||
        foundItem.targetRole === 'common' ||
        (userData?.role === 'mentor' && foundItem.targetRole === 'mentor') ||
        (userData?.role === 'foreign' && foundItem.targetRole === 'foreign');

      if (!hasAccess) {
        Alert.alert('오류', '접근 권한이 없습니다.');
        navigation.goBack();
        return;
      }

      setItem(foundItem);

      // 테이블이 있는지 확인
      if (foundItem.type === 'page' && foundItem.content) {
        const hasTableTag = /<table/i.test(foundItem.content);
        setHasTable(hasTableTag);
      }
    } catch (error) {
      logger.error('항목 로드 실패:', error);
      Alert.alert('오류', '항목을 불러오는데 실패했습니다.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [activeJobCodeId, category, itemId, isAdmin, userData?.role, navigation]);

  useFocusEffect(
    React.useCallback(() => {
      loadItem();
    }, [loadItem])
  );

  const onRefresh = React.useCallback(async () => {
    if (!activeJobCodeId) return;
    
    setRefreshing(true);
    try {
      const displayItems = await getDisplayItems(activeJobCodeId, category);
      const foundItem = displayItems.find(i => i.id === itemId);
      
      if (foundItem) {
        setItem(foundItem);
        
        // 테이블이 있는지 확인
        if (foundItem.type === 'page' && foundItem.content) {
          const hasTableTag = /<table/i.test(foundItem.content);
          setHasTable(hasTableTag);
        }
      }
    } catch (error) {
      logger.error('새로고침 실패:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeJobCodeId, category, itemId]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleGoBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const handleEditPress = () => {
    if (!item || item.type !== 'page') return;

    navigation.navigate('CampEditor', {
      category,
      itemId: item.id,
      itemTitle: itemTitle,
      initialContent: item.content || '',
    });
  };

  // 테이블 컨트롤 HTML 제거 함수
  const removeTableControls = (html: string): string => {
    if (!html) return html;
    
    // <div class="table-controls">...</div> 제거
    return html.replace(/<div class="table-controls"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>항목을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 본문 */}
      {item.type === 'page' ? (
        // 페이지 타입: 테이블이 있으면 WebView, 없으면 RenderHTML
        hasTable ? (
          <WebView
            source={{
              html: `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 16px;
        margin: 0;
        color: #1f2937;
        font-size: 16px;
        line-height: 24px;
      }
      h1 { font-size: 32px; font-weight: bold; margin: 8px 0 6px 0; padding-top: 4px; color: #111827; line-height: 40px; }
      h2 { font-size: 28px; font-weight: bold; margin: 8px 0 5px 0; color: #111827; line-height: 35px; }
      h3 { font-size: 24px; font-weight: bold; margin: 6px 0 4px 0; color: #111827; line-height: 30px; }
      p { margin: 0 0 4px 0; line-height: 24px; white-space: pre-wrap; word-break: break-word; }
      
      /* 빈 단락 처리 - 웹과 동일 */
      p:empty,
      p:has(br:only-child) {
        min-height: 28px;
        display: block;
      }
      
      ul, ol { margin: 0 0 4px 0; padding-left: 20px; }
      li { margin-bottom: 2px; }
      img { max-width: 100%; height: auto; border-radius: 8px; margin: 6px 0; display: block; }
      table { border-collapse: collapse; table-layout: auto; width: auto; margin: 6px 0; }
      th, td { border: 1px solid #d1d5db; padding: 8px; white-space: nowrap; vertical-align: top; }
      th { background-color: #f3f4f6; font-weight: bold; }
      a { color: #2563eb; text-decoration: underline; }
      blockquote { border-left: 4px solid #3b82f6; padding-left: 16px; padding: 8px 16px; margin: 6px 0; background-color: #eff6ff; }
      code { background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 14px; color: #dc2626; font-family: monospace; }
      pre { background-color: #1f2937; color: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 6px 0; }
      iframe { max-width: 100%; }
    </style>
    <script>
      // YouTube iframe 처리
      document.addEventListener('DOMContentLoaded', function() {
        const iframes = document.querySelectorAll('iframe[src*="youtube"]');
        iframes.forEach(iframe => {
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        });
      });
    </script>
  </head>
  <body>${removeTableControls(item.content || '') || '<p style="color: #9ca3af; text-align: center;">내용이 없습니다.</p>'}</body>
</html>
              `,
            }}
            style={styles.webview}
            scalesPageToFit={false}
            showsHorizontalScrollIndicator={true}
            showsVerticalScrollIndicator={true}
            javaScriptEnabled={true}
            allowsFullscreenVideo={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
          />
        ) : (
        <ScrollView 
          style={styles.pageScrollView} 
          contentContainerStyle={styles.pageContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#3b82f6']}
              tintColor="#3b82f6"
            />
          }
        >
          <RenderHTML
            contentWidth={width - 32}
            source={{ html: removeTableControls(item.content || '') || '<p style="color: #9ca3af; text-align: center;">내용이 없습니다.</p>' }}
            enableExperimentalMarginCollapsing={false}
            baseStyle={{
              paddingTop: 8,
            }}
            tagsStyles={{
              body: {
                color: '#1f2937',
                fontSize: 16,
                lineHeight: 24,
              },
              h1: {
                fontSize: 32,
                fontWeight: 'bold',
                marginBottom: 6,
                marginTop: 8,
                paddingTop: 4,
                color: '#111827',
                lineHeight: 35,
              },
              h2: {
                fontSize: 28,
                fontWeight: 'bold',
                marginBottom: 5,
                marginTop: 8,
                lineHeight: 35,
                color: '#111827',
              },
              h3: {
                fontSize: 24,
                fontWeight: 'bold',
                marginBottom: 4,
                marginTop: 6,
                lineHeight: 35,
                color: '#111827',
              },
              p: {
                marginBottom: 4,
                lineHeight: 24,
                minHeight: 24, // 빈 단락도 최소 높이 확보
              },
              ul: {
                marginBottom: 4,
                paddingLeft: 20,
              },
              ol: {
                marginBottom: 4,
                paddingLeft: 20,
              },
              li: {
                marginBottom: 2,
              },
              img: {
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 8,
                marginVertical: 6,
              },
              table: {
                borderWidth: 1,
                borderColor: '#d1d5db',
                marginVertical: 6,
                width: 'auto',
              },
              tbody: {
                width: 'auto',
              },
              thead: {
                width: 'auto',
              },
              tr: {
                width: 'auto',
              },
              th: {
                borderWidth: 1,
                borderColor: '#d1d5db',
                padding: 8,
                backgroundColor: '#f3f4f6',
                fontWeight: 'bold',
              },
              td: {
                borderWidth: 1,
                borderColor: '#d1d5db',
                padding: 8,
              },
              a: {
                color: '#2563eb',
                textDecorationLine: 'underline',
              },
              blockquote: {
                borderLeftWidth: 4,
                borderLeftColor: '#3b82f6',
                paddingLeft: 16,
                paddingVertical: 8,
                marginVertical: 6,
                backgroundColor: '#eff6ff',
              },
              code: {
                backgroundColor: '#f3f4f6',
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontSize: 14,
                color: '#dc2626',
                fontFamily: 'monospace',
              },
              pre: {
                backgroundColor: '#1f2937',
                color: '#f3f4f6',
                padding: 16,
                borderRadius: 8,
                overflow: 'hidden',
                marginVertical: 6,
              },
            }}
          />
        </ScrollView>
        )
      ) : (
        // 링크 타입: WebView로 표시 (뒤로가기 버튼 포함)
        <>
          {canGoBack && (
            <TouchableOpacity style={styles.webViewBackButton} onPress={handleGoBack}>
              <Text style={styles.webViewBackButtonText}>← 뒤로</Text>
            </TouchableOpacity>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: item.url || '' }}
            style={styles.webview}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>로딩 중...</Text>
              </View>
            )}
            onNavigationStateChange={handleNavigationStateChange}
            javaScriptEnabled={true}
            cacheEnabled={true}
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  pageScrollView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  pageContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  webview: {
    flex: 1,
  },
  webViewBackButton: {
    position: 'absolute',
    top: 16,
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
  webViewBackButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
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
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
});
