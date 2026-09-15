import React from 'react';
import {StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {brand} from './src/brand';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={brand.colors.forest} />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.brand}>{brand.name}</Text>
          <Text style={styles.headerLabel}>MI JORNADA</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Mi jornada</Text>
          <Text style={styles.description}>
            Tu registro horario estará disponible cuando conectemos la cuenta de la organización.
          </Text>
        </View>
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
});
