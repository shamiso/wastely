<script lang="ts">
	import AdminReportQueueCard from '$lib/components/AdminReportQueueCard.svelte';
	import InsightMap from '$lib/components/InsightMap.svelte';
	import { citizenReportMap } from '$lib/api/dashboard.remote';
	import {
		listAllReports,
		listDrivers,
		listZones
	} from '$lib/api/admin-dispatch.remote';

	type QueueFilter =
		| 'all'
		| 'open'
		| 'in_review'
		| 'assigned'
		| 'rejected'
		| 'resolved'
		| 'deleted';

	const reports = listAllReports();
	const reportMap = citizenReportMap();
	const drivers = listDrivers();
	const zones = listZones();
	const queueFilters = [
		{ id: 'all', label: 'All' },
		{ id: 'open', label: 'Open' },
		{ id: 'in_review', label: 'In review' },
		{ id: 'assigned', label: 'Assigned' },
		{ id: 'rejected', label: 'Rejected' },
		{ id: 'resolved', label: 'Resolved' },
		{ id: 'deleted', label: 'Deleted' }
	] as const satisfies ReadonlyArray<{ id: QueueFilter; label: string }>;

	let refreshing = $state(false);
	let flashMessage = $state('');
	let flashTone = $state<'success' | 'warning' | 'danger'>('success');
	let selectedQueueFilter = $state<QueueFilter>('all');

	function sortReports<T extends { updatedAt: number; createdAt: number }>(items: T[] | undefined) {
		return [...(items ?? [])].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
	}

	function isAssignedReport(report: {
		assignedDriverUserId: string | null;
		assignedRunId: number | null;
	}) {
		return Boolean(report.assignedDriverUserId && report.assignedRunId);
	}

	const sortedReports = $derived.by(() => sortReports(reports.current));

	const filteredReports = $derived.by(() => {
		if (selectedQueueFilter === 'all') return sortedReports;
		if (selectedQueueFilter === 'assigned') {
			return sortedReports.filter((report) => isAssignedReport(report));
		}
		return sortedReports.filter((report) => report.status === selectedQueueFilter);
	});

	const filterCounts = $derived.by(() => {
		const counts: Record<QueueFilter, number> = {
			all: 0,
			open: 0,
			in_review: 0,
			assigned: 0,
			rejected: 0,
			resolved: 0,
			deleted: 0
		};

		for (const report of sortedReports) {
			counts.all += 1;
			if (report.status === 'open') counts.open += 1;
			if (report.status === 'in_review') counts.in_review += 1;
			if (isAssignedReport(report)) counts.assigned += 1;
			if (report.status === 'rejected') counts.rejected += 1;
			if (report.status === 'resolved') counts.resolved += 1;
			if (report.status === 'deleted') counts.deleted += 1;
		}

		return counts;
	});

	function reportColor(status: string) {
		if (status === 'resolved') return '#34d399';
		if (status === 'in_review') return '#f59e0b';
		if (status === 'rejected') return '#fb7185';
		return '#0ea5e9';
	}

	async function refreshPage() {
		refreshing = true;
		try {
			await Promise.all([
				reports.refresh(),
				reportMap.refresh(),
				drivers.refresh(),
				zones.refresh()
			]);
		} finally {
			refreshing = false;
		}
	}

	async function handleReportChanged(detail: {
		message: string;
		tone?: 'success' | 'warning' | 'danger';
	}) {
		flashMessage = detail.message;
		flashTone = detail.tone ?? 'success';
		await Promise.all([reports.refresh(), reportMap.refresh()]);
	}
</script>

<div class="space-y-6">
	<section class="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">Citizen Reports</p>
				<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight text-sky-950">
					Map-first triage queue
				</h1>
				<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
					Review where complaints are concentrated, then resolve, reject, or remove cases directly from the operations queue.
				</p>
			</div>

			<div class="flex gap-2">
				<button
					type="button"
					onclick={refreshPage}
					disabled={refreshing}
					class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{refreshing ? 'Refreshing…' : 'Refresh queue'}
				</button>
				<a
					href="/admin/driver-reports"
					class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
				>
					Open driver reports
				</a>
			</div>
		</div>
	</section>

	{#if flashMessage}
		<p
			class={`rounded-[1.35rem] px-4 py-3 text-sm font-medium shadow-[0_20px_60px_rgba(8,47,73,0.08)] ${
				flashTone === 'danger'
					? 'bg-rose-50 text-rose-700'
					: flashTone === 'warning'
						? 'bg-amber-50 text-amber-700'
						: 'bg-emerald-50 text-emerald-700'
			}`}
		>
			{flashMessage}
		</p>
	{/if}

	<div class="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">Complaint origin map</h2>
			<p class="mt-1 text-sm text-slate-600">
				Every citizen report plotted as a pin for quick hotspot review.
			</p>

			<div class="mt-4">
				{#if reportMap.loading && !reportMap.ready}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading report map…</p>
				{:else if reportMap.ready && reportMap.current.pins.length > 0}
					<InsightMap
						ariaLabel="Citizen report queue map"
						markers={reportMap.current.pins.map((pin) => ({
							lat: pin.latitude,
							lng: pin.longitude,
							label: `#${pin.id} • ${pin.zoneName ?? 'Unassigned'} • ${pin.status}`,
							color: '#0f172a',
							fillColor: reportColor(pin.status)
						}))}
					/>
				{:else}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
						No report map data available.
					</p>
				{/if}
			</div>
		</section>

		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
				Zone volumes
			</h2>
			<p class="mt-1 text-sm text-slate-600">
				Where the highest complaint volume is building up.
			</p>

			{#if reportMap.ready && reportMap.current.volumesByZone.length > 0}
				<div class="mt-5 space-y-4">
					{#each reportMap.current.volumesByZone.slice(0, 10) as volume}
						<div class="rounded-[1.35rem] border border-sky-100 bg-gradient-to-r from-sky-50 to-white p-4">
							<div class="flex items-center justify-between gap-2">
								<p class="font-semibold text-slate-900">{volume.zoneName}</p>
								<p class="text-sm text-slate-500">{volume.reportCount} reports</p>
							</div>
							<p class="mt-2 text-xs uppercase tracking-[0.16em] text-sky-700">
								{volume.openCount} active • {volume.resolvedCount} resolved
							</p>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-4 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					Zone breakdowns will appear after reports are submitted.
				</p>
			{/if}
		</section>
	</div>

	<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
					Queue detail
				</h2>
				<p class="text-sm text-slate-600">
					Resolve now opens a dispatch workflow with zone and driver assignment.
				</p>
			</div>
			<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
				{reports.ready ? `${filteredReports.length} shown` : 'Loading'}
			</div>
		</div>

		<div class="flex flex-wrap gap-2">
			{#each queueFilters as filter}
				<button
					type="button"
					onclick={() => {
						selectedQueueFilter = filter.id;
					}}
					class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
						selectedQueueFilter === filter.id
							? 'bg-sky-950 text-white shadow-lg'
							: 'border border-sky-200 bg-white text-sky-900 hover:bg-sky-50'
					}`}
				>
					{filter.label} ({filterCounts[filter.id]})
				</button>
			{/each}
		</div>

		{#if reports.loading && !reports.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
		{:else if reports.ready && sortedReports.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No reports in queue.</p>
		{:else if reports.ready && filteredReports.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
				No {queueFilters.find((filter) => filter.id === selectedQueueFilter)?.label.toLowerCase()} reports.
			</p>
		{:else if reports.ready}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each filteredReports as report (report.id)}
					<AdminReportQueueCard
						{report}
						{drivers}
						{zones}
						onChanged={handleReportChanged}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>
