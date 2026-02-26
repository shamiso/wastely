import { and, asc, desc, eq, ne } from 'drizzle-orm';
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

export async function getAssignedRun(driverUserId: string, runDate = toYmdDate()) {
	const [run] = await db
		.select()
		.from(routeRun)
		.where(
			and(
				eq(routeRun.driverUserId, driverUserId),
				eq(routeRun.runDate, runDate),
				ne(routeRun.status, 'completed')
			)
		)
		.orderBy(desc(routeRun.createdAt))
		.limit(1);

	if (!run) return null;

	const stops = await db
		.select()
		.from(routeStop)
		.where(eq(routeStop.routeRunId, run.id))
		.orderBy(asc(routeStop.sequence));

	return { run, stops };
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
	severity: 'low' | 'medium' | 'high';
	description: string;
	latitude?: number;
	longitude?: number;
}) {
	if (!input.description.trim()) throw error(400, 'Description is required');

	const [created] = await db
		.insert(roadConditionReport)
		.values({
			reporterUserId: input.driverUserId,
			zoneId: input.zoneId ?? null,
			severity: input.severity,
			description: input.description.trim(),
			latitude: input.latitude ?? null,
			longitude: input.longitude ?? null
		})
		.returning();

	await db.insert(driverEventLog).values({
		routeRunId: input.runId ?? null,
		driverUserId: input.driverUserId,
		eventType: 'road_condition_report',
		payloadJson: JSON.stringify({
			roadConditionReportId: created.id,
			severity: input.severity
		})
	});

	return created;
}
