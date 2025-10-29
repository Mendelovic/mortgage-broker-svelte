import { env as publicEnv } from '$env/dynamic/public';
import { getAccessToken } from '$lib/supabase/client';
import type { ChatResponse, SessionDetail, SessionSummary } from '$lib/api/types';

const API_BASE_URL = normaliseBaseUrl(
	assertEnv('PUBLIC_API_BASE_URL', publicEnv.PUBLIC_API_BASE_URL)
);

type ApiFetchOptions = RequestInit & {
	query?: Record<string, string | number | boolean | undefined>;
	expect?: 'json' | 'text' | 'void';
};

async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	const url = buildUrl(path, options.query);
	const { expect = 'json', headers, ...init } = options;

	const token = await getAccessToken();
	const defaultHeaders: HeadersInit = {
		Accept: 'application/json',
		...(token ? { Authorization: `Bearer ${token}` } : {})
	};

	const response = await fetch(url, {
		credentials: 'include',
		...init,
		headers: {
			...defaultHeaders,
			...headers
		}
	});

	if (!response.ok) {
		let detail: unknown = await safeParseJson(response);
		if (detail && typeof detail === 'object' && 'detail' in detail) {
			detail = (detail as { detail: unknown }).detail;
		}
		throw new ApiError(response.status, response.statusText, detail);
	}

	switch (expect) {
		case 'json':
			return (await response.json()) as T;
		case 'text':
			return (await response.text()) as T;
		default:
			return undefined as T;
	}
}

function buildUrl(path: string, query?: ApiFetchOptions['query']) {
	const url = new URL(path, API_BASE_URL);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null) continue;
			url.searchParams.set(key, String(value));
		}
	}
	return url.toString();
}

async function safeParseJson(response: Response) {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly detail?: unknown
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export async function getSessions(limit = 50) {
	return apiFetch<SessionSummary[]>('/sessions', {
		query: { limit }
	});
}

export async function getSessionDetail(sessionId: string) {
	return apiFetch<SessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`);
}

export type ChatRequestPayload = {
	message: string;
	threadId?: string | null;
	files?: File[];
	signal?: AbortSignal;
};

export async function postChat(payload: ChatRequestPayload) {
	const formData = new FormData();
	formData.set('message', payload.message);
	if (payload.threadId) {
		formData.set('thread_id', payload.threadId);
	}
	if (payload.files?.length) {
		for (const file of payload.files) {
			formData.append('files', file);
		}
	}

	return apiFetch<ChatResponse>('/chat', {
		method: 'POST',
		body: formData,
		signal: payload.signal
	});
}

function assertEnv(name: string, value: string | undefined) {
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function normaliseBaseUrl(url: string) {
	try {
		const normalised = new URL(url);
		return normalised.href.replace(/\/$/, '');
	} catch {
		throw new Error(`Invalid PUBLIC_API_BASE_URL: ${url}`);
	}
}
