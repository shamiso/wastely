import { env } from '$env/dynamic/private';

export type GeoPoint = {
	id: number;
	lat: number;
	lng: number;
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
