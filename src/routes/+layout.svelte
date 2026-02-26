<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
	<header class="border-b border-slate-200 bg-white/90 backdrop-blur">
		<div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
			<a href="/" class="text-lg font-semibold tracking-tight">Wastely</a>

			<nav class="flex items-center gap-2 text-sm">
				{#if data.user}
					<a href="/citizen/report" class="rounded px-3 py-1.5 hover:bg-slate-100">Citizen</a>
					<a href="/driver/run" class="rounded px-3 py-1.5 hover:bg-slate-100">Driver</a>
					<a href="/admin/dashboard" class="rounded px-3 py-1.5 hover:bg-slate-100">Admin</a>
					<form method="post" action="/logout">
						<button type="submit" class="rounded bg-slate-900 px-3 py-1.5 font-medium text-white">
							Sign out
						</button>
					</form>
				{:else}
					<a href="/login" class="rounded bg-slate-900 px-3 py-1.5 font-medium text-white">Sign in</a>
				{/if}
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-6xl px-4 py-6">
		{@render children()}
	</main>
</div>
