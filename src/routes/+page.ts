import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const parentData = await parent();
	const { supabase, session, user } = parentData;

	if (!user) {
		redirect(303, '/login');
	}

	return { supabase, session, user };
};
