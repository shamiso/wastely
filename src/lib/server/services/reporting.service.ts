import { desc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { citizenReport, reportPhoto } from '$lib/server/db/schema';
import { uploadReportPhoto } from '$lib/server/services/storage.service';

const reportCategories = ['uncollected', 'illegal_dumping', 'overflowing_bin', 'other'] as const;
const reportStatuses = ['open', 'in_review', 'resolved', 'rejected'] as const;

export type ReportCategory = (typeof reportCategories)[number];
export type ReportStatus = (typeof reportStatuses)[number];

export type ReportWithPhoto = {
	id: number;
	reporterUserId: string;
	category: ReportCategory;
	description: string;
	status: ReportStatus;
	latitude: number;
	longitude: number;
	zoneId: number | null;
	createdAt: number;
	updatedAt: number;
	photoUrl: string | null;
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

function toReportWithPhoto(row: {
	report: typeof citizenReport.$inferSelect;
	photo: typeof reportPhoto.$inferSelect | null;
}): ReportWithPhoto {
	return {
		id: row.report.id,
		reporterUserId: row.report.reporterUserId,
		category: row.report.category as ReportCategory,
		description: row.report.description,
		status: row.report.status as ReportStatus,
		latitude: row.report.latitude,
		longitude: row.report.longitude,
		zoneId: row.report.zoneId,
		createdAt: row.report.createdAt,
		updatedAt: row.report.updatedAt,
		photoUrl: row.photo?.publicUrl ?? null
	};
}

export async function createCitizenReport(input: CreateReportInput): Promise<ReportWithPhoto> {
	const description = input.description.trim();
	if (!description) throw error(400, 'Description is required');

	const category = normalizeCategory(input.category);
	const timestamp = Date.now();
	const [created] = await db
		.insert(citizenReport)
		.values({
			reporterUserId: input.reporterUserId,
			category,
			description,
			latitude: input.latitude,
			longitude: input.longitude,
			zoneId: input.zoneId ?? null,
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

	return toReportWithPhoto({ report: created, photo: photoRow });
}

export async function listReportsByUser(userId: string): Promise<ReportWithPhoto[]> {
	const rows = await db
		.select({
			report: citizenReport,
			photo: reportPhoto
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.where(eq(citizenReport.reporterUserId, userId))
		.orderBy(desc(citizenReport.createdAt));

	return rows.map(toReportWithPhoto);
}

export async function listOpenCitizenReports(): Promise<ReportWithPhoto[]> {
	const rows = await db
		.select({
			report: citizenReport,
			photo: reportPhoto
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.where(inArray(citizenReport.status, ['open', 'in_review']))
		.orderBy(desc(citizenReport.createdAt));

	return rows.map(toReportWithPhoto);
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

export async function getReportById(reportId: number): Promise<ReportWithPhoto | null> {
	const [row] = await db
		.select({
			report: citizenReport,
			photo: reportPhoto
		})
		.from(citizenReport)
		.leftJoin(reportPhoto, eq(reportPhoto.reportId, citizenReport.id))
		.where(eq(citizenReport.id, reportId))
		.limit(1);

	return row ? toReportWithPhoto(row) : null;
}
