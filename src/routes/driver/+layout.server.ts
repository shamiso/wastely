import type { LayoutServerLoad } from './$types';
import { requireExactRoleRedirect } from '$lib/server/services/authz.service';

export const load: LayoutServerLoad = async (event) => {
	requireExactRoleRedirect(event, 'driver');
	return {
		user: event.locals.user,
		role: event.locals.role
	};
};
