import { browser } from '$app/environment';
import type { Session } from '@supabase/supabase-js';

/**
 * Sync the Supabase session cookie with the backend.
 * Helps keep Supabase auth state aligned between client and server cookies.
 */
export async function syncSessionCookie(session: Session | null): Promise<boolean> {
	if (!browser) {
		return false;
	}

	const payload = session
		? {
				access_token: session.access_token,
				refresh_token: session.refresh_token
			}
		: null;

	try {
		const response = await fetch('/auth/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ session: payload }),
			credentials: 'same-origin'
		});

		if (!response.ok) {
			console.error('Failed to sync session', await response.text());
			return false;
		}

		return true;
	} catch (error) {
		console.error('Failed to sync session', error);
		return false;
	}
}
