import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const MAX_REPORT_PHOTO_SIZE = 10 * 1024 * 1024;

function readRequiredEnv(name: keyof typeof env): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

function asBoolean(value: string | undefined): boolean {
	if (!value) return false;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getClient(): S3Client {
	return new S3Client({
		region: env.S3_REGION ?? 'auto',
		endpoint: readRequiredEnv('S3_ENDPOINT'),
		forcePathStyle: asBoolean(env.S3_FORCE_PATH_STYLE),
		credentials: {
			accessKeyId: readRequiredEnv('S3_ACCESS_KEY_ID'),
			secretAccessKey: readRequiredEnv('S3_SECRET_ACCESS_KEY')
		}
	});
}

function getBucket(): string {
	return readRequiredEnv('S3_BUCKET');
}

function normalizeContentType(contentType: string | undefined): string {
	if (!contentType) return 'application/octet-stream';
	return contentType.trim().toLowerCase();
}

function ensureImageContentType(contentType: string): void {
	if (!contentType.startsWith('image/')) throw error(400, 'Only image uploads are supported.');
}

function buildObjectKey(userId: string, contentType: string): string {
	const extension =
		contentType === 'image/png'
			? 'png'
			: contentType === 'image/gif'
				? 'gif'
				: contentType === 'image/webp'
					? 'webp'
					: contentType === 'image/heic'
						? 'heic'
						: 'jpg';

	return `reports/${userId}/${Date.now()}-${randomUUID()}.${extension}`;
}

export function buildPublicUrl(objectKey: string): string {
	if (env.S3_PUBLIC_BASE_URL) {
		const base = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
		return `${base}/${objectKey}`;
	}

	const endpoint = readRequiredEnv('S3_ENDPOINT').replace(/\/+$/, '');
	return `${endpoint}/${getBucket()}/${objectKey}`;
}

export async function uploadReportPhoto(file: File, userId: string) {
	if (!file || file.size <= 0) throw error(400, 'A photo is required.');
	if (file.size > MAX_REPORT_PHOTO_SIZE) throw error(400, 'Photo exceeds 10MB limit.');

	const contentType = normalizeContentType(file.type);
	ensureImageContentType(contentType);

	const objectKey = buildObjectKey(userId, contentType);
	const body = Buffer.from(await file.arrayBuffer());

	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: objectKey,
			Body: body,
			ContentType: contentType
		})
	);

	return {
		objectKey,
		publicUrl: buildPublicUrl(objectKey)
	};
}

export async function createPresignedUploadUrl(params: {
	userId: string;
	contentType: string;
}): Promise<{ objectKey: string; uploadUrl: string; publicUrl: string; expiresIn: number }> {
	const contentType = normalizeContentType(params.contentType);
	ensureImageContentType(contentType);

	const objectKey = buildObjectKey(params.userId, contentType);
	const expiresIn = 15 * 60;
	const uploadUrl = await getSignedUrl(
		getClient(),
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: objectKey,
			ContentType: contentType
		}),
		{ expiresIn }
	);

	return {
		objectKey,
		uploadUrl,
		publicUrl: buildPublicUrl(objectKey),
		expiresIn
	};
}

export async function confirmUploadedObject(objectKey: string): Promise<{ objectKey: string; publicUrl: string }> {
	if (!objectKey) throw error(400, 'objectKey is required');

	try {
		await getClient().send(
			new HeadObjectCommand({
				Bucket: getBucket(),
				Key: objectKey
			})
		);
	} catch {
		throw error(400, 'Upload could not be confirmed.');
	}

	return {
		objectKey,
		publicUrl: buildPublicUrl(objectKey)
	};
}
