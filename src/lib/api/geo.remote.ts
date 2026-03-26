import { command, getRequestEvent } from '$app/server';
import { requireExactRole } from '$lib/server/services/authz.service';
import {
	resolveZoneFromCoordinates,
	searchAddressSuggestions
} from '$lib/server/services/geo.service';

export const searchAddresses = command('unchecked', async (input: { query?: string }) => {
	const event = getRequestEvent();
	requireExactRole(event, 'citizen');
	return searchAddressSuggestions(input.query ?? '');
});

export const detectZone = command(
	'unchecked',
	async (input: { latitude: number | string; longitude: number | string }) => {
		const event = getRequestEvent();
		requireExactRole(event, 'citizen');
		return resolveZoneFromCoordinates(Number(input.latitude), Number(input.longitude));
	}
);
