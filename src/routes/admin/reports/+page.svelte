<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import { citizenReportMap } from '$lib/api/dashboard.remote';
	import { deleteReport, listAllReports, resolveReport } from '$lib/api/admin-dispatch.remote';

	const reports = listAllReports();
	const reportMap = citizenReportMap();

	function reportColor(status: string) {
		if (status === 'resolved') return '#34d399';
		if (status === 'in_review') return '#f59e0b';
		if (status === 'rejected') return '#fb7185';
		return '#0ea5e9';
	}

	async function setStatus(reportId: number, status: 'resolved' | 'rejected') {
		await resolveReport({ reportId, status });
		await Promise.all([reports.refresh(), reportMap.refresh()]);
	}

	async function removeReport(reportId: number) {
		if (!confirm(`Delete report #${reportId}?`)) return;
		await deleteReport({ reportId });
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
					onclick={() => {
						reports.refresh();
						reportMap.refresh();
					}}
					class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900"
				>
					Refresh queue
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

	<div class="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">Complaint origin map</h2>
			<p class="mt-1 text-sm text-slate-600">
				Every citizen report plotted as a pin for quick hotspot review.
			</p>

			<div class="mt-4">
				{#if reportMap.ready && reportMap.current.pins.length > 0}
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
				<p class="text-sm text-slate-600">Resolve, reject, or remove reports directly from the list.</p>
			</div>
			<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
				{reports.ready ? `${reports.current.length} reports` : 'Loading'}
			</div>
		</div>

		{#if reports.loading && !reports.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
		{:else if reports.ready && reports.current.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No reports in queue.</p>
		{:else if reports.ready}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each reports.current as report}
					<article class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-slate-900">
								#{report.id} • {report.category.replace('_', ' ')}
							</p>
							<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
								{report.status}
							</span>
						</div>

						<p class="mt-3 text-sm leading-6 text-slate-700">{report.description}</p>
						<p class="mt-3 text-xs text-slate-500">
							{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
							{#if report.zoneName}
								• {report.zoneName}
							{/if}
						</p>
						<p class="mt-1 text-xs text-slate-500">
							Submitted {new Date(report.createdAt).toLocaleString()}
						</p>

						<div class="mt-4 flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => setStatus(report.id, 'resolved')}
								class="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
							>
								Resolve
							</button>
							<button
								type="button"
								onclick={() => setStatus(report.id, 'rejected')}
								class="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400"
							>
								Reject
							</button>
							<button
								type="button"
								onclick={() => removeReport(report.id)}
								class="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
							>
								Delete
							</button>
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
				{/each}
			</div>
		{/if}
	</section>
</div>
