import React from 'react';
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
    console.log('📱 Message received from WebView:', messageData);
    
    try {
      const data = JSON.parse(messageData);
      console.log('📱 Parsed data:', data);
      
      if (data.type === 'complete') {
        console.log('📱 Address complete! Calling onComplete with:', {
          address: data.address,
          zonecode: data.zonecode
        });
        
        onComplete({
          address: data.address,
          zonecode: data.zonecode,
        });
        
        // 잠시 후 모달 닫기 (사용자가 선택한 것을 볼 수 있도록)
        setTimeout(() => {
          console.log('📱 Closing modal');
          onClose();
        }, 300);
        
      } else if (data.type === 'close') {
        console.log('📱 Postcode closed by user');
        onClose();
      } else if (data.type === 'error') {
        console.error('📱 WebView error:', data.message);
        onClose();
      }
    } catch (error) {
      console.error('📱 DaumPostcode message parse error:', error);
      console.error('📱 Raw message:', messageData);
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
      console.log('🌐 Script starting...');
      
      function sendToRN(data) {
        var msg = JSON.stringify(data);
        console.log('🌐 Sending:', msg);
        try {
          window.ReactNativeWebView.postMessage(msg);
        } catch (e) {
          console.error('🌐 Send error:', e);
        }
      }
      
      function init() {
        console.log('🌐 Initializing Daum Postcode...');
        try {
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
            width: '100%',
            height: '100%'
          }).embed(document.body, { autoClose: false });
          
          console.log('🌐 Embed complete!');
        } catch (e) {
          console.error('🌐 Init error:', e);
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
            console.log('📱 injectedJavaScriptBeforeContentLoaded');
            window.isReactNativeWebView = true;
            true;
          `}
          injectedJavaScript={`
            console.log('📱 injectedJavaScript executed');
            setTimeout(function() {
              console.log('📱 Checking daum object:', typeof daum);
            }, 2000);
            true;
          `}
          onLoadStart={() => console.log('📱 WebView loading started')}
          onLoadEnd={() => console.log('📱 WebView loading ended')}
          onLoadProgress={({ nativeEvent }) => {
            console.log('📱 Load progress:', nativeEvent.progress);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('📱 WebView error: ', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('📱 WebView HTTP error: ', nativeEvent);
          }}
          onContentProcessDidTerminate={() => {
            console.warn('📱 WebView content process terminated');
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
