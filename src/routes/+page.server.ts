import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { fail, redirect, type Actions } from '@sveltejs/kit';

const API_BASE_URL = normaliseBaseUrl(PUBLIC_API_BASE_URL);
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);

export const actions: Actions = {
	default: async ({ request, locals, fetch }) => {
		const formData = await request.formData();

		const messageValue = formData.get('message');
		if (typeof messageValue !== 'string' || messageValue.trim().length === 0) {
			return fail(400, { message: 'הודעה נדרשת' });
		}
		const trimmedMessage = messageValue.trim();

		const {
			data: { session },
			error
		} = await locals.supabase.auth.getSession();

		if (error || !session) {
			throw redirect(303, '/login');
		}

		const outboundForm = new FormData();
		outboundForm.set('message', trimmedMessage);

		const threadId = formData.get('thread_id');
		if (typeof threadId === 'string' && threadId.trim().length > 0) {
			outboundForm.set('thread_id', threadId);
		}

		for (const value of formData.getAll('files')) {
			if (value instanceof File) {
				if (!isAllowedFile(value)) {
					return fail(415, { message: 'קובץ לא נתמך. ניתן לצרף רק PDF, PNG או JPG.' });
				}
				outboundForm.append('files', value);
			}
		}

		const response = await fetch(`${API_BASE_URL}/chat`, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: outboundForm
		});

		if (!response.ok) {
			const detail = await tryReadJson(response);
			const message = extractErrorMessage(detail) ?? 'שליחת ההודעה נכשלה';
			return fail(response.status, { message });
		}

		const result = await response.json();

		return {
			success: true,
			threadId: result?.thread_id ?? null
		};
	}
};

function normaliseBaseUrl(url: string | undefined) {
	if (!url) {
		throw new Error('Missing PUBLIC_API_BASE_URL');
	}
	const normalised = new URL(url);
	return normalised.href.replace(/\/$/, '');
}

async function tryReadJson(response: Response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function extractErrorMessage(detail: unknown) {
	if (!detail || typeof detail !== 'object') return null;
	if ('detail' in detail) {
		const value = (detail as { detail?: unknown }).detail;
		if (typeof value === 'string') {
			return value;
		}
	}
	return null;
}

function isAllowedFile(file: File) {
	const mime = file.type?.toLowerCase();
	if (mime && ALLOWED_MIME_TYPES.has(mime)) {
		return true;
	}
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return ALLOWED_EXTENSIONS.has(extension);
}
