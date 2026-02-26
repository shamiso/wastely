import type { LayoutServerLoad } from './$types';
import { requireSessionRedirect } from '$lib/server/services/authz.service';

export const load: LayoutServerLoad = async (event) => {
	requireSessionRedirect(event);
	return {
		user: event.locals.user,
		role: event.locals.role
	};
};
