import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import {
	estimateLegTravel,
	optimizeRoute,
	type RouteIssue,
	type RoutePoint
} from '$lib/domain/route-optimizer';
import { db } from '$lib/server/db';
import { getOsrmRouteSnapshot } from '$lib/server/services/geo.service';
import {
	citizenReport,
	driverEventLog,
	roadConditionReport,
	routeRun,
	routeStop,
	zone
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';

const stopStatuses = ['pending', 'done', 'skipped'] as const;
type StopStatus = (typeof stopStatuses)[number];
const roadIssueTypes = [
	'congestion',
	'pothole',
	'flooding',
	'closure',
	'surface_damage',
	'accident',
	'other'
] as const;
const trafficLevels = ['light', 'moderate', 'heavy', 'standstill'] as const;

type RunSummaryPayload = {
	collectionVolumeKg?: number;
	issues?: string;
	delays?: string;
	roadConditions?: string;
	missedPickups?: number;
};

function parseRunSummary(payloadJson: string | null): RunSummaryPayload | null {
	if (!payloadJson) return null;

	try {
		return JSON.parse(payloadJson) as RunSummaryPayload;
	} catch {
		return null;
	}
}

function parseJson<T>(payloadJson: string | null): T | null {
	if (!payloadJson) return null;

	try {
		return JSON.parse(payloadJson) as T;
	} catch {
		return null;
	}
}

function roundCoordinate(value: number | undefined | null) {
	if (value === undefined || value === null) return null;
	return Number(value.toFixed(6));
}

function coordinatesMatch(
	a: { latitude: number; longitude: number } | null,
	b: { latitude: number; longitude: number } | null
) {
	if (!a || !b) return false;
	return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
}

function calculateElapsedMinutes(run: typeof routeRun.$inferSelect) {
	if (!run.startedAt) return 0;
	const endTime = run.completedAt ?? Date.now();
	return Number(((endTime - run.startedAt) / 60000).toFixed(2));
}

async function listLiveRoadIssues(routeRunId: number, zoneIds: number[]) {
	const rows = await db
		.select()
		.from(roadConditionReport)
		.where(gte(roadConditionReport.createdAt, Date.now() - 14 * 24 * 60 * 60 * 1000))
		.orderBy(desc(roadConditionReport.createdAt));

	return rows.filter((issue) => {
		if (issue.routeRunId && issue.routeRunId !== routeRunId) return false;
		if (issue.zoneId === null) return true;
		return zoneIds.includes(issue.zoneId);
	});
}

function getRunAnchor(
	run: typeof routeRun.$inferSelect,
	stops: Array<typeof routeStop.$inferSelect>,
	liveLocation?: {
		latitude: number;
		longitude: number;
	} | null
): RoutePoint | null {
	if (liveLocation) {
		return {
			id: 0,
			lat: liveLocation.latitude,
			lng: liveLocation.longitude,
			zoneId: null,
			label: 'Current location'
		};
	}

	const completedStops = stops.filter((stop) => stop.status !== 'pending');
	const lastCompletedStop = completedStops[completedStops.length - 1];

	if (lastCompletedStop) {
		return {
			id: -lastCompletedStop.id,
			lat: lastCompletedStop.latitude,
			lng: lastCompletedStop.longitude,
			zoneId: lastCompletedStop.zoneId,
			label: `Stop ${lastCompletedStop.sequence}`
		};
	}

	const firstPendingStop = stops.find((stop) => stop.status === 'pending');
	const originMatchesFirstPending =
		run.originLatitude !== null &&
		run.originLongitude !== null &&
		firstPendingStop !== undefined &&
		coordinatesMatch(
			{
				latitude: run.originLatitude,
				longitude: run.originLongitude
			},
			{
				latitude: firstPendingStop.latitude,
				longitude: firstPendingStop.longitude
			}
		);

	if (
		run.originLatitude !== null &&
		run.originLongitude !== null &&
		run.status !== 'planned' &&
		!originMatchesFirstPending
	) {
		return {
			id: 0,
			lat: run.originLatitude,
			lng: run.originLongitude,
			zoneId: null,
			label: 'Route start'
		};
	}

	return null;
}

function buildBaselineLegs(
	anchor: RoutePoint,
	pendingStops: Array<typeof routeStop.$inferSelect>,
	issues: RouteIssue[],
	departureHour: number
) {
	const baselineLegs: number[] = [];
	let current = anchor;

	for (const stop of pendingStops) {
		const point: RoutePoint = {
			id: stop.id,
			lat: stop.latitude,
			lng: stop.longitude,
			zoneId: stop.zoneId,
			label: `Stop ${stop.sequence}`
		};
		const leg = estimateLegTravel(current, point, issues, departureHour);
		baselineLegs.push(leg.travelMinutes);
		current = point;
	}

	return baselineLegs;
}

async function buildRouteGeometry(points: RoutePoint[]) {
	if (points.length === 0) return null;

	const osrmRoute = await getOsrmRouteSnapshot(
		points.map((point) => ({
			lat: point.lat,
			lng: point.lng
		}))
	);

	if (osrmRoute) {
		return {
			geometry: osrmRoute.geometry,
			distanceKm: osrmRoute.distanceKm,
			durationMinutes: osrmRoute.durationMinutes
		};
	}

	return {
		geometry: {
			type: 'LineString' as const,
			coordinates: points.map((point) => [point.lng, point.lat] as [number, number])
		},
		distanceKm: null,
		durationMinutes: null
	};
}

async function resolveRunDisplayGeometry(
	stops: Array<typeof routeStop.$inferSelect>,
	storedGeometry:
		| {
				type: 'LineString';
				coordinates: Array<[number, number]>;
		  }
		| null
) {
	if (stops.length < 2) {
		return storedGeometry;
	}

	if (storedGeometry && storedGeometry.coordinates.length > stops.length) {
		return storedGeometry;
	}

	const routeGeometry = await buildRouteGeometry(
		stops.map((stop) => ({
			id: stop.id,
			lat: stop.latitude,
			lng: stop.longitude,
			zoneId: stop.zoneId,
			label: `Stop ${stop.sequence}`
		}))
	);

	return routeGeometry?.geometry ?? storedGeometry;
}

async function buildLiveRouteSnapshot(
	run: typeof routeRun.$inferSelect,
	stops: Array<typeof routeStop.$inferSelect>,
	liveLocation?: {
		latitude: number;
		longitude: number;
	} | null
) {
	const pendingStops = stops.filter((stop) => stop.status === 'pending');
	if (pendingStops.length === 0) {
		return {
			liveRoute: null,
			liveStopIds: [] as number[]
		};
	}

	const anchor = getRunAnchor(run, stops, liveLocation);
	if (!anchor) {
		return {
			liveRoute: null,
			liveStopIds: pendingStops.map((stop) => stop.id)
		};
	}

	const zoneIds = [
		...new Set(
			pendingStops
				.map((stop) => stop.zoneId)
				.filter((zoneId): zoneId is number => zoneId !== null)
		)
	];
	const rawIssues = await listLiveRoadIssues(run.id, zoneIds);
	const issues: RouteIssue[] = rawIssues.map((issue) => ({
		id: issue.id,
		issueType: issue.issueType,
		severity: issue.severity,
		trafficLevel: issue.trafficLevel,
		latitude: issue.latitude,
		longitude: issue.longitude,
		startLatitude: issue.startLatitude,
		startLongitude: issue.startLongitude,
		endLatitude: issue.endLatitude,
		endLongitude: issue.endLongitude,
		estimatedDelayMinutes: issue.estimatedDelayMinutes
	}));
	const departureHour = new Date().getHours();
	const routePlan = optimizeRoute(
		[
			anchor,
			...pendingStops.map((stop) => ({
				id: stop.id,
				lat: stop.latitude,
				lng: stop.longitude,
				zoneId: stop.zoneId,
				label: `Stop ${stop.sequence}`
			}))
		],
		issues,
		departureHour
	);
	const geometrySnapshot = await buildRouteGeometry(routePlan.orderedPoints);
	const liveStopIds = routePlan.orderedPoints.slice(1).map((point) => Number(point.id));
	const baselineStopIds = pendingStops.map((stop) => stop.id);
	const baselineLegDurationsMinutes = buildBaselineLegs(anchor, pendingStops, issues, departureHour);
	const baselineRemainingMinutes = baselineLegDurationsMinutes.reduce((sum, leg) => sum + leg, 0);
	const remainingDurationMinutes = routePlan.legDurationsMinutes.reduce((sum, leg) => sum + leg, 0);
	const nextStopEtaMinutes = routePlan.legDurationsMinutes[0] ?? 0;
	const expectedCompletionAt =
		remainingDurationMinutes > 0
			? new Date(Date.now() + remainingDurationMinutes * 60_000).toISOString()
			: null;

	return {
		liveRoute: {
			model: 'condition-aware-live-v1',
			generatedAt: Date.now(),
			routeGeometry: geometrySnapshot?.geometry ?? {
				type: 'LineString' as const,
				coordinates: routePlan.geometry.map(([lat, lng]) => [lng, lat] as [number, number])
			},
			legDurationsMinutes: routePlan.legDurationsMinutes,
			remainingDistanceKm: geometrySnapshot?.distanceKm ?? routePlan.plannedDistanceKm,
			remainingDurationMinutes: Number(remainingDurationMinutes.toFixed(2)),
			baselineRemainingMinutes: Number(baselineRemainingMinutes.toFixed(2)),
			etaDeltaMinutes: Number((remainingDurationMinutes - baselineRemainingMinutes).toFixed(2)),
			nextStopEtaMinutes: Number(nextStopEtaMinutes.toFixed(2)),
			expectedCompletionAt,
			rerouted: liveStopIds.join(',') !== baselineStopIds.join(','),
			liveStopIds,
			riskScore: routePlan.metadata.riskScore,
			congestionScore: routePlan.metadata.congestionScore,
			blockedLegs: routePlan.metadata.blockedLegs,
			issueIds: routePlan.metadata.issueIds,
			activeIssueCount: rawIssues.length,
			currentLocation: liveLocation
				? {
						latitude: liveLocation.latitude,
						longitude: liveLocation.longitude
					}
				: null
		},
		liveStopIds
	};
}

export async function getAssignedRun(driverUserId: string, runDate = toYmdDate()) {
	const runs = await db
		.select()
		.from(routeRun)
		.where(eq(routeRun.driverUserId, driverUserId))
		.orderBy(desc(routeRun.runDate), desc(routeRun.createdAt));

	const runsForDate = runs.filter((candidate) => candidate.runDate === runDate);
	const run =
		runsForDate.find((candidate) => candidate.status !== 'completed') ??
		runsForDate[0] ??
		runs.find((candidate) => candidate.status !== 'completed') ??
		runs[0];

	if (!run) return null;

	const stops = await db
		.select({
			id: routeStop.id,
			routeRunId: routeStop.routeRunId,
			zoneId: routeStop.zoneId,
			zoneName: zone.name,
			sourceReportId: routeStop.sourceReportId,
			sequence: routeStop.sequence,
			latitude: routeStop.latitude,
			longitude: routeStop.longitude,
			action: routeStop.action,
			status: routeStop.status,
			notes: routeStop.notes,
			completedAt: routeStop.completedAt,
			createdAt: routeStop.createdAt,
			updatedAt: routeStop.updatedAt
		})
		.from(routeStop)
		.leftJoin(zone, eq(routeStop.zoneId, zone.id))
		.where(eq(routeStop.routeRunId, run.id))
		.orderBy(asc(routeStop.sequence));

	const [summaryRow] = await db
		.select({
			id: driverEventLog.id,
			createdAt: driverEventLog.createdAt,
			payloadJson: driverEventLog.payloadJson
		})
		.from(driverEventLog)
		.where(and(eq(driverEventLog.routeRunId, run.id), eq(driverEventLog.eventType, 'run_summary')))
		.orderBy(desc(driverEventLog.createdAt))
		.limit(1);

	const roadIssues = await db
		.select()
		.from(roadConditionReport)
		.where(
			run.id
				? eq(roadConditionReport.routeRunId, run.id)
				: eq(roadConditionReport.reporterUserId, driverUserId)
		)
		.orderBy(desc(roadConditionReport.createdAt));

	const { liveRoute, liveStopIds } = await buildLiveRouteSnapshot(run, stops);
	const storedRouteGeometry =
		parseJson<{
			type: 'LineString';
			coordinates: Array<[number, number]>;
		}>(run.routeGeometryJson) ?? null;
	const routeGeometry = await resolveRunDisplayGeometry(stops, storedRouteGeometry);

	return {
		run,
		stops,
		roadIssues,
		routeGeometry,
		optimizerMetadata: parseJson<{
			model?: string;
			legDurationsMinutes?: number[];
			riskScore?: number;
			congestionScore?: number;
			blockedLegs?: number;
			issueIds?: Array<number | string>;
			nextStopEtaMinutes?: number;
		}>(run.optimizerMetadataJson) ?? null,
		liveRoute,
		liveStopIds,
		elapsedMinutes: calculateElapsedMinutes(run),
		summary: summaryRow
			? {
					id: summaryRow.id,
					createdAt: summaryRow.createdAt,
					...(parseRunSummary(summaryRow.payloadJson) ?? {})
				}
			: null
	};
}

export async function getAssignedRunLiveNavigation(input: {
	driverUserId: string;
	runId: number;
	latitude: number;
	longitude: number;
}) {
	if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
		throw error(400, 'A valid driver location is required.');
	}

	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, input.runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.driverUserId && run.driverUserId !== input.driverUserId) {
		throw error(403, 'You are not assigned to this run.');
	}

	const stops = await db
		.select()
		.from(routeStop)
		.where(eq(routeStop.routeRunId, run.id))
		.orderBy(asc(routeStop.sequence));

	return buildLiveRouteSnapshot(run, stops, {
		latitude: input.latitude,
		longitude: input.longitude
	});
}

