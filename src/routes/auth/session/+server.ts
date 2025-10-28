
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await request.json().catch(() => ({ session: null }));

	if (session?.access_token && session?.refresh_token) {
		const { error } = await locals.supabase.auth.setSession({
			access_token: session.access_token,
			refresh_token: session.refresh_token
		});

		if (error) {
			return json({ success: false, error: error.message }, { status: 400 });
		}

		return json({ success: true });
	}

	// No session provided => clear cookies
	const { error } = await locals.supabase.auth.signOut();

	if (error) {
		return json({ success: false, error: error.message }, { status: 400 });
	}

	return json({ success: true });
};
