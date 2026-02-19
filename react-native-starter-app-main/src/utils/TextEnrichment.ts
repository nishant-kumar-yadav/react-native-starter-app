import { RunAnywhere } from '@runanywhere/core';

/**
 * Detects if a string contains Devanagari (Hindi) characters.
 */
export const containsHindi = (text: string): boolean => {
    // Devanagari Unicode block: \u0900–\u097F
    return /[\u0900-\u097F]/.test(text);
};

/**
 * Uses the on-device LLM to transliterate Hindi text to Hinglish
 * and translate it to English keywords — enabling cross-lingual search.
 *
 * Returns a string like: "duniya world earth"
 * which gets appended to the indexed content so any of those terms match.
 */
export const enrichHindiText = async (hindiText: string): Promise<string> => {
    try {
        // Limit input to avoid LLM overloading on long text
        const trimmed = hindiText.substring(0, 300);

        const prompt =
            `You are a Hindi-to-English keyword extractor.\n` +
            `Given this Hindi text: "${trimmed}"\n` +
            `Return ONLY a space-separated list of:\n` +
            `1. Each Hindi word romanized (Hinglish transliteration)\n` +
            `2. The English translation of each word\n` +
            `Example output: duniya world ghar home pyar love\n` +
            `Output only the keywords, nothing else.`;

        const result = await RunAnywhere.generate(prompt, {
            maxTokens: 100,
            temperature: 0.1,
        });

        const keywords = result.text?.trim() ?? '';
        console.log('[Enrichment] Hindi keywords generated:', keywords);
        return keywords;
    } catch (e) {
        console.warn('[Enrichment] LLM keyword extraction failed:', e);
        return '';
    }
};

/**
 * Takes raw OCR output, detects language, and returns the full
 * enriched text to store in the DB (original + Hinglish + English).
 */
export const buildIndexableContent = async (rawText: string): Promise<string> => {
    if (!rawText || rawText.trim().length === 0) return '';

    if (containsHindi(rawText)) {
        const keywords = await enrichHindiText(rawText);
        // Store: original Hindi + romanized + English — all searchable
        return `${rawText} ${keywords}`.trim();
    }

    // Non-Hindi text: store as-is
    return rawText;
};
