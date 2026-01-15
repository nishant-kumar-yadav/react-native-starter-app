import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { RunAnywhere } from '@runanywhere/core';
import { AppColors } from '../theme';
import { useModelService } from '../services/ModelService';
import { ModelLoaderWidget, AudioVisualizer } from '../components';

const audioRecorderPlayer = new AudioRecorderPlayer();

export const SpeechToTextScreen: React.FC = () => {
  const modelService = useModelService();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionHistory, setTranscriptionHistory] = useState<string[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioPathRef = useRef<string | null>(null);

  const startRecording = async () => {
    try {
      const path = await audioRecorderPlayer.startRecorder();
      audioPathRef.current = path;
      setIsRecording(true);
      setTranscription('');

      // Monitor audio levels
      audioRecorderPlayer.addRecordBackListener((e) => {
        const level = e.currentMetering ? Math.min(1, Math.max(0, (e.currentMetering + 60) / 60)) : 0;
        setAudioLevel(level);
      });
    } catch (error) {
      console.error('Recording error:', error);
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
      setAudioLevel(0);
      setIsTranscribing(true);

      // Read audio file and transcribe
      if (audioPathRef.current) {
        const audioData = await readAudioFile(audioPathRef.current);
        const text = await RunAnywhere.transcribe(audioData);
        
        const finalText = text || '(No speech detected)';
        setTranscription(finalText);
        if (text) {
          setTranscriptionHistory(prev => [text, ...prev]);
        }
      }
      setIsTranscribing(false);
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscription(`Error: ${error}`);
      setIsTranscribing(false);
    }
  };

  const readAudioFile = async (path: string): Promise<Uint8Array> => {
    // Placeholder - would use react-native-fs or similar to read file
    // For now, return empty array
    return new Uint8Array();
  };

  const handleClearHistory = () => {
    setTranscriptionHistory([]);
    setTranscription('');
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
                Speak clearly into your microphone
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
              <Text style={styles.statusSubtitle}>On-device speech recognition</Text>
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
