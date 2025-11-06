import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const { session, user } = await locals.safeGetSession();
	const storedSidebar = cookies.get(SIDEBAR_COOKIE_NAME);
	const sidebarOpen = storedSidebar === 'false' ? false : true;

	return {
		session,
		user,
		cookies: cookies.getAll(),
		sidebarOpen
	};
};