export async function startAssignedRun(
	driverUserId: string,
	runId: number,
	startLocation?: {
		latitude?: number;
		longitude?: number;
	}
) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.driverUserId && run.driverUserId !== driverUserId) {
		throw error(403, 'You are not assigned to this run.');
	}
	if (run.status !== 'planned') return run;

	const timestamp = Date.now();
	const [updated] = await db
		.update(routeRun)
		.set({
			status: 'in_progress',
			startedAt: run.startedAt ?? timestamp,
			originLatitude:
				startLocation?.latitude !== undefined && startLocation?.latitude !== null
					? roundCoordinate(startLocation.latitude)
					: run.originLatitude,
			originLongitude:
				startLocation?.longitude !== undefined && startLocation?.longitude !== null
					? roundCoordinate(startLocation.longitude)
					: run.originLongitude,
			updatedAt: timestamp
		})
		.where(eq(routeRun.id, runId))
		.returning();

	await db.insert(driverEventLog).values({
		routeRunId: runId,
		driverUserId,
		eventType: 'run_started',
		payloadJson: JSON.stringify({
			startedAt: timestamp,
			originLatitude:
				startLocation?.latitude !== undefined && startLocation?.latitude !== null
					? roundCoordinate(startLocation.latitude)
					: run.originLatitude,
			originLongitude:
				startLocation?.longitude !== undefined && startLocation?.longitude !== null
					? roundCoordinate(startLocation.longitude)
					: run.originLongitude
		})
	});

	return updated;
}

