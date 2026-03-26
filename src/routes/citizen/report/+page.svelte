<script lang="ts">
	import { onMount } from 'svelte';
	import { createReport } from '$lib/api/citizen-reports.remote';
	import { detectZone, searchAddresses } from '$lib/api/geo.remote';
	import LocationPickerMap from '$lib/components/LocationPickerMap.svelte';

	type AddressOption = {
		label: string;
		latitude: number;
		longitude: number;
		source: 'history' | 'collection_point' | 'zone' | 'nominatim';
		zoneId: number | null;
		zoneName: string | null;
		zoneConfidence: 'high' | 'medium' | 'low' | null;
	};

	type AssignedZone = {
		zoneId: number | null;
		zoneName: string | null;
		zoneConfidence: 'high' | 'medium' | 'low' | null;
	};

	const addressHistoryStorageKey = 'wastely-citizen-address-history';

	let latitude = $state<number | null>(null);
	let longitude = $state<number | null>(null);
	let addressQuery = $state('');
	let addressHistory = $state<AddressOption[]>([]);
	let addressResults = $state<AddressOption[]>([]);
	let assignedZone = $state<AssignedZone | null>(null);
	let searchError = $state('');
	let searching = $state(false);
	let resolvingZone = $state(false);
	let lastSubmittedReportId = $state<number | null>(null);
	let hasLocation = $derived(latitude !== null && longitude !== null);

	function readHistory(): AddressOption[] {
		if (typeof localStorage === 'undefined') return [];

		try {
			const raw = localStorage.getItem(addressHistoryStorageKey);
			if (!raw) return [];
			const parsed = JSON.parse(raw) as AddressOption[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function persistHistory(entries: AddressOption[]) {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(addressHistoryStorageKey, JSON.stringify(entries));
	}

	function rememberAddress(entry: AddressOption) {
		const normalizedLabel = entry.label.trim().toLowerCase();
		const nextEntries = [
			entry,
			...addressHistory.filter(
				(candidate) =>
					candidate.label.trim().toLowerCase() !== normalizedLabel ||
					candidate.latitude !== entry.latitude ||
					candidate.longitude !== entry.longitude
			)
		].slice(0, 6);

		addressHistory = nextEntries;
		persistHistory(nextEntries);
	}

	function applyAddressSelection(entry: AddressOption) {
		addressQuery = entry.label;
		latitude = entry.latitude;
		longitude = entry.longitude;
		assignedZone = {
			zoneId: entry.zoneId,
			zoneName: entry.zoneName,
			zoneConfidence: entry.zoneConfidence
		};
		addressResults = [];
		searchError = '';
		rememberAddress(entry);
	}

	async function lookupAddress() {
		searchError = '';
		addressResults = [];

		if (!addressQuery.trim()) {
			searchError = 'Enter an address, suburb, landmark, or street first.';
			return;
		}

		searching = true;
		try {
			const results = (await searchAddresses({ query: addressQuery })) as AddressOption[];
			addressResults = results;

			if (results.length === 0) {
				searchError = 'No address matches found. Try a broader landmark or suburb.';
			} else if (results.length === 1) {
				applyAddressSelection(results[0]);
			}
		} finally {
			searching = false;
		}
	}

	async function resolveZoneFromMap() {
		if (!hasLocation) return;

		resolvingZone = true;
		try {
			const result = await detectZone({
				latitude: latitude as number,
				longitude: longitude as number
			});

			assignedZone = result
				? {
						zoneId: result.zoneId,
						zoneName: result.zoneName,
						zoneConfidence: result.confidence
					}
				: null;
		} finally {
			resolvingZone = false;
		}
	}

	onMount(() => {
		addressHistory = readHistory();
	});

	$effect(() => {
		const reportId = createReport.result?.ok ? createReport.result.report.id : null;
		if (!reportId || reportId === lastSubmittedReportId || !hasLocation || !addressQuery.trim()) return;

		lastSubmittedReportId = reportId;
		rememberAddress({
			label: addressQuery.trim(),
			latitude: latitude as number,
			longitude: longitude as number,
			source: 'history',
			zoneId: assignedZone?.zoneId ?? null,
			zoneName: assignedZone?.zoneName ?? null,
			zoneConfidence: assignedZone?.zoneConfidence ?? null
		});
	});
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">Report Issue</h1>
		<p class="text-sm text-slate-600">
			Search for an address or landmark, auto-place the map nearby, and submit waste-related issues.
		</p>
	</div>

	<form
		{...createReport}
		class="grid gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2"
	>
		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Address or landmark
			<div class="mt-1 flex flex-col gap-2 sm:flex-row">
				<input
					bind:value={addressQuery}
					name="addressQuery"
					placeholder="Harare, Belvedere, 14 Casterns"
					class="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
				<button
					type="button"
					onclick={lookupAddress}
					disabled={searching}
					class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{searching ? 'Searching...' : 'Find address'}
				</button>
			</div>
			{#if searchError}
				<p class="mt-2 text-xs font-medium text-amber-700">{searchError}</p>
			{/if}
		</label>

		{#if addressHistory.length > 0}
			<div class="sm:col-span-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Previously entered addresses</p>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each addressHistory as entry}
						<button
							type="button"
							onclick={() => applyAddressSelection(entry)}
							class="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
						>
							{entry.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if addressResults.length > 1}
			<div class="sm:col-span-2 space-y-2">
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Choose a matched address</p>
				<div class="grid gap-2">
					{#each addressResults as entry}
						<button
							type="button"
							onclick={() => applyAddressSelection(entry)}
							class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50"
						>
							<p class="text-sm font-medium text-slate-900">{entry.label}</p>
							<p class="mt-1 text-xs text-slate-500">
								{entry.zoneName ? `${entry.zoneName} zone` : 'Zone will be inferred from location'} • {entry.source}
							</p>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<label class="text-sm font-medium text-slate-700">
			Category
			<select
				name="category"
				required
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			>
				<option value="uncollected">Uncollected waste</option>
				<option value="illegal_dumping">Illegal dumping</option>
				<option value="overflowing_bin">Overflowing bin</option>
				<option value="other">Other</option>
			</select>
		</label>

		<div class="text-sm font-medium text-slate-700">
			Assigned zone
			<div class="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
				{#if assignedZone?.zoneName}
					<p class="font-semibold text-slate-900">{assignedZone.zoneName}</p>
					<p class="mt-1 text-xs text-slate-500">
						Zone ID: {assignedZone.zoneId} • Confidence: {assignedZone.zoneConfidence ?? 'pending'}
					</p>
				{:else}
					<p class="text-sm text-slate-500">Search for an address or infer the zone from the selected map point.</p>
				{/if}
			</div>
		</div>

		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Description
			<textarea
				name="description"
				required
				rows="4"
				placeholder="What happened and where?"
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			></textarea>
		</label>

		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Location on map
			<div class="mt-1">
				<LocationPickerMap bind:latitude bind:longitude />
			</div>
			<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
				{#if hasLocation}
					<span class="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
						Latitude: {latitude?.toFixed(6)}
					</span>
					<span class="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
						Longitude: {longitude?.toFixed(6)}
					</span>
					<button
						type="button"
						onclick={resolveZoneFromMap}
						disabled={resolvingZone}
						class="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{resolvingZone ? 'Assigning zone...' : 'Infer zone from map point'}
					</button>
				{:else}
					<span class="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
						Search for an address or click the map to select a point
					</span>
				{/if}
			</div>
		</label>

		<input type="hidden" name="latitude" value={latitude ?? ''} />
		<input type="hidden" name="longitude" value={longitude ?? ''} />
		<input type="hidden" name="zoneId" value={assignedZone?.zoneId ?? ''} />

		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Photo evidence
			<input
				type="file"
				name="photo"
				required
				accept="image/*"
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
			/>
		</label>

		<div class="sm:col-span-2">
			<button
				type="submit"
				disabled={!hasLocation}
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Submit report
			</button>
		</div>
	</form>

	{#if createReport.result?.ok}
		<div class="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
			Report #{createReport.result.report.id} submitted successfully in
			{createReport.result.report.zoneName ?? `zone ${createReport.result.report.zoneId ?? 'unassigned'}`}.
		</div>
	{/if}
</div>
