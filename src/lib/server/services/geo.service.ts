import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { collectionPoint, zone } from '$lib/server/db/schema';

export type GeoPoint = {
	id: number;
	lat: number;
	lng: number;
};

export type ZoneResolution = {
	zoneId: number;
	zoneName: string;
	distanceKm: number;
	confidence: 'high' | 'medium' | 'low';
	source: 'collection_point' | 'zone_center';
};

export type AddressSuggestion = {
	label: string;
	latitude: number;
	longitude: number;
	source: 'history' | 'collection_point' | 'zone' | 'nominatim';
	zoneId: number | null;
	zoneName: string | null;
	zoneConfidence: ZoneResolution['confidence'] | null;
};

const EARTH_RADIUS_KM = 6371;

function toRad(value: number): number {
	return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: Pick<GeoPoint, 'lat' | 'lng'>, b: Pick<GeoPoint, 'lat' | 'lng'>): number {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function orderByNearestNeighbor(points: GeoPoint[]): GeoPoint[] {
	if (points.length <= 2) return points;

	const remaining = [...points];
	const ordered: GeoPoint[] = [remaining.shift() as GeoPoint];

	while (remaining.length > 0) {
		const current = ordered[ordered.length - 1];
		let nearestIndex = 0;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (let i = 0; i < remaining.length; i += 1) {
			const candidate = remaining[i];
			const distance = haversineDistanceKm(current, candidate);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestIndex = i;
			}
		}

		ordered.push(remaining.splice(nearestIndex, 1)[0]);
	}

	return ordered;
}

async function getLocalAddressMatches(query: string): Promise<AddressSuggestion[]> {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return [];

	const collectionPointRows = await db
		.select({
			label: collectionPoint.label,
			address: collectionPoint.address,
			latitude: collectionPoint.latitude,
			longitude: collectionPoint.longitude,
			zoneId: zone.id,
			zoneName: zone.name
		})
		.from(collectionPoint)
		.innerJoin(zone, eq(collectionPoint.zoneId, zone.id))
		.where(eq(collectionPoint.active, true));

	const zoneRows = await db
		.select({
			zoneId: zone.id,
			zoneName: zone.name,
			latitude: zone.centerLat,
			longitude: zone.centerLng
		})
		.from(zone);

	const localSuggestions: AddressSuggestion[] = [];

	for (const row of collectionPointRows) {
		const searchText = `${row.label} ${row.address ?? ''} ${row.zoneName}`.toLowerCase();
		if (!searchText.includes(normalizedQuery)) continue;

		localSuggestions.push({
			label: row.address ? `${row.label}, ${row.address}` : row.label,
			latitude: row.latitude,
			longitude: row.longitude,
			source: 'collection_point',
			zoneId: row.zoneId,
			zoneName: row.zoneName,
			zoneConfidence: 'high'
		});
	}

	for (const row of zoneRows) {
		if (!row.latitude || !row.longitude) continue;
		if (!row.zoneName.toLowerCase().includes(normalizedQuery)) continue;

		localSuggestions.push({
			label: row.zoneName,
			latitude: row.latitude,
			longitude: row.longitude,
			source: 'zone',
			zoneId: row.zoneId,
			zoneName: row.zoneName,
			zoneConfidence: 'medium'
		});
	}

	return localSuggestions.slice(0, 5);
}

function buildSearchQuery(query: string): string {
	const normalized = query.trim();
	if (!normalized) return normalized;
	if (/zimbabwe/i.test(normalized)) return normalized;
	if (/harare/i.test(normalized)) return `${normalized}, Zimbabwe`;
	return `${normalized}, Harare, Zimbabwe`;
}

