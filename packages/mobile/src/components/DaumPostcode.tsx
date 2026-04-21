import React, { useState, useCallback, useRef } from 'react';
import { logger } from '@smis-mentor/shared';
import { 
  Modal, 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Text, 
  Platform, 
  ActivityIndicator,
  Alert,
  BackHandler
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';

interface DaumPostcodeProps {
  visible: boolean;
  onComplete: (data: { address: string; zonecode: string }) => void;
  onClose: () => void;
  title?: string;
}

export function DaumPostcode({ 
  visible, 
  onComplete, 
  onClose, 
  title = '주소 검색' 
}: DaumPostcodeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  // Android 백버튼 처리
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (visible) {
          onClose();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription?.remove();
    }, [visible, onClose])
  );

  const handleMessage = useCallback((event: any) => {
    const messageData = event.nativeEvent.data;
    logger.info('📱 Message received from WebView:', messageData);
    
    try {
      const data = JSON.parse(messageData);
      logger.info('📱 Parsed data:', data);
      
      if (data.type === 'complete') {
        logger.info('📱 Address complete! Calling onComplete with:', {
          address: data.address,
          zonecode: data.zonecode
        });
        
        onComplete({
          address: data.address,
          zonecode: data.zonecode,
        });
        
        // 잠시 후 모달 닫기 (사용자가 선택한 것을 볼 수 있도록)
        setTimeout(() => {
          logger.info('📱 Closing modal');
          onClose();
        }, 300);
        
      } else if (data.type === 'close') {
        logger.info('📱 Postcode closed by user');
        onClose();
      } else if (data.type === 'error') {
        logger.error('📱 WebView error:', data.message);
        setHasError(true);
        showErrorAlert();
      } else if (data.type === 'ready') {
        logger.info('📱 Postcode ready');
        setIsLoading(false);
        setHasError(false);
      }
    } catch (error) {
      logger.error('📱 DaumPostcode message parse error:', error);
      logger.error('📱 Raw message:', messageData);
      setHasError(true);
      showErrorAlert();
    }
  }, [onComplete, onClose]);

  const showErrorAlert = useCallback(() => {
    Alert.alert(
      '주소 검색 오류',
      '주소 검색 서비스에 일시적인 문제가 발생했습니다.\n다시 시도해주세요.',
      [
        { text: '닫기', onPress: onClose },
        { text: '다시 시도', onPress: handleRetry }
      ]
    );
  }, [onClose]);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setRetryCount(prev => prev + 1);
    webViewRef.current?.reload();
  }, []);

  const handleLoadEnd = useCallback(() => {
    logger.info('📱 WebView loading ended');
    // ready 메시지를 기다리므로 여기서는 로딩 상태를 변경하지 않음
  }, []);

  const handleError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('📱 WebView error: ', nativeEvent);
    setIsLoading(false);
    setHasError(true);
    showErrorAlert();
  }, [showErrorAlert]);

  const handleHttpError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('📱 WebView HTTP error: ', nativeEvent);
    if (nativeEvent.statusCode >= 400) {
      setIsLoading(false);
      setHasError(true);
      showErrorAlert();
    }
  }, [showErrorAlert]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    // 외부 사이트로의 내비게이션 방지
    if (!navState.url.includes('daumcdn.net') && !navState.url.startsWith('about:')) {
      logger.warn('📱 Blocked navigation to external site:', navState.url);
      return false;
    }
    return true;
  }, []);

  // 최적화된 HTML 콘텐츠
  const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="format-detection" content="telephone=no">
  <title>주소검색</title>
  <style>
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #666;
    }
    .error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #d32f2f;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div id="loading" class="loading">주소 검색을 준비중입니다...</div>
  <div id="error" class="error" style="display: none;">
    주소 검색 서비스를 불러올 수 없습니다.<br>
    네트워크 연결을 확인해주세요.
  </div>
  
  <script>
    (function() {
      console.log('🌐 Script starting...');
      
      var isReady = false;
      var loadTimeout;
      
      function sendToRN(data) {
        var msg = JSON.stringify(data);
        console.log('🌐 Sending:', msg);
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(msg);
          }
        } catch (e) {
          console.error('🌐 Send error:', e);
        }
      }
      
      function showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        sendToRN({ type: 'error', message: 'Failed to load Daum Postcode API' });
      }
      
      function loadScript() {
        return new Promise(function(resolve, reject) {
          var script = document.createElement('script');
          script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
          script.async = true;
          
          script.onload = function() {
            console.log('🌐 Daum script loaded successfully');
            resolve();
          };
          
          script.onerror = function() {
            console.error('🌐 Failed to load Daum script');
            reject(new Error('Script load failed'));
          };
          
          document.head.appendChild(script);
        });
      }
      
      function init() {
        console.log('🌐 Initializing Daum Postcode...');
        
        if (typeof daum === 'undefined') {
          console.error('🌐 Daum object not available');
          showError();
          return;
        }
        
        try {
          document.getElementById('loading').style.display = 'none';
          
          new daum.Postcode({
            oncomplete: function(data) {
              console.log('🌐 oncomplete fired!');
              console.log('🌐 Data:', JSON.stringify(data));
              
              var addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
              if (!addr) addr = data.address;
              
              sendToRN({
                type: 'complete',
                address: addr,
                zonecode: data.zonecode
              });
            },
            onresize: function(size) {
              console.log('🌐 onresize:', size);
            },
            onclose: function(state) {
              console.log('🌐 onclose:', state);
              if (state === 'FORCE_CLOSE') {
                sendToRN({ type: 'close' });
              }
            },
            width: '100%',
            height: '100%',
            autoClose: false
          }).embed(document.body);
          
          console.log('🌐 Embed complete!');
          sendToRN({ type: 'ready' });
          isReady = true;
          
        } catch (e) {
          console.error('🌐 Init error:', e);
          showError();
        }
      }
      
      // 타임아웃 설정 (10초)
      loadTimeout = setTimeout(function() {
        if (!isReady) {
          console.error('🌐 Load timeout');
          showError();
        }
      }, 10000);
      
      // 스크립트 로드 및 초기화
      loadScript()
        .then(function() {
          // 스크립트 로드 후 잠시 대기
          setTimeout(init, 100);
        })
        .catch(function(error) {
          console.error('🌐 Script load error:', error);
          showError();
        });
        
    })();
  </script>
