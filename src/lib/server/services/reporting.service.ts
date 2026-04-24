import { desc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { citizenReport, reportPhoto, routeRun, routeStop, user, zone } from '$lib/server/db/schema';
import { resolveZoneFromCoordinates } from '$lib/server/services/geo.service';
import { buildPublicUrl, uploadReportPhoto } from '$lib/server/services/storage.service';

const reportCategories = ['uncollected', 'illegal_dumping', 'overflowing_bin', 'other'] as const;
const reportStatuses = ['open', 'in_review', 'resolved', 'rejected', 'deleted'] as const;

export type ReportCategory = (typeof reportCategories)[number];
export type ReportStatus = (typeof reportStatuses)[number];
export type RouteRunStatus = 'planned' | 'in_progress' | 'completed' | 'blocked';

export type ReportWithPhoto = {
	id: number;
	reporterUserId: string;
	category: ReportCategory;
	description: string;
	status: ReportStatus;
	latitude: number;
	longitude: number;
	zoneId: number | null;
	zoneName: string | null;
	createdAt: number;
	updatedAt: number;
	photoUrl: string | null;
	assignedRunId: number | null;
	assignedRunDate: string | null;
	assignedRunStatus: RouteRunStatus | null;
	assignedDriverUserId: string | null;
	assignedDriverName: string | null;
};

type CreateReportInput = {
	reporterUserId: string;
	category: string;
	description: string;
	latitude: number;
	longitude: number;
	zoneId?: number | null;
	photo?: File | null;
	uploadedPhoto?: {
		objectKey: string;
		publicUrl: string;
	} | null;
};

function normalizeCategory(category: string): ReportCategory {
	if (reportCategories.includes(category as ReportCategory)) return category as ReportCategory;
	throw error(400, 'Invalid category');
}

type ReportAssignment = {
	assignedRunId: number | null;
	assignedRunDate: string | null;
	assignedRunStatus: RouteRunStatus | null;
	assignedDriverUserId: string | null;
	assignedDriverName: string | null;
};

function toReportWithPhoto(row: {
	report: typeof citizenReport.$inferSelect;
	photo: typeof reportPhoto.$inferSelect | null;
	zone: typeof zone.$inferSelect | null;
}, assignment?: ReportAssignment): ReportWithPhoto {
	return {
		id: row.report.id,
		reporterUserId: row.report.reporterUserId,
		category: row.report.category as ReportCategory,
		description: row.report.description,
		status: row.report.status as ReportStatus,
		latitude: row.report.latitude,
		longitude: row.report.longitude,
		zoneId: row.report.zoneId,
		zoneName: row.zone?.name ?? null,
		createdAt: row.report.createdAt,
		updatedAt: row.report.updatedAt,
		photoUrl: row.photo ? buildPublicUrl(row.photo.objectKey) : null,
		assignedRunId: assignment?.assignedRunId ?? null,
		assignedRunDate: assignment?.assignedRunDate ?? null,
		assignedRunStatus: assignment?.assignedRunStatus ?? null,
		assignedDriverUserId: assignment?.assignedDriverUserId ?? null,
		assignedDriverName: assignment?.assignedDriverName ?? null
	};
}

async function listAssignmentsByReportId(reportIds: number[]) {
	if (reportIds.length === 0) return new Map<number, ReportAssignment>();

	const rows = await db
		.select({
			reportId: routeStop.sourceReportId,
			runId: routeRun.id,
			runDate: routeRun.runDate,
			runStatus: routeRun.status,
			driverUserId: routeRun.driverUserId,
			driverName: user.name
		})
		.from(routeStop)
		.innerJoin(routeRun, eq(routeStop.routeRunId, routeRun.id))
		.leftJoin(user, eq(routeRun.driverUserId, user.id))
		.where(inArray(routeStop.sourceReportId, reportIds))
		.orderBy(desc(routeRun.createdAt), desc(routeStop.createdAt));

	const assignments = new Map<number, ReportAssignment>();
	for (const row of rows) {
		if (row.reportId === null || assignments.has(row.reportId)) continue;
		assignments.set(row.reportId, {
			assignedRunId: row.runId,
			assignedRunDate: row.runDate,
			assignedRunStatus: row.runStatus as RouteRunStatus,
			assignedDriverUserId: row.driverUserId,
			assignedDriverName: row.driverName
		});
	}

	return assignments;
}

export async function createCitizenReport(input: CreateReportInput): Promise<ReportWithPhoto> {
	const description = input.description.trim();
	if (!description) throw error(400, 'Description is required');

	const category = normalizeCategory(input.category);
	const timestamp = Date.now();
	const resolvedZone =
		input.zoneId === undefined || input.zoneId === null
			? await resolveZoneFromCoordinates(input.latitude, input.longitude)
			: null;
	const [created] = await db
		.insert(citizenReport)
		.values({
			reporterUserId: input.reporterUserId,
			category,
			description,
			latitude: input.latitude,
			longitude: input.longitude,
			zoneId: input.zoneId ?? resolvedZone?.zoneId ?? null,
			updatedAt: timestamp
		})
		.returning();

	let photo =
		input.uploadedPhoto && input.uploadedPhoto.objectKey
			? input.uploadedPhoto
			: input.photo
				? await uploadReportPhoto(input.photo, input.reporterUserId)
				: null;

	if (!photo) throw error(400, 'A photo is required');

	const [photoRow] = await db
		.insert(reportPhoto)
		.values({
			reportId: created.id,
			objectKey: photo.objectKey,
			publicUrl: photo.publicUrl
		})
		.returning();

	const zoneRow =
		created.zoneId === null
			? null
			: (
					await db.select().from(zone).where(eq(zone.id, created.zoneId)).limit(1)
				)[0] ?? null;

	return toReportWithPhoto({ report: created, photo: photoRow, zone: zoneRow });
}

export async function listReportsByUser(userId: string): Promise<ReportWithPhoto[]> {
	const rows = await db
		.select({
			report: citizenReport,
			photo: reportPhoto,
			zone: zone
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.where(eq(citizenReport.reporterUserId, userId))
		.orderBy(desc(citizenReport.createdAt));

	const assignments = await listAssignmentsByReportId(rows.map((row) => row.report.id));
	return rows.map((row) => toReportWithPhoto(row, assignments.get(row.report.id)));
}

export async function listOpenCitizenReports(): Promise<ReportWithPhoto[]> {
	const rows = await db
		.select({
			report: citizenReport,
			photo: reportPhoto,
			zone: zone
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.where(inArray(citizenReport.status, ['open', 'in_review']))
		.orderBy(desc(citizenReport.createdAt));

	const assignments = await listAssignmentsByReportId(rows.map((row) => row.report.id));
	return rows.map((row) => toReportWithPhoto(row, assignments.get(row.report.id)));
}

export async function listAllCitizenReports(): Promise<ReportWithPhoto[]> {
	const rows = await db
		.select({
			report: citizenReport,
			photo: reportPhoto,
			zone: zone
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.orderBy(desc(citizenReport.createdAt));

	const assignments = await listAssignmentsByReportId(rows.map((row) => row.report.id));
	return rows.map((row) => toReportWithPhoto(row, assignments.get(row.report.id)));
}

export async function resolveCitizenReport(reportId: number, status: ReportStatus = 'resolved') {
	if (!reportStatuses.includes(status)) throw error(400, 'Invalid status');

	const [updated] = await db
		.update(citizenReport)
		.set({
			status,
			updatedAt: Date.now()
		})
		.where(eq(citizenReport.id, reportId))
		.returning();

	if (!updated) throw error(404, 'Report not found');
	return updated;
}

export async function updateCitizenReport(input: {
	reportId: number;
	category?: string;
	description?: string;
	zoneId?: number | null;
	latitude?: number;
	longitude?: number;
}) {
	const [existing] = await db
		.select()
		.from(citizenReport)
		.where(eq(citizenReport.id, input.reportId))
		.limit(1);

	if (!existing) throw error(404, 'Report not found');

	const patch: Partial<typeof citizenReport.$inferInsert> = {
		updatedAt: Date.now()
	};

	if (input.category !== undefined) patch.category = normalizeCategory(input.category);
	if (input.description !== undefined) {
		const description = input.description.trim();
		if (!description) throw error(400, 'Description is required');
		patch.description = description;
	}
	if (input.zoneId !== undefined) patch.zoneId = input.zoneId;
	if (input.latitude !== undefined) patch.latitude = input.latitude;
	if (input.longitude !== undefined) patch.longitude = input.longitude;

	const [updated] = await db
		.update(citizenReport)
		.set(patch)
		.where(eq(citizenReport.id, input.reportId))
		.returning();

	return updated;
}

export async function deleteCitizenReport(reportId: number) {
	const [deleted] = await db
		.update(citizenReport)
		.set({
			status: 'deleted',
			updatedAt: Date.now()
		})
		.where(eq(citizenReport.id, reportId))
		.returning();

	if (!deleted) throw error(404, 'Report not found');
	return deleted;
}

export async function getReportById(reportId: number): Promise<ReportWithPhoto | null> {
	const [row] = await db
		.select({
			report: citizenReport,
			photo: reportPhoto,
			zone: zone
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.where(eq(citizenReport.id, reportId))
		.limit(1);

	if (!row) return null;
	const assignments = await listAssignmentsByReportId([row.report.id]);
	return toReportWithPhoto(row, assignments.get(row.report.id));
}
