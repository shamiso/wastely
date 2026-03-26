import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { APIError } from 'better-auth';
import { auth } from '$lib/server/auth';
import {
	resolveHomePath,
	syncUserRoleForPortal,
	toAppRole
} from '$lib/server/services/authz.service';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/');
	return {};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const requestedRole = toAppRole(formData.get('role')?.toString());
		let actualRole = requestedRole;

		try {
			const session = await auth.api.signInEmail({
				body: {
					email,
					password,
					callbackURL: undefined
				}
			});

			actualRole = await syncUserRoleForPortal(session.user.id, requestedRole);
		} catch (err) {
			if (err instanceof APIError) return fail(400, { message: err.message || 'Sign in failed' });
			return fail(500, { message: 'Unexpected error during sign in' });
		}

		throw redirect(302, actualRole === requestedRole ? resolveHomePath(requestedRole) : resolveHomePath(actualRole));
	},
	signUpEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';
		const requestedRole = toAppRole(formData.get('role')?.toString());
		let actualRole = requestedRole;

		try {
			const registration = await auth.api.signUpEmail({
				body: {
					email,
					password,
					name,
					callbackURL: undefined
				}
			});

			actualRole = await syncUserRoleForPortal(registration.user.id, requestedRole);
		} catch (err) {
			if (err instanceof APIError) return fail(400, { message: err.message || 'Registration failed' });
			return fail(500, { message: 'Unexpected error during registration' });
		}

		throw redirect(302, resolveHomePath(actualRole));
	}
};
