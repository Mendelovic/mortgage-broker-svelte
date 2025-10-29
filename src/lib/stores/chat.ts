import { derived, get, writable } from 'svelte/store';
import { getSessionDetail, getSessions, postChat, type ChatRequestPayload } from '$lib/api/client';
import type { SessionDetail, SessionSummary } from '$lib/api/types';

export const sessionSummariesStore = writable<SessionSummary[]>([]);
export const selectedSessionIdStore = writable<string | null>(null);

const sessionDetailsStore = writable<Map<string, SessionDetail>>(new Map());
const loadingSummariesStore = writable(false);
const loadingSessionIdsStore = writable<Set<string>>(new Set());
const sendingMessageStore = writable(false);
const lastErrorStore = writable<string | null>(null);

export const selectedSummaryStore = derived(
	[sessionSummariesStore, selectedSessionIdStore],
	([$summaries, $selectedId]) =>
		$summaries.find((summary) => summary.session_id === $selectedId) ?? null
);

export const selectedSessionStore = derived(
	[sessionDetailsStore, selectedSessionIdStore],
	([$details, $selectedId]) => {
		if (!$selectedId) return null;
		return $details.get($selectedId) ?? null;
	}
);

export const chatLoadingStore = derived(
	[loadingSummariesStore, loadingSessionIdsStore, sendingMessageStore],
	([$summariesLoading, $sessionLoading, $sending]) => ({
		isLoadingSummaries: $summariesLoading,
		loadingSessionIds: $sessionLoading,
		isSending: $sending
	})
);

export const chatErrorStore = derived(lastErrorStore, ($error) => $error);

export async function refreshSessions(limit = 50) {
	if (get(loadingSummariesStore)) return;

	loadingSummariesStore.set(true);
	lastErrorStore.set(null);

	try {
		const summaries = await getSessions(limit);
		sessionSummariesStore.set(summaries);

		const currentSelected = get(selectedSessionIdStore);
		if (!currentSelected && summaries.length > 0) {
			selectedSessionIdStore.set(summaries[0].session_id);
		} else if (
			currentSelected &&
			!summaries.some((summary) => summary.session_id === currentSelected)
		) {
			selectedSessionIdStore.set(summaries[0]?.session_id ?? null);
		}
	} catch (error) {
		lastErrorStore.set(extractErrorMessage(error));
		throw error;
	} finally {
		loadingSummariesStore.set(false);
	}
}

export async function loadSessionDetail(sessionId: string, { force = false } = {}) {
	const cache = get(sessionDetailsStore);
	if (!force && cache.has(sessionId)) {
		return cache.get(sessionId) ?? null;
	}

	const loadingSet = new Set(get(loadingSessionIdsStore));
	if (loadingSet.has(sessionId)) {
		return cache.get(sessionId) ?? null;
	}

	loadingSet.add(sessionId);
	loadingSessionIdsStore.set(loadingSet);
	lastErrorStore.set(null);

	try {
		const detail = await getSessionDetail(sessionId);
		sessionDetailsStore.update((map) => {
			const next = new Map(map);
			next.set(sessionId, detail);
			return next;
		});
		return detail;
	} catch (error) {
		lastErrorStore.set(extractErrorMessage(error));
		throw error;
	} finally {
		const next = new Set(loadingSet);
		next.delete(sessionId);
		loadingSessionIdsStore.set(next);
	}
}

export function getSelectedSessionDetail() {
	return get(selectedSessionStore);
}

export function getSelectedSessionId() {
	return get(selectedSessionIdStore);
}

export async function selectSession(sessionId: string, { forceReload = false } = {}) {
	selectedSessionIdStore.set(sessionId);
	await loadSessionDetail(sessionId, { force: forceReload });
}

export async function initializeChat() {
	if (get(sessionSummariesStore).length === 0 && !get(loadingSummariesStore)) {
		await refreshSessions();
	}

	const selectedId = get(selectedSessionIdStore);
	if (selectedId) {
		await loadSessionDetail(selectedId).catch(() => undefined);
	}
}

export async function sendChatMessage(
	payload: Omit<ChatRequestPayload, 'threadId'> & { threadId?: string | null }
) {
	if (get(sendingMessageStore)) {
		return null;
	}

	sendingMessageStore.set(true);
	lastErrorStore.set(null);

	const abortController = payload.signal ? undefined : new AbortController();

	try {
		const response = await postChat({
			...payload,
			threadId: payload.threadId ?? getSelectedSessionId() ?? undefined,
			signal: payload.signal ?? abortController?.signal
		});

		await Promise.all([
			refreshSessions().catch(() => undefined),
			loadSessionDetail(response.thread_id, { force: true }).catch(() => undefined)
		]);

		selectedSessionIdStore.set(response.thread_id);
		return response;
	} catch (error) {
		lastErrorStore.set(extractErrorMessage(error));
		throw error;
	} finally {
		sendingMessageStore.set(false);
	}
}

function extractErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	return 'An unexpected error occurred';
}
