import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL is not set');

export const db = drizzle({
	connection: {
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN
	},
	schema
});
