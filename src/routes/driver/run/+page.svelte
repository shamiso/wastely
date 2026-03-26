<script lang="ts">
	import {
		getCurrentRun,
		startRun,
		submitRoadIssue,
		submitRunSummaryEntry,
		submitStop
	} from '$lib/api/driver-ops.remote';

	const currentRun = getCurrentRun();
	let roadDescription = $state('');
	let roadSeverity = $state<'low' | 'medium' | 'high'>('medium');
	let collectionVolumeKg = $state('');
	let runIssues = $state('');
	let delayNotes = $state('');
	let roadConditionNotes = $state('');
	let missedPickups = $state('0');
	let submittingSummary = $state(false);

	async function startCurrentRun(runId: number) {
		await startRun({ runId });
		await currentRun.refresh();
	}

	async function markStop(runId: number, stopId: number, status: 'done' | 'skipped') {
		await submitStop({
			runId,
			stopId,
			status
		});
		await currentRun.refresh();
	}

	async function markCurrentStop(stopId: number, status: 'done' | 'skipped') {
		if (!currentRun.current) return;
		await markStop(currentRun.current.run.id, stopId, status);
	}

	async function reportRoadIssue() {
		const runId = currentRun.ready && currentRun.current?.run ? currentRun.current.run.id : undefined;
		await submitRoadIssue({
			runId,
			severity: roadSeverity,
			description: roadDescription
		});
		roadDescription = '';
	}

	async function saveRunSummary() {
		if (!currentRun.current) return;

		submittingSummary = true;
		try {
			await submitRunSummaryEntry({
				runId: currentRun.current.run.id,
				collectionVolumeKg,
				issues: runIssues,
				delays: delayNotes,
				roadConditions: roadConditionNotes,
				missedPickups
			});

			await currentRun.refresh();
		} finally {
			submittingSummary = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Driver Run</h1>
			<p class="text-sm text-slate-600">
				Start the assigned run, follow the optimized stop order, and log operational outcomes.
			</p>
		</div>
		<button
			type="button"
			onclick={() => currentRun.refresh()}
			class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
		>
			Refresh
		</button>
	</div>

	{#if currentRun.loading && !currentRun.ready}
		<p class="text-sm text-slate-500">Loading run assignment...</p>
	{:else if currentRun.ready && !currentRun.current}
		<div class="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No active run assigned today.
		</div>
	{:else if currentRun.ready && currentRun.current}
		<div class="space-y-4">
			<section class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold text-slate-800">
							Run #{currentRun.current.run.id} • {currentRun.current.run.status}
						</h2>
						<p class="mt-1 text-sm text-slate-600">
							Date: {currentRun.current.run.runDate} • Planned distance: {currentRun.current.run.plannedDistanceKm.toFixed(2)} km
						</p>
					</div>

					{#if currentRun.current.run.status === 'planned'}
						<button
							type="button"
							onclick={() => startCurrentRun(currentRun.current!.run.id)}
							class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
						>
							Start run
						</button>
					{:else}
						<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
							Run started
						</span>
					{/if}
				</div>

				<div class="mt-4 grid gap-3 sm:grid-cols-3">
					<article class="rounded-lg bg-slate-50 px-3 py-3">
						<p class="text-xs uppercase tracking-wide text-slate-500">Stops</p>
						<p class="mt-1 text-xl font-semibold text-slate-900">{currentRun.current.stops.length}</p>
					</article>
					<article class="rounded-lg bg-slate-50 px-3 py-3">
						<p class="text-xs uppercase tracking-wide text-slate-500">Completed</p>
						<p class="mt-1 text-xl font-semibold text-slate-900">
							{currentRun.current.stops.filter((stop) => stop.status === 'done').length}
						</p>
					</article>
					<article class="rounded-lg bg-slate-50 px-3 py-3">
						<p class="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
						<p class="mt-1 text-xl font-semibold text-slate-900">
							{currentRun.current.stops.filter((stop) => stop.status === 'skipped').length}
						</p>
					</article>
				</div>
			</section>

			<section class="grid gap-3">
				{#each currentRun.current.stops as stop}
					<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p class="text-sm font-semibold text-slate-900">
									Stop {stop.sequence} • {stop.status}
								</p>
								<p class="mt-1 text-xs text-slate-500">
									Lat/Lng: {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
									{#if stop.zoneId}
										• Zone {stop.zoneId}
									{/if}
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<a
									href={`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`}
									target="_blank"
									rel="noreferrer"
									class="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
								>
									Open map
								</a>
								<button
									type="button"
									onclick={() => markCurrentStop(stop.id, 'done')}
									disabled={stop.status !== 'pending'}
									class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									Done
								</button>
								<button
									type="button"
									onclick={() => markCurrentStop(stop.id, 'skipped')}
									disabled={stop.status !== 'pending'}
									class="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
								>
									Skipped
								</button>
							</div>
						</div>
					</article>
				{/each}
			</section>
		</div>
	{/if}

	<section class="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
		<h2 class="text-sm font-semibold text-slate-800">Report Road Condition</h2>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="text-sm font-medium text-slate-700 sm:col-span-1">
				Severity
				<select
					bind:value={roadSeverity}
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</label>
			<label class="text-sm font-medium text-slate-700 sm:col-span-2">
				Description
				<input
					bind:value={roadDescription}
					placeholder="Road blocked, flooding, diversion, potholes, etc."
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
		</div>
		<button
			type="button"
			onclick={reportRoadIssue}
			disabled={!roadDescription.trim()}
			class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Submit road issue
		</button>
	</section>

	{#if currentRun.current?.run.status === 'completed'}
		<section class="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
			<h2 class="text-sm font-semibold text-slate-800">Run Summary</h2>
			{#if currentRun.current.summary}
				<div class="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
					Run summary submitted on {new Date(currentRun.current.summary.createdAt).toLocaleString()}.
				</div>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="text-sm font-medium text-slate-700">
					Collection volume (kg)
					<input
						bind:value={collectionVolumeKg}
						type="number"
						min="0"
						step="0.1"
						placeholder="e.g. 620"
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Missed pickups
					<input
						bind:value={missedPickups}
						type="number"
						min="0"
						step="1"
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700 sm:col-span-2">
					Issues faced
					<textarea
						bind:value={runIssues}
						rows="3"
						placeholder="Missed pickups, access constraints, safety issues, etc."
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
					></textarea>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Delays
					<textarea
						bind:value={delayNotes}
						rows="3"
						placeholder="Traffic, queueing, waiting time, diversions."
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
					></textarea>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Road conditions
					<textarea
						bind:value={roadConditionNotes}
						rows="3"
						placeholder="Flooding, damaged surface, blocked section."
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
					></textarea>
				</label>
			</div>

			<button
				type="button"
				onclick={saveRunSummary}
				disabled={submittingSummary || !!currentRun.current.summary}
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{submittingSummary ? 'Saving summary...' : currentRun.current.summary ? 'Summary already saved' : 'Save run summary'}
			</button>
		</section>
	{/if}
</div>
