import { browser } from '$app/environment';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(
	fetchFn?: typeof fetch,
	cookieAdapter?: { getAll(): Array<{ name: string; value: string }> }
) {
	if (browser) {
		if (!browserClient) {
			browserClient = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
				global: { fetch: fetchFn }
			});
		}
		return browserClient;
	}

	return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		global: { fetch: fetchFn },
		cookies: {
			getAll: () => cookieAdapter?.getAll() ?? []
		}
	});
}

export async function getAccessToken() {
	const client = getSupabaseClient();
	if (!client) return null;

	const {
		data: { session }
	} = await client.auth.getSession();

	return session?.access_token ?? null;
}