export async function submitStopUpdate(input: {
	driverUserId: string;
	runId: number;
	stopId: number;
	status: string;
	notes?: string;
}) {
	const status = input.status as StopStatus;
	if (!stopStatuses.includes(status)) throw error(400, 'Invalid stop status');

	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, input.runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.driverUserId && run.driverUserId !== input.driverUserId) {
		throw error(403, 'You are not assigned to this run.');
	}

	const timestamp = Date.now();
	const [updatedStop] = await db
		.update(routeStop)
		.set({
			status,
			notes: input.notes?.trim() || null,
			completedAt: status === 'done' ? timestamp : null,
			updatedAt: timestamp
		})
		.where(and(eq(routeStop.id, input.stopId), eq(routeStop.routeRunId, input.runId)))
		.returning();

	if (!updatedStop) throw error(404, 'Stop not found');

	if (updatedStop.sourceReportId) {
		const reportStatus =
			status === 'done' ? 'resolved' : status === 'skipped' ? 'open' : 'in_review';
		await db
			.update(citizenReport)
			.set({
				status: reportStatus,
				updatedAt: timestamp
			})
			.where(eq(citizenReport.id, updatedStop.sourceReportId));
	}

	if (run.status === 'planned') {
		await db
			.update(routeRun)
			.set({
				status: 'in_progress',
				startedAt: run.startedAt ?? timestamp,
				updatedAt: timestamp
			})
			.where(eq(routeRun.id, input.runId));
	}

	await db.insert(driverEventLog).values({
		routeRunId: input.runId,
		driverUserId: input.driverUserId,
		eventType: 'stop_update',
		payloadJson: JSON.stringify({
			stopId: input.stopId,
			status,
			notes: input.notes?.trim() || null
		})
	});

	return updatedStop;
}

