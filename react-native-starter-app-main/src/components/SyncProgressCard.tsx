import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { AppColors } from '../theme';

interface SyncProps {
  isSyncing: boolean;
  isPaused: boolean;
  syncCount: number;
  onStartSync: () => void;
  onPauseSync: () => void;
  onResumeSync: () => void;
}

export const SyncProgressCard: React.FC<SyncProps> = ({
  isSyncing,
  isPaused,
  syncCount,
  onStartSync,
  onPauseSync,
  onResumeSync,
}) => {
  const getStatus = () => {
    if (isPaused) return `Paused at ${syncCount} photos — tap to resume`;
    if (isSyncing) return `Indexing photo #${syncCount}...`;
    if (syncCount > 0) return `✅ ${syncCount} photos indexed`;
    return 'Index your entire gallery for AI search';
  };

  const getTitle = () => {
    if (isPaused) return '⏸ Sync Paused';
    if (isSyncing) return '🧠 Syncing...';
    if (syncCount > 0) return '🔄 Re-Sync Gallery';
    return '🔄 Start Full Sync';
  };

  const handlePress = () => {
    if (isSyncing) {
      onPauseSync();
    } else if (isPaused) {
      onResumeSync();
    } else {
      onStartSync();
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <LinearGradient
        colors={
          isPaused
            ? ['rgba(255,165,0,0.15)', 'rgba(255,165,0,0.05)']
            : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
        }
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.subtitle}>{getStatus()}</Text>
          </View>
          <View style={styles.actionBadge}>
            <Text style={styles.actionText}>
              {isSyncing ? 'Pause' : isPaused ? 'Resume' : 'Start'}
            </Text>
          </View>
        </View>

        {(isSyncing || isPaused) && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: syncCount > 0 ? '100%' : '5%', // indeterminate style
                  backgroundColor: isPaused ? '#FFA500' : AppColors.accentCyan,
                },
              ]}
            />
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 15,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  container: { padding: 18 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  actionBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  track: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 3,
    marginTop: 15,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
});