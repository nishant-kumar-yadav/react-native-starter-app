import { useState, useEffect, useRef, useCallback } from 'react';
import { searchDocuments, DocumentRecord } from '../Database';
import {
    loadSearchHistory, saveSearch, deleteSearchItem,
    clearSearchHistory, SearchHistoryItem,
} from '../utils/SearchHistory';

/**
 * useSearch — handles search text, debounced DB queries, results, and history.
 */
export const useSearch = (isDbReady: boolean) => {
    const [searchText, setSearchText] = useState('');
    const [debouncedSearchText, setDebouncedSearchText] = useState('');
    const [searchResults, setSearchResults] = useState<DocumentRecord[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSearchPending, setIsSearchPending] = useState(false);
    const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);

    // Load history on mount
    useEffect(() => {
        if (!isDbReady) return;
        loadSearchHistory().then(setSearchHistory);
    }, [isDbReady]);

    // Debounced search — 200ms after last keystroke
    useEffect(() => {
        if (!isDbReady || !searchText.trim()) {
            setSearchResults([]);
            setIsSearchPending(false);
            return;
        }

        setIsSearchPending(true);
        const timer = setTimeout(() => {
            const results = searchDocuments(searchText);
            setSearchResults(results);
            setDebouncedSearchText(searchText);
            setIsSearchPending(false);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchText, isDbReady]);

    // Save to history when user stops typing (debounced 800ms)
    useEffect(() => {
        if (!searchText.trim() || !isDbReady) return;
        const timer = setTimeout(async () => {
            const results = searchDocuments(searchText);
            await saveSearch(searchText, results.length);
            setSearchHistory(await loadSearchHistory());
        }, 800);
        return () => clearTimeout(timer);
    }, [searchText, isDbReady]);

    const handleSelectHistory = useCallback((query: string) => {
        setSearchText(query);
        setIsSearching(true);
    }, []);

    const handleDeleteHistory = useCallback(async (query: string) => {
        await deleteSearchItem(query);
        setSearchHistory(await loadSearchHistory());
    }, []);

    const handleClearHistory = useCallback(async () => {
        await clearSearchHistory();
        setSearchHistory([]);
    }, []);

    return {
        searchText, setSearchText, debouncedSearchText,
        searchResults,
        isSearching, setIsSearching, isSearchPending,
        searchHistory,
        handleSelectHistory, handleDeleteHistory, handleClearHistory,
    };
};
