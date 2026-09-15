import React, {useEffect, useRef, useState} from 'react';
import {Linking, Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {brand} from './src/brand';
import {beginLogin, completeLogin} from './src/auth/oauth';
import {restoreSession, signOut} from './src/auth/session';
import AttendanceScreen from './src/screens/AttendanceScreen';

export default function App() {
  const [message, setMessage] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const handledUrls = useRef(new Set());

  useEffect(() => {
    let active = true;
    const handleUrl = async url => {
      if (!url?.startsWith('plegat://oauth/callback') || handledUrls.current.has(url)) return;
      handledUrls.current.add(url);
      try {
        await completeLogin(url);
        if (active) { setAuthenticated(true); setMessage(''); }
      } catch (error) {
        if (active) setMessage(error.message);
      }
    };
    const subscription = Linking.addEventListener('url', event => { handleUrl(event.url); });
    Linking.getInitialURL().then(handleUrl).catch(error => {
      if (active) setMessage(error.message);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => { restoreSession().then(setAuthenticated).catch(() => {}); }, []);

  const startLogin = async () => {
    try {
      await beginLogin();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={brand.colors.forest} />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.brand}>{brand.name}</Text>
          <Text style={styles.headerLabel}>MI JORNADA</Text>
        </View>
        {authenticated ? <AttendanceScreen onSignOut={async () => { await signOut(); setAuthenticated(false); }} /> : <View style={styles.content}>
          <Text style={styles.title}>Mi jornada</Text>
          <Text style={styles.description}>{message}</Text>
          <Pressable accessibilityRole="button" onPress={startLogin} style={styles.loginButton}>
            <Text style={styles.loginText}>Iniciar sesión</Text>
          </Pressable>
        </View>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: brand.colors.paper},
  header: {backgroundColor: brand.colors.forest, paddingHorizontal: 24, paddingVertical: 20},
  brand: {color: brand.colors.paper, fontSize: 28, fontWeight: '700'},
  headerLabel: {color: brand.colors.sage, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 8},
  content: {padding: 24},
  title: {color: brand.colors.ink, fontSize: 30, fontWeight: '700'},
  description: {color: brand.colors.ink, fontSize: 16, lineHeight: 24, marginTop: 12},
  loginButton: {backgroundColor: brand.colors.forest, padding: 14, marginTop: 24, borderRadius: 8},
  loginText: {color: brand.colors.paper, fontSize: 16, fontWeight: '700', textAlign: 'center'},
});
