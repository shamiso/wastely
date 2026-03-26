<script lang="ts">
	import {
		deleteReport,
		listAllReports,
		listDriverLogs,
		resolveReport
	} from '$lib/api/admin-dispatch.remote';

	const reports = listAllReports();
	const driverLogs = listDriverLogs({ limit: 20 });

	async function setStatus(reportId: number, status: 'resolved' | 'rejected') {
		await resolveReport({ reportId, status });
		await reports.refresh();
	}

	async function removeReport(reportId: number) {
		if (!confirm(`Delete report #${reportId}?`)) return;
		await deleteReport({ reportId });
		await reports.refresh();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Report Queue</h1>
			<p class="text-sm text-slate-600">Operational view of citizen reports and driver-submitted logs.</p>
		</div>
		<a
			href="/admin/dispatch"
			class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
		>
			Open dispatch tools
		</a>
	</div>

	{#if reports.loading && !reports.ready}
		<p class="text-sm text-slate-500">Loading reports...</p>
	{:else if reports.ready && reports.current.length === 0}
		<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No reports in queue.
		</p>
	{:else if reports.ready}
		<div class="grid gap-3">
			{#each reports.current as report}
				<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-900">
							#{report.id} • {report.category.replace('_', ' ')} • {report.status}
						</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => setStatus(report.id, 'resolved')}
								class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
							>
								Resolve
							</button>
							<button
								type="button"
								onclick={() => setStatus(report.id, 'rejected')}
								class="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
							>
								Reject
							</button>
							<button
								type="button"
								onclick={() => removeReport(report.id)}
								class="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
							>
								Delete
							</button>
						</div>
					</div>
					<p class="mt-2 text-sm text-slate-700">{report.description}</p>
					<p class="mt-1 text-xs text-slate-500">
						Lat/Lng: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
						{#if report.zoneName}
							• Zone: {report.zoneName}
						{/if}
					</p>
					<p class="mt-1 text-xs text-slate-500">
						Submitted {new Date(report.createdAt).toLocaleString()}
					</p>
					{#if report.photoUrl}
						<a
							href={report.photoUrl}
							target="_blank"
							rel="noreferrer"
							class="mt-3 inline-flex rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
						>
							View photo
						</a>
					{/if}
				</article>
			{/each}
		</div>
	{/if}

	<section class="space-y-3">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold tracking-tight">Driver Logs</h2>
			<button
				type="button"
				onclick={() => driverLogs.refresh()}
				class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
			>
				Refresh logs
			</button>
		</div>

		{#if driverLogs.loading && !driverLogs.ready}
			<p class="text-sm text-slate-500">Loading driver logs...</p>
		{:else if driverLogs.ready && driverLogs.current.length === 0}
			<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
				No driver logs yet.
			</p>
		{:else if driverLogs.ready}
			<div class="grid gap-3">
				{#each driverLogs.current as log}
					<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-slate-900">
								{log.type === 'run_summary' ? 'Run summary' : 'Road condition'} • Driver {log.driverUserId}
							</p>
							<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
								{new Date(log.createdAt).toLocaleString()}
							</span>
						</div>
						<p class="mt-2 text-sm text-slate-700">{log.summary}</p>
						<p class="mt-2 text-xs text-slate-500">
							{#if log.runId}
								Run #{log.runId}
							{/if}
							{#if log.zoneName}
								{log.runId ? ' • ' : ''}{log.zoneName}
							{/if}
							{#if log.severity}
								{(log.runId || log.zoneName) ? ' • ' : ''}{log.severity} severity
							{/if}
							{#if log.collectionVolumeKg !== null}
								{(log.runId || log.zoneName || log.severity) ? ' • ' : ''}{log.collectionVolumeKg.toFixed(1)} kg
							{/if}
						</p>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
