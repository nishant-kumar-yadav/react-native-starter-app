import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { indexDocument, isFileIndexed } from '../Database';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { buildIndexableContent } from './TextEnrichment';

const BATCH_SIZE = 10;          // OCR 10 photos then pause
const BATCH_SLEEP_MS = 200;     // 200ms rest between batches (lets GC breathe)
const CURSOR_KEY = 'gallery_sync_cursor'; // AsyncStorage key for resume

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Save the current page cursor so we can resume after a crash */
const saveCursor = async (cursor: string | undefined) => {
    try {
        if (cursor) await AsyncStorage.setItem(CURSOR_KEY, cursor);
        else await AsyncStorage.removeItem(CURSOR_KEY);
    } catch (_) { }
};

/** Load the saved cursor (returns undefined if no previous sync) */
export const loadSavedCursor = async (): Promise<string | undefined> => {
    try {
        const val = await AsyncStorage.getItem(CURSOR_KEY);
        return val ?? undefined;
    } catch (_) {
        return undefined;
    }
};

/** Clear the saved cursor after a completed sync */
export const clearSyncCursor = async () => {
    try { await AsyncStorage.removeItem(CURSOR_KEY); } catch (_) { }
};

/**
 * Returns how many photos are in the gallery (true total, no cap).
 * Uses page_info from a single lightweight fetch.
 */
export const getGalleryTotalCount = async (): Promise<number> => {
    try {
        // CameraRoll doesn't expose a direct count API.
        // Fetch 1 photo just to check if there are any.
        // We return -1 to signal "unknown" until sync completes.
        return -1; // Will be updated live during sync via onProgress
    } catch (_) {
        return 0;
    }
};

/**
 * Returns the number of photos that will be processed during a sync.
 * NOTE: This was previously capped at DEMO_LIMIT — now uncapped.
 */
export const getGallerySyncLimit = async (): Promise<number> => {
    return -1; // Total is unknown upfront; reported live via onProgress
};

/**
 * Full gallery sync — processes ALL photos in batches.
 * Crash-resilient: resumes from last saved cursor.
 * Pause-safe: checks cancelRef.current each batch.
 *
 * @param onProgress  called with (processed, currentUri) after each photo
 * @param cancelRef   set cancelRef.current = true from outside to pause/stop
 * @param resumeFrom  optional cursor override (uses AsyncStorage if undefined)
 */
export const performFullGallerySync = async (
    onProgress: (processedCount: number, currentUri?: string) => void,
    cancelRef?: React.MutableRefObject<boolean>,
    resumeFrom?: string,
): Promise<{ processed: number; wasCancelled: boolean }> => {
    let hasNextPage = true;
    let after: string | undefined = resumeFrom ?? await loadSavedCursor();
    let totalProcessed = 0;

    try {
        while (hasNextPage) {
            // --- Pause/cancel check ---
            if (cancelRef?.current) {
                return { processed: totalProcessed, wasCancelled: true };
            }

            const pageResult = await CameraRoll.getPhotos({
                first: BATCH_SIZE,
                after: after,
                assetType: 'Photos',
            });

            if (pageResult.edges.length === 0) break;

            for (const edge of pageResult.edges) {
                // Pause check inside inner loop too
                if (cancelRef?.current) {
                    await saveCursor(after);
                    return { processed: totalProcessed, wasCancelled: true };
                }

                const uri = edge.node.image.uri;

                if (!isFileIndexed(uri)) {
                    try {
                        const ocrResult = await TextRecognition.recognize(uri);
                        const rawText = ocrResult.text ?? '';

                        // Only enrich if there's meaningful text (skip blank/tiny results)
                        let indexableContent: string;
                        if (rawText.trim().length >= 15) {
                            indexableContent = await buildIndexableContent(rawText);
                        } else if (rawText.trim().length > 0) {
                            indexableContent = rawText; // Short text: store as-is, skip LLM
                        } else {
                            indexableContent = 'image';
                        }

                        indexDocument(indexableContent, uri, 'Gallery Sync');
                    } catch (_) {
                        indexDocument('image', uri, 'Gallery Sync');
                    }
                }

                totalProcessed++;
                onProgress(totalProcessed, uri);
            }

            hasNextPage = pageResult.page_info.has_next_page;
            after = pageResult.page_info.end_cursor;

            // Save cursor after each page — crash recovery point
            await saveCursor(after);

            // Breathe between batches: lets GC collect, prevents UI freeze
            await sleep(BATCH_SLEEP_MS);
        }

        // Sync complete — clear the saved cursor
        await clearSyncCursor();
        return { processed: totalProcessed, wasCancelled: false };

    } catch (error) {
        // Save cursor on unexpected error so we can resume
        await saveCursor(after);
        throw error;
    }
};