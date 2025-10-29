import { invalidate } from '$app/navigation';
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';
import { getSupabaseClient } from '$lib/supabase/client';

let authListenerRegistered = false;

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabase = getSupabaseClient(fetch, {
		getAll: () => data.cookies
	});

	if (browser && !authListenerRegistered) {
		supabase.auth.onAuthStateChange(() => {
			invalidate('supabase:auth');
		});
		authListenerRegistered = true;
	}

	const {
		data: { session }
	} = await supabase.auth.getSession();

	const {
		data: { user }
	} = await supabase.auth.getUser();

	return {
		supabase,
		session,
		user
	};
};
