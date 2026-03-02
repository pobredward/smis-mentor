import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation';
import { WebViewCacheProvider } from './src/context/WebViewCacheContext';
import { AuthProvider } from './src/context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <WebViewCacheProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </WebViewCacheProvider>
    </AuthProvider>
  );
}

