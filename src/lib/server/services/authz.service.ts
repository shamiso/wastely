import type { RequestEvent } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userRole } from '$lib/server/db/schema';

export type AppRole = 'citizen' | 'driver' | 'admin';

const roleRank: Record<AppRole, number> = {
	citizen: 0,
	driver: 1,
	admin: 2
};

export function hasMinimumRole(currentRole: AppRole | null | undefined, requiredRole: AppRole): boolean {
	if (!currentRole) return false;
	return roleRank[currentRole] >= roleRank[requiredRole];
}

export function resolveHomePath(role: AppRole | null | undefined): string {
	if (role === 'admin') return '/admin/dashboard';
	if (role === 'driver') return '/driver/run';
	return '/citizen/report';
}

export async function getUserRole(userId: string): Promise<AppRole | null> {
	const [row] = await db
		.select({ role: userRole.role })
		.from(userRole)
		.where(eq(userRole.userId, userId))
		.limit(1);

	return (row?.role as AppRole | undefined) ?? null;
}

export async function ensureUserRole(userId: string): Promise<AppRole> {
	const existing = await getUserRole(userId);
	if (existing) return existing;

	await db.insert(userRole).values({
		userId,
		role: 'citizen',
		updatedAt: Date.now()
	});

	return 'citizen';
}

export function requireUser(event: RequestEvent) {
	if (!event.locals.user) throw error(401, 'You need to sign in.');
	return event.locals.user;
}

export function requireRole(event: RequestEvent, role: AppRole) {
	const user = requireUser(event);
	if (!hasMinimumRole(event.locals.role, role)) throw error(403, 'You do not have permission.');
	return user;
}

export function requireSessionRedirect(event: RequestEvent, path = '/login') {
	if (!event.locals.user) throw redirect(302, path);
}

export function requireRoleRedirect(event: RequestEvent, role: AppRole, path = '/') {
	requireSessionRedirect(event);
	if (!hasMinimumRole(event.locals.role, role)) throw redirect(302, path);
}
