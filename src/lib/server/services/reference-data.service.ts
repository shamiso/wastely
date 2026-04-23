import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { ward, zone } from '$lib/server/db/schema';

type SeedWard = {
	code: string;
	name: string;
};

type SeedZone = {
	wardCode: string;
	code: string;
	name: string;
	centerLat: number;
	centerLng: number;
};

const seedWards: SeedWard[] = [
	{ code: 'CENTRAL', name: 'Central Ward' },
	{ code: 'WEST', name: 'Western Ward' },
	{ code: 'NORTH', name: 'Northern Ward' },
	{ code: 'EAST', name: 'Eastern Ward' },
	{ code: 'SOUTH', name: 'Southern Ward' }
];

const seedZones: SeedZone[] = [
	{ wardCode: 'WEST', code: 'BELVEDERE', name: 'Belvedere', centerLat: -17.8279, centerLng: 31.0064 },
	{ wardCode: 'NORTH', code: 'AVONDALE', name: 'Avondale', centerLat: -17.8014, centerLng: 31.0372 },
	{ wardCode: 'NORTH', code: 'BORROWDALE', name: 'Borrowdale', centerLat: -17.7728, centerLng: 31.0904 },
	{ wardCode: 'SOUTH', code: 'MBARE', name: 'Mbare', centerLat: -17.8676, centerLng: 31.0412 },
	{ wardCode: 'WEST', code: 'KUWADZANA', name: 'Kuwadzana', centerLat: -17.8007, centerLng: 30.9427 },
	{ wardCode: 'SOUTH', code: 'HIGHFIELD', name: 'Highfield', centerLat: -17.8562, centerLng: 30.9816 },
	{ wardCode: 'SOUTH', code: 'GLENVIEW', name: 'Glen View', centerLat: -17.8773, centerLng: 30.9596 },
	{ wardCode: 'SOUTH', code: 'WATERFALLS', name: 'Waterfalls', centerLat: -17.8851, centerLng: 31.0223 },
	{ wardCode: 'EAST', code: 'GREENDALE', name: 'Greendale', centerLat: -17.8247, centerLng: 31.0918 },
	{ wardCode: 'WEST', code: 'MARLBOROUGH', name: 'Marlborough', centerLat: -17.7778, centerLng: 31.0008 },
	{ wardCode: 'EAST', code: 'MSASA', name: 'Msasa', centerLat: -17.8408, centerLng: 31.1485 },
	{ wardCode: 'NORTH', code: 'HATCLIFFE', name: 'Hatcliffe', centerLat: -17.7341, centerLng: 31.0782 },
	{ wardCode: 'SOUTH', code: 'BUDIRIRO', name: 'Budiriro', centerLat: -17.8765, centerLng: 30.9447 },
	{ wardCode: 'WEST', code: 'DZIVARASEKWA', name: 'Dzivarasekwa', centerLat: -17.7903, centerLng: 30.9316 },
	{ wardCode: 'WEST', code: 'MUFAKOSE', name: 'Mufakose', centerLat: -17.8184, centerLng: 30.9641 }
];

let ensured = false;

export async function ensureReferenceData() {
	if (ensured) return;

	for (const entry of seedWards) {
		const [existingWard] = await db.select().from(ward).where(eq(ward.code, entry.code)).limit(1);
		if (!existingWard) {
			await db.insert(ward).values({
				code: entry.code,
				name: entry.name
			});
		}
	}

	const wards = await db.select().from(ward);
	const wardIdByCode = new Map(wards.map((entry) => [entry.code, entry.id]));

	for (const entry of seedZones) {
		const wardId = wardIdByCode.get(entry.wardCode);
		if (!wardId) continue;

		const [existingZone] = await db
			.select()
			.from(zone)
			.where(eq(zone.code, entry.code))
			.limit(1);

		if (existingZone) continue;

		await db.insert(zone).values({
			wardId,
			code: entry.code,
			name: entry.name,
			centerLat: entry.centerLat,
			centerLng: entry.centerLng
		});
	}

	ensured = true;
}
