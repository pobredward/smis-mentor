import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface DaumPostcodeProps {
  visible: boolean;
  onComplete: (data: { address: string; zonecode: string }) => void;
  onClose: () => void;
}

export function DaumPostcode({ visible, onComplete, onClose }: DaumPostcodeProps) {
  const handleMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    onComplete({
      address: data.address,
      zonecode: data.zonecode,
    });
  };

  const jsCode = `
    window.addEventListener('message', function(e) {
      // Daum Postcode에서 메시지를 받을 준비
    });
    
    true; // note: this is required, or you'll sometimes get silent failures
  `;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Daum Postcode</title>
        <style>
          body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        <div id="layer" style="display:block;position:absolute;overflow:hidden;z-index:1;-webkit-overflow-scrolling:touch;">
          <img src="//t1.daumcdn.net/postcode/resource/images/close.png" id="btnCloseLayer" style="cursor:pointer;position:absolute;right:0px;top:-1px;z-index:1" onclick="closeDaumPostcode()" alt="닫기 버튼">
        </div>
        <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
        <script>
          function closeDaumPostcode() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'close' }));
          }
          
          var element_layer = document.getElementById('layer');
          
          new daum.Postcode({
            oncomplete: function(data) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'complete',
                address: data.address,
                zonecode: data.zonecode
              }));
            },
            width: '100%',
            height: '100%',
            maxSuggestItems: 5
          }).embed(element_layer);
          
          // 모바일 환경에서 전체 화면으로
          element_layer.style.width = '100%';
          element_layer.style.height = '100%';
          element_layer.style.border = 'none';
        </script>
      </body>
    </html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>주소 검색</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html }}
          injectedJavaScript={jsCode}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'complete') {
                onComplete({
                  address: data.address,
                  zonecode: data.zonecode,
                });
              } else if (data.type === 'close') {
                onClose();
              }
            } catch (error) {
              console.error('DaumPostcode message parse error:', error);
            }
          }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={Platform.OS === 'android'}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#64748b',
    fontWeight: '300',
  },
  webview: {
    flex: 1,
  },
});
