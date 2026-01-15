import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  NativeModules,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { RunAnywhere } from '@runanywhere/core';
import { AppColors } from '../theme';
import { useModelService } from '../services/ModelService';
import { ModelLoaderWidget, AudioVisualizer } from '../components';

// Native Audio Module - records in WAV format (16kHz mono) optimal for Whisper STT
const { NativeAudioModule } = NativeModules;

export const SpeechToTextScreen: React.FC = () => {
  const modelService = useModelService();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionHistory, setTranscriptionHistory] = useState<string[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioPathRef = useRef<string | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (isRecording && NativeAudioModule) {
        NativeAudioModule.cancelRecording().catch(() => {});
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      // Check if native module is available
      if (!NativeAudioModule) {
        console.error('[STT] NativeAudioModule not available');
        setTranscription('Error: Native audio module not available. Please rebuild the app.');
        return;
      }

      console.log('[STT] Starting recording with native module...');
      const result = await NativeAudioModule.startRecording();
      
      audioPathRef.current = result.path;
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setTranscription('');
      setRecordingDuration(0);

      // Poll for audio levels
      audioLevelIntervalRef.current = setInterval(async () => {
        try {
          const levelResult = await NativeAudioModule.getAudioLevel();
          setAudioLevel(levelResult.level || 0);
          setRecordingDuration(Date.now() - recordingStartRef.current);
        } catch (e) {
          // Ignore errors during polling
        }
      }, 100);

      console.log('[STT] Recording started at:', result.path);
    } catch (error) {
      console.error('[STT] Recording error:', error);
      setTranscription(`Error starting recording: ${error}`);
    }
  };

  const stopRecording = async () => {
    try {
      // Clear audio level polling
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      if (!NativeAudioModule) {
        throw new Error('NativeAudioModule not available');
      }

      const result = await NativeAudioModule.stopRecording();
      setIsRecording(false);
      setAudioLevel(0);
      setIsTranscribing(true);

      const audioPath = result.path;
      console.log('[STT] Recording stopped, file at:', audioPath, 'size:', result.fileSize);

      if (!audioPath) {
        throw new Error('Recording path not found');
      }

      // Verify file exists
      const exists = await RNFS.exists(audioPath);
      if (!exists) {
        throw new Error('Recording file not found');
      }

      // Transcribe the WAV file
      console.log('[STT] Transcribing file...');
      const transcribeResult = await RunAnywhere.transcribeFile(audioPath, {
        language: 'en',
      });

      const finalText = transcribeResult.text || '(No speech detected)';
      setTranscription(finalText);

      if (transcribeResult.text) {
        setTranscriptionHistory(prev => [transcribeResult.text, ...prev]);
      }

      console.log(`[STT] Transcription: "${finalText}", confidence: ${transcribeResult.confidence}`);

      // Clean up the audio file
      await RNFS.unlink(audioPath).catch(() => {});
      audioPathRef.current = null;

      setIsTranscribing(false);
    } catch (error) {
      console.error('[STT] Transcription error:', error);
      setTranscription(`Error: ${error}`);
      setIsTranscribing(false);
    }
  };

  const handleClearHistory = () => {
    setTranscriptionHistory([]);
    setTranscription('');
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!modelService.isSTTLoaded) {
    return (
      <ModelLoaderWidget
        title="STT Model Required"
        subtitle="Download and load the speech recognition model"
        icon="mic"
        accentColor={AppColors.accentViolet}
        isDownloading={modelService.isSTTDownloading}
        isLoading={modelService.isSTTLoading}
        progress={modelService.sttDownloadProgress}
        onLoad={modelService.downloadAndLoadSTT}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Recording Area */}
        <View style={[styles.recordingArea, isRecording && styles.recordingActive]}>
          {isRecording ? (
            <>
              <AudioVisualizer level={audioLevel} />
              <Text style={[styles.statusTitle, { color: AppColors.accentViolet }]}>
                Listening...
              </Text>
              <Text style={styles.statusSubtitle}>
                {formatDuration(recordingDuration)}
              </Text>
            </>
          ) : isTranscribing ? (
            <>
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingIcon}>⏳</Text>
              </View>
              <Text style={styles.statusTitle}>Transcribing...</Text>
            </>
          ) : (
            <>
              <View style={styles.micContainer}>
                <Text style={styles.micIcon}>🎤</Text>
              </View>
              <Text style={styles.statusTitle}>Tap to Record</Text>
              <Text style={styles.statusSubtitle}>On-device speech recognition (WAV 16kHz)</Text>
            </>
          )}
        </View>

        {/* Current Transcription */}
        {(transcription || isTranscribing) && (
          <View style={styles.transcriptionCard}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>LATEST</Text>
            </View>
            <Text style={styles.transcriptionText}>
              {isTranscribing ? 'Processing...' : transcription}
            </Text>
          </View>
        )}

        {/* History */}
        {transcriptionHistory.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>History</Text>
              <TouchableOpacity onPress={handleClearHistory}>
                <Text style={styles.clearButton}>Clear</Text>
              </TouchableOpacity>
            </View>
            {transcriptionHistory.map((item, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyText}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Record Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isRecording ? [AppColors.error, '#DC2626'] : [AppColors.accentViolet, '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.recordButton}
          >
            <Text style={styles.recordIcon}>{isRecording ? '⏹' : '🎤'}</Text>
            <Text style={styles.recordButtonText}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.primaryDark,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  recordingArea: {
    padding: 32,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: AppColors.textMuted + '1A',
    alignItems: 'center',
    marginBottom: 24,
  },
  recordingActive: {
    borderColor: AppColors.accentViolet + '80',
    borderWidth: 2,
    shadowColor: AppColors.accentViolet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  micContainer: {
    width: 100,
    height: 100,
    backgroundColor: AppColors.accentViolet + '20',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  micIcon: {
    fontSize: 48,
  },
  loadingContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingIcon: {
    fontSize: 48,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 14,
    color: AppColors.textSecondary,
  },
  transcriptionCard: {
    padding: 20,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.accentViolet + '40',
    marginBottom: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: AppColors.accentViolet + '33',
    borderRadius: 8,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.accentViolet,
  },
  transcriptionText: {
    fontSize: 15,
    color: AppColors.textPrimary,
    lineHeight: 22,
  },
  historySection: {
    marginBottom: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textMuted,
  },
  clearButton: {
    fontSize: 14,
    color: AppColors.accentViolet,
  },
  historyItem: {
    padding: 16,
    backgroundColor: AppColors.surfaceCard + '80',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.textMuted + '1A',
    marginBottom: 12,
  },
  historyText: {
    fontSize: 14,
    color: AppColors.textSecondary,
    lineHeight: 20,
  },
  buttonContainer: {
    padding: 24,
    backgroundColor: AppColors.surfaceCard + 'CC',
    borderTopWidth: 1,
    borderTopColor: AppColors.textMuted + '1A',
  },
  recordButton: {
    flexDirection: 'row',
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    elevation: 8,
    shadowColor: AppColors.accentViolet,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  recordIcon: {
    fontSize: 28,
  },
  recordButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
