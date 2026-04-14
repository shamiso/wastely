import { and, asc, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	driverEventLog,
	roadConditionReport,
	routeRun,
	routeStop
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

function calculateElapsedMinutes(run: typeof routeRun.$inferSelect) {
	if (!run.startedAt) return 0;
	const endTime = run.completedAt ?? Date.now();
	return Number(((endTime - run.startedAt) / 60000).toFixed(2));
}

export async function getAssignedRun(driverUserId: string, runDate = toYmdDate()) {
	const runs = await db
		.select()
		.from(routeRun)
		.where(and(eq(routeRun.driverUserId, driverUserId), eq(routeRun.runDate, runDate)))
		.orderBy(desc(routeRun.createdAt));

	const run = runs.find((candidate) => candidate.status !== 'completed') ?? runs[0];

	if (!run) return null;

	const stops = await db
		.select()
		.from(routeStop)
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

	return {
		run,
		stops,
		roadIssues,
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
		}>(run.optimizerMetadataJson) ?? null,
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

export async function startAssignedRun(driverUserId: string, runId: number) {
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
			updatedAt: timestamp
		})
		.where(eq(routeRun.id, runId))
		.returning();

	await db.insert(driverEventLog).values({
		routeRunId: runId,
		driverUserId,
		eventType: 'run_started',
		payloadJson: JSON.stringify({
			startedAt: timestamp
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

	const pendingStops = await db
		.select({ id: routeStop.id })
		.from(routeStop)
		.where(and(eq(routeStop.routeRunId, input.runId), eq(routeStop.status, 'pending')))
		.limit(1);

	if (pendingStops.length === 0) {
		await db
			.update(routeRun)
			.set({
				status: 'completed',
				completedAt: timestamp,
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
			.select()
			.from(routeStop)
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
