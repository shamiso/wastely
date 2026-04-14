export type RoutePoint = {
	id: number;
	lat: number;
	lng: number;
	zoneId: number | null;
	label?: string | null;
};

export type RouteIssue = {
	id: number | string;
	issueType: 'congestion' | 'pothole' | 'flooding' | 'closure' | 'surface_damage' | 'accident' | 'other';
	severity: 'low' | 'medium' | 'high';
	trafficLevel: 'light' | 'moderate' | 'heavy' | 'standstill';
	latitude?: number | null;
	longitude?: number | null;
	startLatitude?: number | null;
	startLongitude?: number | null;
	endLatitude?: number | null;
	endLongitude?: number | null;
	estimatedDelayMinutes?: number | null;
};

export type OptimizedRouteResult = {
	orderedPoints: RoutePoint[];
	plannedDistanceKm: number;
	estimatedDurationMinutes: number;
	geometry: Array<[number, number]>;
	legDurationsMinutes: number[];
	metadata: {
		riskScore: number;
		congestionScore: number;
		blockedLegs: number;
		issueIds: Array<number | string>;
	};
};

type PointLike = Pick<RoutePoint, 'lat' | 'lng'>;

const EARTH_RADIUS_KM = 6371;

function toRad(value: number) {
	return (value * Math.PI) / 180;
}

export function haversineDistanceKm(a: PointLike, b: PointLike) {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function toCartesian(point: PointLike) {
	return {
		x: point.lng * Math.cos(toRad(point.lat)) * 111.32,
		y: point.lat * 110.57
	};
}

function pointToSegmentDistanceKm(point: PointLike, start: PointLike, end: PointLike) {
	const p = toCartesian(point);
	const a = toCartesian(start);
	const b = toCartesian(end);
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const abSquared = abx ** 2 + aby ** 2;
	if (abSquared === 0) {
		return Math.hypot(p.x - a.x, p.y - a.y);
	}

	const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abSquared));
	const projectionX = a.x + t * abx;
	const projectionY = a.y + t * aby;
	return Math.hypot(p.x - projectionX, p.y - projectionY);
}

function midpoint(a: PointLike, b: PointLike): PointLike {
	return {
		lat: (a.lat + b.lat) / 2,
		lng: (a.lng + b.lng) / 2
	};
}

function severityFactor(severity: RouteIssue['severity']) {
	return severity === 'high' ? 1.6 : severity === 'medium' ? 1.2 : 0.85;
}

function trafficFactor(level: RouteIssue['trafficLevel']) {
	return level === 'standstill' ? 2.6 : level === 'heavy' ? 1.8 : level === 'moderate' ? 1.25 : 1;
}

function issueTypeFactor(type: RouteIssue['issueType']) {
	switch (type) {
		case 'closure':
			return 3.5;
		case 'flooding':
			return 2.4;
		case 'accident':
			return 2.1;
		case 'congestion':
			return 1.9;
		case 'surface_damage':
			return 1.5;
		case 'pothole':
			return 1.35;
		default:
			return 1.1;
	}
}

function proximityFactor(distanceKm: number) {
	if (distanceKm <= 0.35) return 1;
	if (distanceKm <= 0.75) return 0.82;
	if (distanceKm <= 1.5) return 0.52;
	if (distanceKm <= 2.5) return 0.22;
	return 0;
}

function rushHourFactor(departureHour: number) {
	if ((departureHour >= 7 && departureHour <= 9) || (departureHour >= 16 && departureHour <= 18)) {
		return 1.25;
	}

	if (departureHour >= 6 && departureHour <= 20) return 1.08;
	return 0.96;
}

