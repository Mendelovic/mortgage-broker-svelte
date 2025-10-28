import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const supabaseHandle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		global: {
			fetch: event.fetch
		},
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				cookies.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { path: '/', ...options });
				});
			}
		}
	}) as SupabaseClient;

	event.locals.safeGetSession = async () => {
		const {
			data: { session },
			error
		} = await event.locals.supabase.auth.getSession();

		if (error) {
			console.error('Failed to retrieve Supabase session', error);
			return { session: null, user: null };
		}

		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error: userError
		} = await event.locals.supabase.auth.getUser();

		if (userError || !user) {
			console.warn('Supabase session found but user validation failed', userError);
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const isAuthRoute = event.url.pathname.startsWith('/login');
	const isProtected = event.url.pathname === '/' || event.url.pathname.startsWith('/timeline');

	if (!session && isProtected) {
		throw redirect(303, '/login');
	}

	if (session && isAuthRoute) {
		throw redirect(303, '/');
	}

	return resolve(event);
};

export const handle = sequence(supabaseHandle, authGuard);
