import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		global: {
			fetch: event.fetch
		},
		cookies: {
			get: (key) => event.cookies.get(key),
			set: (key, value, options) => {
				event.cookies.set(key, value, { path: '/', ...options });
			},
			remove: (key, options) => {
				event.cookies.delete(key, { path: '/', ...options });
			}
		}
	}) as SupabaseClient;

	event.locals.getSession = async () => {
		const {
			data: { session },
			error
		} = await event.locals.supabase.auth.getSession();

		if (error) {
			console.error('Failed to retrieve Supabase session', error);
			return null;
		}

		return session;
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};
