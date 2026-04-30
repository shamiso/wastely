<script lang="ts">
	import {
		deleteReport,
		dispatchReport,
		resolveReport
	} from '$lib/api/admin-dispatch.remote';
	import { formatLocationLabel } from '$lib/utils/location';

	type CitizenReportCard = {
		id: number;
		category: string;
		description: string;
		status: string;
		latitude: number;
		longitude: number;
		zoneId: number | null;
		zoneName: string | null;
		createdAt: number;
		updatedAt: number;
		photoUrl: string | null;
		assignedRunId: number | null;
		assignedRunDate: string | null;
		assignedRunStatus: 'planned' | 'in_progress' | 'completed' | 'blocked' | null;
		assignedDriverUserId: string | null;
		assignedDriverName: string | null;
	};

	type DriverOption = {
		userId: string;
		name: string;
		email: string;
	};

	type ZoneOption = {
		id: number;
		wardId: number;
		name: string;
		code: string;
	};

	type RemoteList<T> = {
		ready: boolean;
		loading: boolean;
		current: T[] | undefined;
	};

	type ChangeDetail = {
		message: string;
		tone?: 'success' | 'warning' | 'danger';
	};

	let {
		report,
		drivers,
		zones,
		onChanged
	}: {
		report: CitizenReportCard;
		drivers: RemoteList<DriverOption>;
		zones: RemoteList<ZoneOption>;
		onChanged?: (detail: ChangeDetail) => Promise<void> | void;
	} = $props();

	let resolveOpen = $state(false);
	let selectedZoneId = $state('');
	let selectedDriverUserId = $state('');
	let selectedRunDate = $state(new Date().toISOString().slice(0, 10));
	let formMessage = $state('');
	let assigning = $state(false);
	let rejecting = $state(false);
	let deleting = $state(false);
	let currentZoneName = $state<string | null>(null);
	let currentZoneId = $state<number | null>(null);
	let currentDriverName = $state<string | null>(null);
	let currentDriverUserId = $state<string | null>(null);
	let currentRunId = $state<number | null>(null);
	let currentRunDate = $state<string | null>(null);
	let currentRunStatus = $state<'planned' | 'in_progress' | 'completed' | 'blocked' | null>(null);
	let currentStatus = $state('');
	const actionableStatuses = new Set(['open', 'in_review', 'rejected']);

	$effect(() => {
		selectedZoneId = report.zoneId ? String(report.zoneId) : '';
		selectedDriverUserId = report.assignedDriverUserId ?? '';
		selectedRunDate = report.assignedRunDate ?? new Date().toISOString().slice(0, 10);
		currentZoneName = report.zoneName;
		currentZoneId = report.zoneId;
		currentDriverName = report.assignedDriverName;
		currentDriverUserId = report.assignedDriverUserId;
		currentRunId = report.assignedRunId;
		currentRunDate = report.assignedRunDate;
		currentRunStatus = report.assignedRunStatus;
		currentStatus = report.status;
		formMessage = '';
	});

	function errorMessage(error: unknown, fallback: string) {
		if (error instanceof Error && error.message) return error.message;
		if (typeof error === 'string' && error.trim()) return error;
		if (typeof error === 'object' && error !== null) {
			const candidate = error as {
				message?: unknown;
				body?: { message?: unknown };
				cause?: { message?: unknown };
				error?: { message?: unknown };
			};

			if (typeof candidate.message === 'string' && candidate.message.trim()) {
				return candidate.message;
			}

			if (typeof candidate.body?.message === 'string' && candidate.body.message.trim()) {
				return candidate.body.message;
			}

			if (typeof candidate.cause?.message === 'string' && candidate.cause.message.trim()) {
				return candidate.cause.message;
			}

			if (typeof candidate.error?.message === 'string' && candidate.error.message.trim()) {
				return candidate.error.message;
			}
		}
		return fallback;
	}

	function openResolve() {
		if (!actionableStatuses.has(currentStatus)) return;
		resolveOpen = !resolveOpen;
		formMessage = '';
		if (!selectedZoneId && report.zoneId) {
			selectedZoneId = String(report.zoneId);
		}
	}

	async function handleResolve() {
		if (assigning) return;

		if (!selectedDriverUserId) {
			formMessage = 'Choose the driver who should take this run.';
			return;
		}

		assigning = true;
		formMessage = '';

		try {
			const result = await dispatchReport({
				reportId: report.id,
				zoneId: selectedZoneId || undefined,
				driverUserId: selectedDriverUserId,
				runDate: selectedRunDate
			});
			currentZoneName = result.zoneName;
			currentZoneId = result.zoneId;
			currentDriverName = result.driverName;
			currentDriverUserId = result.driverUserId;
			currentRunId = result.runId;
			currentRunDate = result.runDate;
			currentRunStatus = 'planned';
			currentStatus = result.status;
			selectedZoneId = String(result.zoneId);
			selectedDriverUserId = result.driverUserId;
			formMessage = `Assigned ${result.zoneName} to ${result.driverName} for ${result.runDate} on run #${result.runId}.`;
			resolveOpen = false;
			await onChanged?.({
				message: `Report #${report.id} moved to in review and was assigned to ${result.driverName} for ${result.runDate} on run #${result.runId}.`,
				tone: 'success'
			});
		} catch (error) {
			formMessage = errorMessage(error, 'Could not assign the report to a driver run.');
		} finally {
			assigning = false;
		}
	}

	async function handleReject() {
		if (rejecting) return;
		rejecting = true;
		formMessage = '';

		try {
			await resolveReport({ reportId: report.id, status: 'rejected' });
			currentStatus = 'rejected';
			await onChanged?.({
				message: `Report #${report.id} was rejected.`,
				tone: 'warning'
			});
		} catch (error) {
			formMessage = errorMessage(error, 'Could not reject this report.');
		} finally {
			rejecting = false;
		}
	}

	async function handleDelete() {
		if (deleting) return;
		if (!confirm(`Delete report #${report.id}?`)) return;

		deleting = true;
		formMessage = '';

		try {
			await deleteReport({ reportId: report.id });
			currentStatus = 'deleted';
			await onChanged?.({
				message: `Report #${report.id} was deleted.`,
				tone: 'danger'
			});
		} catch (error) {
			formMessage = errorMessage(error, 'Could not delete this report.');
		} finally {
			deleting = false;
		}
	}