export function estimateLegTravel(a: RoutePoint, b: RoutePoint, issues: RouteIssue[], departureHour = 8) {
	const distanceKm = haversineDistanceKm(a, b);
	const baseMinutes = (distanceKm / 26) * 60;
	const legMidpoint = midpoint(a, b);
	let penaltyMinutes = 0;
	let riskScore = 0;
	let congestionScore = 0;
	let blocked = false;
	const issueIds: Array<number | string> = [];

	for (const issue of issues) {
		const start =
			issue.startLatitude !== null &&
			issue.startLatitude !== undefined &&
			issue.startLongitude !== null &&
			issue.startLongitude !== undefined
				? { lat: issue.startLatitude, lng: issue.startLongitude }
				: issue.latitude !== null && issue.latitude !== undefined && issue.longitude !== null && issue.longitude !== undefined
					? { lat: issue.latitude, lng: issue.longitude }
					: null;
		const end =
			issue.endLatitude !== null &&
			issue.endLatitude !== undefined &&
			issue.endLongitude !== null &&
			issue.endLongitude !== undefined
				? { lat: issue.endLatitude, lng: issue.endLongitude }
				: start;

		if (!start || !end) continue;

		const distanceToIssue = pointToSegmentDistanceKm(legMidpoint, start, end);
		const influence = proximityFactor(distanceToIssue);
		if (influence <= 0) continue;

		const combinedFactor =
			severityFactor(issue.severity) * trafficFactor(issue.trafficLevel) * issueTypeFactor(issue.issueType);
		const delay =
			Math.max(4, issue.estimatedDelayMinutes ?? 0) * influence * (issue.issueType === 'closure' ? 2.1 : 1);

		penaltyMinutes += combinedFactor * 2.5 * influence + delay;
		riskScore += combinedFactor * 8 * influence;
		congestionScore += trafficFactor(issue.trafficLevel) * 6 * influence;
		blocked ||= issue.issueType === 'closure' && influence >= 0.5;
		issueIds.push(issue.id);
	}

	const travelMinutes = baseMinutes * rushHourFactor(departureHour) + penaltyMinutes;

	return {
		distanceKm: Number(distanceKm.toFixed(2)),
		travelMinutes: Number(travelMinutes.toFixed(2)),
		riskScore: Number(riskScore.toFixed(2)),
		congestionScore: Number(congestionScore.toFixed(2)),
		blocked,
		issueIds
	};
}

export function optimizeRoute(points: RoutePoint[], issues: RouteIssue[], departureHour = 8): OptimizedRouteResult {
	if (points.length === 0) {
		return {
			orderedPoints: [],
			plannedDistanceKm: 0,
			estimatedDurationMinutes: 0,
			geometry: [],
			legDurationsMinutes: [],
			metadata: {
				riskScore: 0,
				congestionScore: 0,
				blockedLegs: 0,
				issueIds: []
			}
		};
	}

	if (points.length === 1) {
		return {
			orderedPoints: points,
			plannedDistanceKm: 0,
			estimatedDurationMinutes: 0,
			geometry: [[points[0].lat, points[0].lng]],
			legDurationsMinutes: [],
			metadata: {
				riskScore: 0,
				congestionScore: 0,
				blockedLegs: 0,
				issueIds: []
			}
		};
	}

	const remaining = [...points];
	const ordered: RoutePoint[] = [remaining.shift() as RoutePoint];
	const legDurationsMinutes: number[] = [];
	let plannedDistanceKm = 0;
	let estimatedDurationMinutes = 0;
	let riskScore = 0;
	let congestionScore = 0;
	let blockedLegs = 0;
	const issueIds = new Set<number | string>();

	while (remaining.length > 0) {
		const current = ordered[ordered.length - 1];
		let bestIndex = 0;
		let bestScore = Number.POSITIVE_INFINITY;
		let bestLeg = estimateLegTravel(current, remaining[0], issues, departureHour);

		for (let index = 0; index < remaining.length; index += 1) {
			const candidate = remaining[index];
			const leg = estimateLegTravel(current, candidate, issues, departureHour);
			const zonePenalty = candidate.zoneId === null ? 0 : candidate.zoneId % 3;
			const compositeScore =
				leg.travelMinutes +
				leg.riskScore * 0.22 +
				leg.congestionScore * 0.18 +
				(leg.blocked ? 200 : 0) +
				zonePenalty;

			if (compositeScore < bestScore) {
				bestScore = compositeScore;
				bestIndex = index;
				bestLeg = leg;
			}
		}

		const nextPoint = remaining.splice(bestIndex, 1)[0];
		ordered.push(nextPoint);
		plannedDistanceKm += bestLeg.distanceKm;
		estimatedDurationMinutes += bestLeg.travelMinutes;
		legDurationsMinutes.push(bestLeg.travelMinutes);
		riskScore += bestLeg.riskScore;
		congestionScore += bestLeg.congestionScore;
		if (bestLeg.blocked) blockedLegs += 1;
		for (const issueId of bestLeg.issueIds) issueIds.add(issueId);
	}

	return {
		orderedPoints: ordered,
		plannedDistanceKm: Number(plannedDistanceKm.toFixed(2)),
		estimatedDurationMinutes: Number(estimatedDurationMinutes.toFixed(2)),
		geometry: ordered.map((point) => [point.lat, point.lng]),
		legDurationsMinutes,
		metadata: {
			riskScore: Number(riskScore.toFixed(2)),
			congestionScore: Number(congestionScore.toFixed(2)),
			blockedLegs,
			issueIds: [...issueIds]
		}
	};
}