export async function finishAssignedRun(driverUserId: string, runId: number) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.driverUserId && run.driverUserId !== driverUserId) {
		throw error(403, 'You are not assigned to this run.');
	}
	if (run.status === 'completed') return run;

	const pendingStops = await db
		.select({ id: routeStop.id })
		.from(routeStop)
		.where(and(eq(routeStop.routeRunId, runId), eq(routeStop.status, 'pending')))
		.limit(1);

	if (pendingStops.length > 0) {
		throw error(400, 'Complete or skip every stop before finishing the run.');
	}

	const timestamp = Date.now();
	const [updated] = await db
		.update(routeRun)
		.set({
			status: 'completed',
			completedAt: run.completedAt ?? timestamp,
			updatedAt: timestamp
		})
		.where(eq(routeRun.id, runId))
		.returning();

	await db.insert(driverEventLog).values({
		routeRunId: runId,
		driverUserId,
		eventType: 'run_completed',
		payloadJson: JSON.stringify({
			completedAt: updated.completedAt
		})
	});

	return updated;
}

export async function submitRoadConditionIssue(input: {
	driverUserId: string;
	runId?: number;
	zoneId?: number;
	issueType?: string;
	severity: 'low' | 'medium' | 'high';
	trafficLevel?: string;
	description: string;
	startLabel?: string;
	endLabel?: string;
	startLatitude?: number;
	startLongitude?: number;
	endLatitude?: number;
	endLongitude?: number;
	latitude?: number;
	longitude?: number;
	estimatedDelayMinutes?: number;
}) {
	if (!input.description.trim()) throw error(400, 'Description is required');
	const issueType = roadIssueTypes.includes((input.issueType ?? 'other') as (typeof roadIssueTypes)[number])
		? (input.issueType as (typeof roadIssueTypes)[number])
		: 'other';
	const trafficLevel = trafficLevels.includes(
		(input.trafficLevel ?? 'moderate') as (typeof trafficLevels)[number]
	)
		? (input.trafficLevel as (typeof trafficLevels)[number])
		: 'moderate';
	const midpointLatitude =
		input.startLatitude !== undefined &&
		input.startLatitude !== null &&
		input.endLatitude !== undefined &&
		input.endLatitude !== null
			? (input.startLatitude + input.endLatitude) / 2
			: input.latitude;
	const midpointLongitude =
		input.startLongitude !== undefined &&
		input.startLongitude !== null &&
		input.endLongitude !== undefined &&
		input.endLongitude !== null
			? (input.startLongitude + input.endLongitude) / 2
			: input.longitude;

	const [created] = await db
		.insert(roadConditionReport)
		.values({
			reporterUserId: input.driverUserId,
			routeRunId: input.runId ?? null,
			zoneId: input.zoneId ?? null,
			issueType,
			severity: input.severity,
			trafficLevel,
			description: input.description.trim(),
			startLabel: input.startLabel?.trim() || null,
			endLabel: input.endLabel?.trim() || null,
			startLatitude: roundCoordinate(input.startLatitude),
			startLongitude: roundCoordinate(input.startLongitude),
			endLatitude: roundCoordinate(input.endLatitude),
			endLongitude: roundCoordinate(input.endLongitude),
			latitude: roundCoordinate(midpointLatitude),
			longitude: roundCoordinate(midpointLongitude),
			estimatedDelayMinutes: input.estimatedDelayMinutes ?? 0,
			updatedAt: Date.now()
		})
		.returning();

	await db.insert(driverEventLog).values({
		routeRunId: input.runId ?? null,
		driverUserId: input.driverUserId,
		eventType: 'road_condition_report',
		payloadJson: JSON.stringify({
			roadConditionReportId: created.id,
			issueType,
			severity: input.severity
		})
	});

	return created;
}

