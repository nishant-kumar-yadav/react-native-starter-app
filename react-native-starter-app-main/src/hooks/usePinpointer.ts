import { useState, useEffect, useRef } from 'react';
import { Alert, Share, Linking, NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { RunAnywhere } from '@runanywhere/core';
import { indexDocument, searchDocuments, setupDatabase } from '../Database';
import { performFullGallerySync, loadSavedCursor } from '../utils/GallerySync';
import { buildIndexableContent } from '../utils/TextEnrichment';
// Modern ML Kit Import
import TextRecognition from '@react-native-ml-kit/text-recognition';

const { NativeAudioModule } = NativeModules;

export const usePinpointer = () => {
    // UI & Search State
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isDbReady, setIsDbReady] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [syncCount, setSyncCount] = useState(0);
    const [totalImages, setTotalImages] = useState(0);
    const cancelRef = useRef<boolean>(false);

    // Voice & AI State
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [audioLevel, setAudioLevel] = useState(0);
    const [recordingDuration, setRecordingDuration] = useState(0);

    const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordingStartRef = useRef<number>(0);

    // --- 1. INITIALIZE DATABASE & AI MODELS ---
    useEffect(() => {
        const init = async () => {
            try {
                // Initialize Local Vector DB
                setupDatabase();
                setIsDbReady(true);

                // Pre-load Whisper STT Model for instant voice search
                console.log("[AI] Warming up STT models...");
                // loadSTTModel requires a localPath; skip pre-warming here—
                // the model is loaded on demand via ModelService.
                setIsModelLoading(false);
            } catch (e) {
                console.error("Critical Init Failed:", e);
                setIsModelLoading(false);
            }
        };
        init();

        return () => {
            if (audioLevelIntervalRef.current) clearInterval(audioLevelIntervalRef.current);
            if (isRecording && NativeAudioModule) {
                NativeAudioModule.cancelRecording().catch(() => { });
            }
        };
    }, []);

    // --- 2. REAL-TIME SEARCH ENGINE ---
    useEffect(() => {
        if (!isDbReady) return;
        if (searchText.length > 0) {
            setSearchResults(searchDocuments(searchText));
        } else {
            setSearchResults([]);
        }
    }, [searchText, isDbReady]);

    // --- 3. SPEECH-TO-TEXT (WHISPER) ---
    const startListening = async () => {
        if (isModelLoading) {
            Alert.alert("AI Warming Up", "The STT model is still loading into memory.");
            return;
        }
        try {
            if (!NativeAudioModule) throw new Error('NativeAudioModule not found');
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
            }
            const result = await NativeAudioModule.startRecording();
            recordingStartRef.current = Date.now();
            setIsRecording(true);
            setSearchText('');
            audioLevelIntervalRef.current = setInterval(async () => {
                try {
                    const levelResult = await NativeAudioModule.getAudioLevel();
                    setAudioLevel(levelResult.level || 0);
                    setRecordingDuration(Date.now() - recordingStartRef.current);
                } catch (e) { }
            }, 100);
        } catch (error) {
            Alert.alert('Recording Error', `${error}`);
        }
    };

    const stopListening = async () => {
        // Guard: do nothing if no recording is actually in progress
        if (!isRecording) return;
        try {
            if (audioLevelIntervalRef.current) {
                clearInterval(audioLevelIntervalRef.current);
                audioLevelIntervalRef.current = null;
            }
            const result = await NativeAudioModule.stopRecording();
            setIsRecording(false);
            setAudioLevel(0);
            setIsTranscribing(true);

            if (!result.audioBase64) throw new Error('No audio data captured');

            // Transcribe using local on-device Whisper — 'auto' detects Hindi too
            const transcribeResult = await RunAnywhere.transcribe(result.audioBase64, {
                sampleRate: 16000,
                language: 'auto',
            });

            if (transcribeResult.text) {
                setSearchText(transcribeResult.text);
                setIsSearching(true);
            }
            setIsTranscribing(false);
        } catch (error) {
            console.error('[STT] Error:', error);
            setIsRecording(false);
            setIsTranscribing(false);
        }
    };

    // --- 4. ACTUAL ON-DEVICE OCR (ML KIT) ---
    const handleScan = async () => {
        try {
            const result = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
            if (result.assets && result.assets[0].uri) {
                const imageUri = result.assets[0].uri;

                // Modern ML Kit V2 — detects Latin + Devanagari (Hindi)
                const visionResult = await TextRecognition.recognize(imageUri);
                const rawText = visionResult.text;

                // Enrich: if Hindi detected, LLM adds Hinglish + English keywords
                const indexableContent = await buildIndexableContent(
                    rawText || "No readable text found"
                );

                // Save enriched content to local database
                indexDocument(indexableContent, imageUri, 'Manual Scan');

                Alert.alert(
                    "Scan Success",
                    `Detected: "${rawText.substring(0, 50)}..."`
                );
            }
        } catch (e) {
            Alert.alert("OCR Error", "The AI could not read this image.");
        }
    };

    // --- 5. FULL GALLERY AI SYNC (crash-safe, pauseable) ---
    const runSync = async (fromCursor?: string) => {
        try {
            if (Platform.OS === 'android') {
                const permission = Platform.Version >= 33
                    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
                const hasPermission = await PermissionsAndroid.request(permission);
                if (hasPermission !== PermissionsAndroid.RESULTS.GRANTED) return;
            }

            cancelRef.current = false;
            setIsSyncing(true);
            setIsPaused(false);

            const { processed, wasCancelled } = await performFullGallerySync(
                (currentCount) => setSyncCount(currentCount),
                cancelRef,
                fromCursor,
            );

            setIsSyncing(false);
            if (wasCancelled) {
                setIsPaused(true);
            } else {
                setIsPaused(false);
                Alert.alert('Gallery Indexed', `Done! ${processed} photos indexed for AI search.`);
            }
        } catch (error) {
            setIsSyncing(false);
            setIsPaused(true); // treat error as pause — cursor was saved
            Alert.alert('Sync Paused', 'Progress saved. Tap Resume to continue.');
        }
    };

    const handleFullSync = () => runSync(undefined);

    const handlePauseSync = () => {
        cancelRef.current = true; // signal the sync loop to stop
    };

    const handleResumeSync = async () => {
        const cursor = await loadSavedCursor();
        runSync(cursor);
    };

    return {
        searchText, setSearchText, searchResults, isSearching, setIsSearching,
        selectedImage, setSelectedImage,
        isRecording, isTranscribing, isModelLoading, audioLevel, recordingDuration,
        startListening, stopListening, handleScan,
        handleFullSync, handlePauseSync, handleResumeSync,
        isSyncing, isPaused, syncCount, totalImages,
        handleShare: () => selectedImage && Share.share({ url: selectedImage }),
        handleEdit: () => selectedImage && Linking.openURL(selectedImage)
    };
};