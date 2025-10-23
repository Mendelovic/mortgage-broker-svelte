import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { getSupabaseBrowserClient } from '$lib/supabase/client';
import type { LayoutLoad } from './$types';

let authListenerRegistered = false;

export const load: LayoutLoad = async ({ data, depends }) => {
	depends('supabase:auth');

	if (browser) {
		const supabase = getSupabaseBrowserClient();

		if (!authListenerRegistered) {
			supabase.auth.onAuthStateChange(() => {
				invalidate('supabase:auth');
			});
			authListenerRegistered = true;
		}
	}

	return {
		session: data.session,
		user: data.user
	};
};
