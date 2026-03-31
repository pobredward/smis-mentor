import React from 'react';
import { logger } from '@smis-mentor/shared';
import { Modal, View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

interface DaumPostcodeProps {
  visible: boolean;
  onComplete: (data: { address: string; zonecode: string }) => void;
  onClose: () => void;
}

export function DaumPostcode({ visible, onComplete, onClose }: DaumPostcodeProps) {
  const handleMessage = (event: any) => {
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
        onClose();
      }
    } catch (error) {
      logger.error('📱 DaumPostcode message parse error:', error);
      logger.error('📱 Raw message:', messageData);
    }
  };

  // URI 대신 직접 HTML 문자열 사용
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>주소검색</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
  <script>
    (function() {
      logger.info('🌐 Script starting...');
      
      function sendToRN(data) {
        var msg = JSON.stringify(data);
        logger.info('🌐 Sending:', msg);
        try {
          window.ReactNativeWebView.postMessage(msg);
        } catch (e) {
          logger.error('🌐 Send error:', e);
        }
      }
      
      function init() {
        logger.info('🌐 Initializing Daum Postcode...');
        try {
          new daum.Postcode({
            oncomplete: function(data) {
              logger.info('🌐 oncomplete fired!');
              logger.info('🌐 Data:', JSON.stringify(data));
              
              var addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
              if (!addr) addr = data.address;
              
              sendToRN({
                type: 'complete',
                address: addr,
                zonecode: data.zonecode
              });
            },
            onresize: function(size) {
              logger.info('🌐 onresize:', size);
            },
            width: '100%',
            height: '100%'
          }).embed(document.body, { autoClose: false });
          
          logger.info('🌐 Embed complete!');
        } catch (e) {
          logger.error('🌐 Init error:', e);
          sendToRN({ type: 'error', message: e.toString() });
        }
      }
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
