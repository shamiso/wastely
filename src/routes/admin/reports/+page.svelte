<script lang="ts">
	import {
		deleteReport,
		listAllReports,
		resolveReport
	} from '$lib/api/admin-dispatch.remote';

	const reports = listAllReports();

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
			<p class="text-sm text-slate-600">Operational view of unresolved citizen issues.</p>
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
</div>
