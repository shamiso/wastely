<script lang="ts">
	import { kpiSnapshot, zoneDemand } from '$lib/api/dashboard.remote';

	const kpis = kpiSnapshot({});
	const demand = zoneDemand({});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Municipal Dashboard</h1>
			<p class="text-sm text-slate-600">Live KPI snapshot and zone-level demand forecast.</p>
		</div>
		<button
			type="button"
			onclick={async () => {
				await Promise.all([kpis.refresh(), demand.refresh()]);
			}}
			class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
		>
			Refresh all
		</button>
	</div>

	{#if kpis.ready}
		<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Planned Runs</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.plannedRuns}</p>
			</article>
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Completed Runs</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.completedRuns}</p>
			</article>
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Open Reports</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.openReports}</p>
			</article>
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Resolved Reports</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.resolvedReports}</p>
			</article>
		</section>

		<section class="grid gap-3 sm:grid-cols-2">
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Avg Response Time</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.averageResponseHours.toFixed(2)} hrs</p>
			</article>
			<article class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<p class="text-xs uppercase tracking-wide text-slate-500">Planned Distance</p>
				<p class="mt-1 text-2xl font-semibold">{kpis.current.totalDistanceKm.toFixed(2)} km</p>
			</article>
		</section>
	{/if}

	<section class="space-y-3">
		<h2 class="text-lg font-semibold tracking-tight">Zone Demand Forecast</h2>
		{#if demand.loading && !demand.ready}
			<p class="text-sm text-slate-500">Loading zone demand...</p>
		{:else if demand.ready && demand.current.length === 0}
			<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
				No zone forecasts yet. Add zones and reports to generate demand data.
			</p>
		{:else if demand.ready}
			<div class="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
				<table class="min-w-full text-sm">
					<thead class="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
						<tr>
							<th class="px-3 py-2">Zone</th>
							<th class="px-3 py-2">Forecast Date</th>
							<th class="px-3 py-2">Predicted Kg</th>
							<th class="px-3 py-2">Confidence</th>
						</tr>
					</thead>
					<tbody>
						{#each demand.current as row}
							<tr class="border-t border-slate-200">
								<td class="px-3 py-2 font-medium text-slate-800">{row.zoneName}</td>
								<td class="px-3 py-2">{row.forecastDate}</td>
								<td class="px-3 py-2">{row.predictedVolumeKg.toFixed(1)}</td>
								<td class="px-3 py-2">{(row.confidence * 100).toFixed(0)}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
