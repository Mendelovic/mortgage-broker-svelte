import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const session = await locals.getSession();

	return {
		session,
		user: session?.user ?? null
	};
};