export async function submitRunSummary(input: {
	driverUserId: string;
	runId: number;
	collectionVolumeKg?: number;
	issues?: string;
	delays?: string;
	roadConditions?: string;
	missedPickups?: number;
}) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, input.runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.driverUserId && run.driverUserId !== input.driverUserId) {
		throw error(403, 'You are not assigned to this run.');
	}

	const pendingStops = await db
		.select({ id: routeStop.id })
		.from(routeStop)
		.where(and(eq(routeStop.routeRunId, input.runId), eq(routeStop.status, 'pending')))
		.limit(1);

	if (pendingStops.length > 0) {
		throw error(400, 'Complete the assigned route before submitting a run summary.');
	}

	if (run.status !== 'completed') {
		await db
			.update(routeRun)
			.set({
				status: 'completed',
				completedAt: run.completedAt ?? Date.now(),
				updatedAt: Date.now()
			})
			.where(eq(routeRun.id, input.runId));
	}

	const payload = {
		collectionVolumeKg: input.collectionVolumeKg ?? 0,
		issues: input.issues?.trim() || '',
		delays: input.delays?.trim() || '',
		roadConditions: input.roadConditions?.trim() || '',
		missedPickups: input.missedPickups ?? 0
	};

	const [created] = await db
		.insert(driverEventLog)
		.values({
			routeRunId: input.runId,
			driverUserId: input.driverUserId,
			eventType: 'run_summary',
			payloadJson: JSON.stringify(payload)
		})
		.returning();

	return {
		id: created.id,
		createdAt: created.createdAt,
		...payload
	};
}

