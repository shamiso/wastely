import { command, getRequestEvent } from '$app/server';
import { requireUser } from '$lib/server/services/authz.service';
import {
	confirmUploadedObject,
	createPresignedUploadUrl
} from '$lib/server/services/storage.service';

export const createUploadUrl = command(
	'unchecked',
	async (input: { contentType: string; fileName?: string }) => {
		const event = getRequestEvent();
		const user = requireUser(event);

		return createPresignedUploadUrl({
			userId: user.id,
			contentType: input.contentType
		});
	}
);

export const confirmUpload = command('unchecked', async (input: { objectKey: string }) => {
	const event = getRequestEvent();
	requireUser(event);
	return confirmUploadedObject(input.objectKey);
});
