import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type SessionPayload = {
	session: {
		access_token: string;
		refresh_token: string;
	} | null;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	let payload: SessionPayload;

	try {
		payload = (await request.json()) as SessionPayload;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const session = payload?.session ?? null;

	if (session) {
		if (!session.access_token || !session.refresh_token) {
			return json({ error: 'Missing access_token or refresh_token' }, { status: 400 });
		}

		const { error } = await locals.supabase.auth.setSession({
			access_token: session.access_token,
			refresh_token: session.refresh_token
		});

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true });
	}

	const { error } = await locals.supabase.auth.signOut();
	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
