import type { LayoutServerLoad } from './$types';
import { requireRoleRedirect } from '$lib/server/services/authz.service';

export const load: LayoutServerLoad = async (event) => {
	requireRoleRedirect(event, 'driver');
	return {
		user: event.locals.user,
		role: event.locals.role
	};
};
