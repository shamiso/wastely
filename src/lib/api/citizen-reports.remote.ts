import { command, form, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/services/authz.service';
import {
	createCitizenReport,
	deleteCitizenReport,
	getReportById,
	listReportsByUser,
	updateCitizenReport
} from '$lib/server/services/reporting.service';

function toNumber(value: unknown, field: string): number {
	if (value === undefined || value === null || value === '') {
		throw error(400, `${field} is required`);
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw error(400, `${field} must be a number`);
	return parsed;
}

function readSingleFile(value: unknown): File | null {
	if (value instanceof File) return value;
	if (Array.isArray(value) && value[0] instanceof File) return value[0];
	return null;
}

export const createReport = form(
	'unchecked',
	async (data: {
		category?: string;
		description?: string;
		latitude?: string | number;
		longitude?: string | number;
		zoneId?: string | number;
		photo?: File | File[];
		photoObjectKey?: string;
		photoPublicUrl?: string;
	}) => {
		const event = getRequestEvent();
		const user = requireUser(event);

		const report = await createCitizenReport({
			reporterUserId: user.id,
			category: data.category ?? 'uncollected',
			description: data.description ?? '',
			latitude: toNumber(data.latitude, 'latitude'),
			longitude: toNumber(data.longitude, 'longitude'),
			zoneId:
				data.zoneId === undefined || data.zoneId === null || data.zoneId === ''
					? null
					: toNumber(data.zoneId, 'zoneId'),
			photo: readSingleFile(data.photo),
			uploadedPhoto:
				typeof data.photoObjectKey === 'string' &&
				data.photoObjectKey &&
				typeof data.photoPublicUrl === 'string' &&
				data.photoPublicUrl
					? {
							objectKey: data.photoObjectKey,
							publicUrl: data.photoPublicUrl
						}
					: null
		});

		return {
			ok: true,
			report
		};
	}
);

export const listMyReports = query(async () => {
	const event = getRequestEvent();
	const user = requireUser(event);
	return listReportsByUser(user.id);
});

export const reportDetail = query('unchecked', async (input: { reportId: number }) => {
	const event = getRequestEvent();
	const user = requireUser(event);

	const report = await getReportById(Number(input.reportId));
	if (!report) throw error(404, 'Report not found');
	if (report.reporterUserId !== user.id && event.locals.role !== 'admin') {
		throw error(403, 'Not allowed to view this report');
	}

	return report;
});

export const updateMyReport = command(
	'unchecked',
	async (input: { reportId: number | string; category?: string; description?: string }) => {
		const event = getRequestEvent();
		const user = requireUser(event);
		const reportId = Number(input.reportId);
		const report = await getReportById(reportId);

		if (!report) throw error(404, 'Report not found');
		if (report.reporterUserId !== user.id && event.locals.role !== 'admin') {
			throw error(403, 'Not allowed to update this report');
		}
		if (!['open', 'rejected'].includes(report.status) && event.locals.role !== 'admin') {
			throw error(400, 'Only open/rejected reports can be edited');
		}

		return updateCitizenReport({
			reportId,
			category: input.category,
			description: input.description
		});
	}
);

export const deleteMyReport = command('unchecked', async (input: { reportId: number | string }) => {
	const event = getRequestEvent();
	const user = requireUser(event);
	const reportId = Number(input.reportId);
	const report = await getReportById(reportId);

	if (!report) throw error(404, 'Report not found');
	if (report.reporterUserId !== user.id && event.locals.role !== 'admin') {
		throw error(403, 'Not allowed to delete this report');
	}
	if (!['open', 'rejected'].includes(report.status) && event.locals.role !== 'admin') {
		throw error(400, 'Only open/rejected reports can be deleted');
	}

	return deleteCitizenReport(reportId);
});
