<script lang="ts">
	import { listMyReports } from '$lib/api/citizen-reports.remote';

	const reports = listMyReports();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">My Reports</h1>
			<p class="text-sm text-slate-600">Track status for your submitted waste issues.</p>
		</div>
		<button
			type="button"
			onclick={() => reports.refresh()}
			class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
		>
			Refresh
		</button>
	</div>

	{#if reports.loading && !reports.ready}
		<p class="text-sm text-slate-500">Loading reports...</p>
	{:else if reports.ready && reports.current.length === 0}
		<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No reports yet. Use the citizen report form to submit your first issue.
		</p>
	{:else if reports.ready}
		<div class="grid gap-3">
			{#each reports.current as report}
				<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-900">
							#{report.id} • {report.category.replace('_', ' ')}
						</p>
						<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
							{report.status}
						</span>
					</div>
					<p class="mt-2 text-sm text-slate-700">{report.description}</p>
					<p class="mt-2 text-xs text-slate-500">
						Lat/Lng: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
					</p>
					{#if report.photoUrl}
						<a
							href={report.photoUrl}
							target="_blank"
							rel="noreferrer"
							class="mt-3 inline-flex text-sm font-medium text-blue-700 hover:text-blue-600"
						>
							View photo evidence
						</a>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
