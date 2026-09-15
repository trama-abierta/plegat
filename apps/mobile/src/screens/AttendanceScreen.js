import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AppState, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {brand} from '../brand';
import {getAttendance, getNextAction, hasPendingChanges, recordEvent, summarize, todayEvents} from '../attendance/attendance';

const labels = {clock_in: 'Iniciar jornada', break_start: 'Iniciar pausa', break_end: 'Reanudar jornada'};
const fmt = ms => { const total = Math.floor(Math.max(0, ms) / 1000); return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };

export default function AttendanceScreen({onSignOut}) {
  const [attendance, setAttendance] = useState(null); const [pending, setPending] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => { try { const [value, corrections] = await Promise.all([getAttendance(), getCorrections()]); setAttendance(value); setPending(hasPendingChanges(corrections)); setMessage(''); } catch (error) { setMessage(error.message); } }, []);
  useEffect(() => { refresh(); const clock = setInterval(() => setNow(Date.now()), 1000); const poll = setInterval(refresh, 10000); const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); }); return () => { clearInterval(clock); clearInterval(poll); subscription.remove(); }; }, [refresh]);
  const action = getNextAction(attendance || {}); const events = useMemo(() => todayEvents(attendance?.events || [], now), [attendance, now]); const summary = summarize(events, now); const status = attendance?.state?.status === 'working' ? 'Trabajando' : attendance?.state?.status === 'on_break' ? 'En pausa' : action === 'clock_in' && events.at(-1)?.type === 'clock_out' ? 'Jornada cerrada' : 'Sin iniciar';
  const run = async type => { setBusy(true); setMessage(''); try { await recordEvent(type); await refresh(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  return <View style={styles.container}>
    <View style={styles.summary}><Text style={styles.status}>{status === 'Trabajando' ? '🟢' : status === 'En pausa' ? '☕' : '⚪'} {status}</Text><Text style={styles.timer}>{fmt(summary.workedMs)}</Text><Text style={styles.muted}>Tiempo efectivo · confirmado por el servidor</Text><Text style={styles.line}>Pausas <Text style={styles.bold}>{summary.pauses} · {fmt(summary.pausedMs)}</Text></Text></View>
    {pending && <View style={styles.warning}><Text style={styles.warningText}>⚠ Esta jornada tiene cambios pendientes. Se mantienen los fichajes originales.</Text><Pressable onPress={() => Linking.openURL('http://127.0.0.1:5173/historial')}><Text style={styles.link}>Revisar en la web ↗</Text></Pressable></View>}
    <Pressable disabled={busy} onPress={() => run(action)} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Guardando…' : status === 'Jornada cerrada' ? 'Reanudar jornada' : labels[action] || 'Iniciar jornada'}</Text></Pressable>
    <Pressable disabled={busy || !['Trabajando', 'En pausa'].includes(status)} onPress={() => run('clock_out')} style={styles.secondary}><Text style={styles.secondaryText}>Terminar jornada</Text></Pressable>
    <Text style={styles.message}>{message}</Text><Pressable onPress={onSignOut}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
  </View>;
}

async function getCorrections() {
  const {apiFetch} = await import('../api/client');
  const [profileResponse, correctionsResponse] = await Promise.all([apiFetch('/api/v1/me'), apiFetch('/api/v1/me/corrections')]);
  if (!correctionsResponse.ok) return [];
  const data = await correctionsResponse.json();
  const profile = profileResponse.ok ? await profileResponse.json() : null;
  const employeeId = profile?.employee?.id;
  return (data.requests || []).filter(request => !employeeId || request.employeeId === employeeId);
}
const styles = StyleSheet.create({container: {flex: 1, padding: 24, backgroundColor: brand.colors.paper}, summary: {padding: 18, borderRadius: 16, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d7ddcf'}, status: {color: brand.colors.ink, fontSize: 18, fontWeight: '700'}, timer: {color: brand.colors.ink, fontSize: 42, fontWeight: '700', marginTop: 18}, muted: {color: '#687a70', marginTop: 6}, line: {color: '#687a70', marginTop: 18}, bold: {fontWeight: '700', color: brand.colors.ink}, warning: {padding: 12, marginTop: 14, borderRadius: 10, backgroundColor: '#fff9df', borderWidth: 1, borderColor: '#ead79a'}, warningText: {color: '#78662d', lineHeight: 20}, primary: {marginTop: 20, padding: 14, borderRadius: 9, backgroundColor: brand.colors.forest}, primaryText: {color: brand.colors.paper, textAlign: 'center', fontWeight: '700', fontSize: 16}, secondary: {marginTop: 10, padding: 14, borderRadius: 9, borderWidth: 1, borderColor: '#aebeb2'}, secondaryText: {color: brand.colors.ink, textAlign: 'center', fontSize: 16}, link: {color: '#687a70', textDecorationLine: 'underline', marginTop: 10}, message: {color: '#687a70', minHeight: 24, marginTop: 14}});
