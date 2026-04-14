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
	<section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 p-6 text-white shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Citizen reporting</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight">Pin the issue and send it fast</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-white/82">
			Search for the location, verify it on the map, attach a photo, and let the municipality know exactly where the waste issue is coming from.
		</p>
	</section>

	<form {...createReport} class="space-y-6">
		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Find the location
					</h2>
					<p class="text-sm text-slate-600">
						Use an address, suburb, or landmark to jump the map close to the incident.
					</p>
				</div>
				{#if assignedZone?.zoneName}
					<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
						Zone {assignedZone.zoneName}
					</div>
				{/if}
			</div>

			<label class="mt-5 block text-sm font-medium text-slate-700">
				Address or landmark
				<div class="mt-2 flex flex-col gap-2 sm:flex-row">
					<input
						bind:value={addressQuery}
						name="addressQuery"
						placeholder="Belvedere, Kuwadzana, Mbare, 14 Casterns"
						class="w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
					<button
						type="button"
						onclick={lookupAddress}
						disabled={searching}
						class="rounded-[1.2rem] bg-sky-950 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{searching ? 'Searching…' : 'Find address'}
					</button>
				</div>
				{#if searchError}
					<p class="mt-2 text-xs font-semibold text-amber-700">{searchError}</p>
				{/if}
			</label>

			{#if addressHistory.length > 0}
				<div class="mt-5">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent places</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each addressHistory as entry}
							<button
								type="button"
								onclick={() => applyAddressSelection(entry)}
								class="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
							>
								{entry.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if addressResults.length > 1}
				<div class="mt-5 space-y-3">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Matched locations</p>
					<div class="grid gap-3">
						{#each addressResults as entry}
							<button
								type="button"
								onclick={() => applyAddressSelection(entry)}
								class="rounded-[1.35rem] border border-sky-100 bg-gradient-to-r from-white to-sky-50 px-4 py-4 text-left hover:border-sky-200"
							>
								<p class="text-sm font-semibold text-slate-900">{entry.label}</p>
								<p class="mt-1 text-xs text-slate-500">
									{entry.zoneName ? `${entry.zoneName} zone` : 'Zone will be inferred'} • {entry.source}
								</p>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
				<div class="space-y-4">
					<div>
						<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							Issue details
						</h2>
						<p class="text-sm text-slate-600">
							Add the type of waste issue and a short explanation for officers.
						</p>
					</div>

					<label class="block text-sm font-medium text-slate-700">
						Category
						<select
							name="category"
							required
							class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
						>
							<option value="uncollected">Uncollected waste</option>
							<option value="illegal_dumping">Illegal dumping</option>
							<option value="overflowing_bin">Overflowing bin</option>
							<option value="other">Other</option>
						</select>
					</label>

					<label class="block text-sm font-medium text-slate-700">
						Description
						<textarea
							name="description"
							required
							rows="4"
							placeholder="What happened and where exactly is it?"
							class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
						></textarea>
					</label>

					<label class="block text-sm font-medium text-slate-700">
						Photo evidence
						<input
							type="file"
							name="photo"
							required
							accept="image/*"
							class="mt-2 block w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 text-sm"
						/>
					</label>
				</div>

				<div class="space-y-4">
					<div class="rounded-[1.5rem] bg-gradient-to-br from-emerald-50 to-cyan-50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Assigned zone</p>
						{#if assignedZone?.zoneName}
							<p class="mt-2 text-2xl font-semibold text-slate-900">{assignedZone.zoneName}</p>
							<p class="mt-2 text-sm text-slate-600">
								Zone ID {assignedZone.zoneId} • Confidence {assignedZone.zoneConfidence ?? 'pending'}
							</p>
						{:else}
							<p class="mt-2 text-sm leading-6 text-slate-600">
								Search for a place or infer the zone from the selected map point.
							</p>
						{/if}
					</div>

					<div class="rounded-[1.5rem] bg-gradient-to-br from-amber-50 to-orange-50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Map readiness</p>
						{#if hasLocation}
							<p class="mt-2 text-sm font-semibold text-slate-900">
								Latitude {latitude?.toFixed(6)}
							</p>
							<p class="mt-1 text-sm font-semibold text-slate-900">
								Longitude {longitude?.toFixed(6)}
							</p>
							<button
								type="button"
								onclick={resolveZoneFromMap}
								disabled={resolvingZone}
								class="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{resolvingZone ? 'Assigning zone…' : 'Infer zone from map point'}
							</button>
						{:else}
							<p class="mt-2 text-sm leading-6 text-slate-600">
								Search for an address or tap the map to place the report location.
							</p>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Place the pin on the map
					</h2>
					<p class="text-sm text-slate-600">
						Tap the exact spot of the issue so officers can see where reports are coming from.
					</p>
				</div>
				{#if hasLocation}
					<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
						Location locked
					</div>
				{/if}
			</div>

			<div class="mt-4">
				<LocationPickerMap bind:latitude bind:longitude />
			</div>

			<input type="hidden" name="latitude" value={latitude ?? ''} />
			<input type="hidden" name="longitude" value={longitude ?? ''} />
			<input type="hidden" name="zoneId" value={assignedZone?.zoneId ?? ''} />

			<div class="mt-5 flex flex-wrap items-center gap-3">
				<button
					type="submit"
					disabled={!hasLocation}
					class="rounded-full bg-sky-950 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
				>
					Submit report
				</button>
				{#if !hasLocation}
					<p class="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
						Select a map point before submitting
					</p>
				{/if}
			</div>
		</section>
	</form>

	{#if createReport.result?.ok}
		<section class="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
			Report #{createReport.result.report.id} submitted successfully in
			{createReport.result.report.zoneName ?? `zone ${createReport.result.report.zoneId ?? 'unassigned'}`}.
		</section>
	{/if}
</div>