</script>

<article class="rounded-[1.6rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-[0_12px_28px_rgba(8,47,73,0.06)]">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<p class="text-sm font-semibold text-slate-900">
					#{report.id} • {report.category.replace('_', ' ')}
				</p>
				<span class="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
					{currentStatus}
				</span>
			</div>
			<p class="mt-3 text-sm leading-6 text-slate-700">{report.description}</p>
		</div>

		<div class="flex flex-wrap gap-2">
			{#if actionableStatuses.has(currentStatus)}
				<button
					type="button"
					onclick={openResolve}
					disabled={assigning || rejecting || deleting}
					class="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{resolveOpen ? 'Close assign' : currentDriverUserId ? 'Reassign' : 'Assign'}
				</button>
				<button
					type="button"
					onclick={handleReject}
					disabled={assigning || rejecting || deleting}
					class="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{rejecting ? 'Rejecting…' : 'Reject'}
				</button>
			{/if}
			{#if currentStatus !== 'deleted'}
				<button
					type="button"
					onclick={handleDelete}
					disabled={assigning || rejecting || deleting}
					class="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			{/if}
		</div>
	</div>

	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
			<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Location</p>
			<p class="mt-1 text-sm font-semibold text-slate-900">
				{formatLocationLabel(report, { fallbackLabel: 'Pinned report location' })}
			</p>
		</div>
		<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
			<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Zone</p>
			<p class="mt-1 text-sm font-semibold text-slate-900">{currentZoneName ?? 'Unassigned'}</p>
			{#if currentZoneId}
				<p class="mt-1 text-xs text-slate-500">Zone ID {currentZoneId}</p>
			{/if}
		</div>
		<div class="rounded-[1.1rem] bg-white/80 px-3 py-3 sm:col-span-2">
			<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Driver assignment</p>
			<p class="mt-1 text-sm font-semibold text-slate-900">
				{currentDriverName ?? 'No driver assigned yet'}
			</p>
			<p class="mt-1 text-xs text-slate-500">
				{#if currentDriverUserId}
					Assigned driver id {currentDriverUserId}
					{#if currentRunId}
						• Run #{currentRunId}
					{/if}
					{#if currentRunDate}
						• {currentRunDate}
					{/if}
					{#if currentRunStatus}
						• {currentRunStatus}
					{/if}
				{:else if currentStatus === 'in_review'}
					In review, but no driver is attached to the route yet.
				{:else}
					Assign a driver in the resolve workflow to create or update the run.
				{/if}
			</p>
		</div>
	</div>

	{#if resolveOpen}
		<div class="mt-4 rounded-[1.35rem] border border-emerald-100 bg-white/90 p-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
						Resolve workflow
					</p>
					<p class="mt-1 text-sm text-slate-600">
						The zone is pulled from the citizen's pinned location when available. Adjust it only if you need an override, then assign the driver and collection date.
					</p>
				</div>
				<div class="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
					{currentZoneName ? 'Zone ready' : 'Zone auto-detect'}
				</div>
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-3">
				<label class="text-sm font-medium text-slate-700">
					Zone
					<select
						bind:value={selectedZoneId}
						disabled={assigning || (zones.loading && !zones.ready)}
						class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring disabled:cursor-not-allowed disabled:opacity-60"
					>
						<option value="">{currentZoneName ? 'Use detected zone' : 'Auto-detect from report location'}</option>
						{#if zones.ready}
							{#each zones.current ?? [] as zone}
								<option value={String(zone.id)}>{zone.name}</option>
							{/each}
						{/if}
					</select>
				</label>

				<label class="text-sm font-medium text-slate-700">
					Driver
					<select
						bind:value={selectedDriverUserId}
						disabled={assigning || (drivers.loading && !drivers.ready)}
						class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring disabled:cursor-not-allowed disabled:opacity-60"
					>
						<option value="">Select driver</option>
						{#if drivers.ready}
							{#each drivers.current ?? [] as driver}
								<option value={driver.userId}>
									{driver.name} ({driver.email})
								</option>
							{/each}
						{/if}
					</select>
				</label>

				<label class="text-sm font-medium text-slate-700">
					Collection date
					<input
						bind:value={selectedRunDate}
						type="date"
						disabled={assigning}
						class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring disabled:cursor-not-allowed disabled:opacity-60"
					/>
				</label>
			</div>

			<div class="mt-4 flex flex-wrap items-center gap-3">
				<button
					type="button"
					onclick={handleResolve}
					disabled={assigning || (zones.loading && !zones.ready) || (drivers.loading && !drivers.ready)}
					class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{assigning ? 'Assigning run…' : 'Assign zone, driver and date'}
				</button>
				{#if zones.loading && !zones.ready}
					<p class="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Loading zones…</p>
				{:else if drivers.loading && !drivers.ready}
					<p class="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Loading drivers…</p>
				{/if}
			</div>

			{#if formMessage}
				<p
					class={`mt-3 rounded-[1rem] px-3 py-2 text-sm ${
						currentDriverName && !assigning ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
					}`}
				>
					{formMessage}
				</p>
			{/if}
		</div>
	{/if}

	{#if currentStatus === 'resolved'}
		<p class="mt-4 rounded-[1rem] bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
			This report has already been resolved.
		</p>
	{:else if currentStatus === 'deleted'}
		<p class="mt-4 rounded-[1rem] bg-rose-50 px-3 py-2 text-sm text-rose-700">
			This report has been deleted and is kept here for record-keeping only.
		</p>
	{/if}

	<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
		<p class="text-xs text-slate-500">
			Submitted {new Date(report.createdAt).toLocaleString()} • Updated {new Date(report.updatedAt).toLocaleString()}
		</p>
		{#if report.photoUrl}
			<a
				href={report.photoUrl}
				target="_blank"
				rel="noreferrer"
				class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50"
			>
				View photo
			</a>
		{/if}
	</div>
</article>
