import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveHomePath } from '$lib/server/services/authz.service';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, resolveHomePath(locals.role));
	}

	return {};
};