</body>
</html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.statusBarSpacer, { height: insets.top }]} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>주소 검색</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ 
            html: htmlContent,
            baseUrl: 'https://t1.daumcdn.net'
          }}
          onMessage={handleMessage}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          mixedContentMode="always"
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          cacheEnabled={false}
          incognito={true}
          injectedJavaScriptBeforeContentLoaded={`
            logger.info('📱 injectedJavaScriptBeforeContentLoaded');
            window.isReactNativeWebView = true;
            true;
          `}
          injectedJavaScript={`
            logger.info('📱 injectedJavaScript executed');
            setTimeout(function() {
              logger.info('📱 Checking daum object:', typeof daum);
            }, 2000);
            true;
          `}
          onLoadStart={() => logger.info('📱 WebView loading started')}
          onLoadEnd={() => logger.info('📱 WebView loading ended')}
          onLoadProgress={({ nativeEvent }) => {
            logger.info('📱 Load progress:', nativeEvent.progress);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            logger.error('📱 WebView error: ', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            logger.error('📱 WebView HTTP error: ', nativeEvent);
          }}
          onContentProcessDidTerminate={() => {
            logger.warn('📱 WebView content process terminated');
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  statusBarSpacer: {
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  closeButton: {
    padding: 8,
    marginRight: -8,
  },
  closeButtonText: {
    fontSize: 28,
    color: '#64748b',
    fontWeight: '300',
    lineHeight: 28,
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