async function getRemoteAddressMatches(query: string): Promise<AddressSuggestion[]> {
	if (!query.trim()) return [];

	const url = new URL('https://nominatim.openstreetmap.org/search');
	url.searchParams.set('q', buildSearchQuery(query));
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '5');
	url.searchParams.set('countrycodes', 'zw');
	url.searchParams.set('addressdetails', '1');

	try {
		const response = await fetch(url, {
			headers: {
				accept: 'application/json',
				'accept-language': 'en'
			}
		});

		if (!response.ok) return [];

		const payload = (await response.json()) as Array<{
			display_name?: string;
			lat?: string;
			lon?: string;
		}>;

		const suggestions: AddressSuggestion[] = [];

		for (const entry of payload) {
			const latitude = Number(entry.lat);
			const longitude = Number(entry.lon);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

			const resolvedZone = await resolveZoneFromCoordinates(latitude, longitude);
			suggestions.push({
				label: entry.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
				latitude: Number(latitude.toFixed(6)),
				longitude: Number(longitude.toFixed(6)),
				source: 'nominatim',
				zoneId: resolvedZone?.zoneId ?? null,
				zoneName: resolvedZone?.zoneName ?? null,
				zoneConfidence: resolvedZone?.confidence ?? null
			});
		}

		return suggestions;
	} catch {
		return [];
	}
}

function dedupeSuggestions(suggestions: AddressSuggestion[]): AddressSuggestion[] {
	const seen = new Set<string>();
	const unique: AddressSuggestion[] = [];

	for (const suggestion of suggestions) {
		const key = `${suggestion.label.toLowerCase()}::${suggestion.latitude.toFixed(5)}::${suggestion.longitude.toFixed(5)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(suggestion);
	}

	return unique;
}

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const [localSuggestions, remoteSuggestions] = await Promise.all([
		getLocalAddressMatches(trimmed),
		getRemoteAddressMatches(trimmed)
	]);

	return dedupeSuggestions([...localSuggestions, ...remoteSuggestions]).slice(0, 8);
}

export async function resolveZoneFromCoordinates(
	lat: number,
	lng: number
): Promise<ZoneResolution | null> {
	const collectionPointRows = await db
		.select({
			zoneId: zone.id,
			zoneName: zone.name,
			latitude: collectionPoint.latitude,
			longitude: collectionPoint.longitude
		})
		.from(collectionPoint)
		.innerJoin(zone, eq(collectionPoint.zoneId, zone.id))
		.where(eq(collectionPoint.active, true));

	let nearestCollectionPoint: ZoneResolution | null = null;
	for (const row of collectionPointRows) {
		const distanceKm = haversineDistanceKm({ lat, lng }, { lat: row.latitude, lng: row.longitude });
		if (!nearestCollectionPoint || distanceKm < nearestCollectionPoint.distanceKm) {
			nearestCollectionPoint = {
				zoneId: row.zoneId,
				zoneName: row.zoneName,
				distanceKm,
				confidence: distanceKm <= 1.5 ? 'high' : distanceKm <= 3 ? 'medium' : 'low',
				source: 'collection_point'
			};
		}
	}

	const zoneRows = await db
		.select({
			zoneId: zone.id,
			zoneName: zone.name,
			latitude: zone.centerLat,
			longitude: zone.centerLng
		})
		.from(zone);

	let nearestZoneCenter: ZoneResolution | null = null;
	for (const row of zoneRows) {
		if (row.latitude === null || row.longitude === null) continue;
		const distanceKm = haversineDistanceKm({ lat, lng }, { lat: row.latitude, lng: row.longitude });
		if (!nearestZoneCenter || distanceKm < nearestZoneCenter.distanceKm) {
			nearestZoneCenter = {
				zoneId: row.zoneId,
				zoneName: row.zoneName,
				distanceKm,
				confidence: distanceKm <= 3 ? 'medium' : 'low',
				source: 'zone_center'
			};
		}
	}

	if (nearestCollectionPoint && nearestZoneCenter) {
		return nearestCollectionPoint.distanceKm <= nearestZoneCenter.distanceKm
			? nearestCollectionPoint
			: nearestZoneCenter;
	}

	return nearestCollectionPoint ?? nearestZoneCenter;
}

export async function getOsrmTripDistanceKm(points: Array<Pick<GeoPoint, 'lat' | 'lng'>>): Promise<number | null> {
	const baseUrl = env.OSRM_BASE_URL;
	if (!baseUrl || points.length < 2) return null;

	const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
	const url = `${baseUrl.replace(/\/+$/, '')}/route/v1/driving/${coordinates}?overview=false`;

	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const payload = (await response.json()) as {
			routes?: Array<{ distance?: number }>;
		};
		const distanceMeters = payload.routes?.[0]?.distance;
		if (!distanceMeters) return null;
		return distanceMeters / 1000;
	} catch {
		return null;
	}
}