export async function listDriverRouteHistory(driverUserId: string, limit = 8) {
	const runs = await db
		.select()
		.from(routeRun)
		.where(eq(routeRun.driverUserId, driverUserId))
		.orderBy(desc(routeRun.createdAt))
		.limit(limit);

	if (runs.length === 0) return [];

	const histories = [];
	for (const run of runs) {
		const stops = await db
			.select({
				id: routeStop.id,
				routeRunId: routeStop.routeRunId,
				zoneId: routeStop.zoneId,
				zoneName: zone.name,
				sourceReportId: routeStop.sourceReportId,
				sequence: routeStop.sequence,
				latitude: routeStop.latitude,
				longitude: routeStop.longitude,
				action: routeStop.action,
				status: routeStop.status,
				notes: routeStop.notes,
				completedAt: routeStop.completedAt,
				createdAt: routeStop.createdAt,
				updatedAt: routeStop.updatedAt
			})
			.from(routeStop)
			.leftJoin(zone, eq(routeStop.zoneId, zone.id))
			.where(eq(routeStop.routeRunId, run.id))
			.orderBy(asc(routeStop.sequence));

		const roadIssues = await db
			.select()
			.from(roadConditionReport)
			.where(eq(roadConditionReport.routeRunId, run.id))
			.orderBy(desc(roadConditionReport.createdAt));

		const [summaryRow] = await db
			.select({
				id: driverEventLog.id,
				createdAt: driverEventLog.createdAt,
				payloadJson: driverEventLog.payloadJson
			})
			.from(driverEventLog)
			.where(and(eq(driverEventLog.routeRunId, run.id), eq(driverEventLog.eventType, 'run_summary')))
			.orderBy(desc(driverEventLog.createdAt))
			.limit(1);

		histories.push({
			run,
			stops,
			roadIssues,
			elapsedMinutes: calculateElapsedMinutes(run),
			routeGeometry:
				parseJson<{
					type: 'LineString';
					coordinates: Array<[number, number]>;
				}>(run.routeGeometryJson) ?? null,
			optimizerMetadata: parseJson<{
				model?: string;
				legDurationsMinutes?: number[];
				riskScore?: number;
				congestionScore?: number;
				blockedLegs?: number;
				issueIds?: Array<number | string>;
				nextStopEtaMinutes?: number;
			}>(run.optimizerMetadataJson) ?? null,
			summary: summaryRow
				? {
						id: summaryRow.id,
						createdAt: summaryRow.createdAt,
						...(parseRunSummary(summaryRow.payloadJson) ?? {})
					}
				: null
		});
	}

	return histories;
}
