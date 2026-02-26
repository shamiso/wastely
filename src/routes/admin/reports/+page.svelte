<script lang="ts">
	import { listOpenReports } from '$lib/api/admin-dispatch.remote';

	const openReports = listOpenReports();
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

	{#if openReports.loading && !openReports.ready}
		<p class="text-sm text-slate-500">Loading reports...</p>
	{:else if openReports.ready && openReports.current.length === 0}
		<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No open reports in queue.
		</p>
	{:else if openReports.ready}
		<div class="grid gap-3">
			{#each openReports.current as report}
				<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
					<p class="text-sm font-semibold text-slate-900">
						#{report.id} • {report.category.replace('_', ' ')} • {report.status}
					</p>
					<p class="mt-2 text-sm text-slate-700">{report.description}</p>
				</article>
			{/each}
		</div>
	{/if}
</div>
