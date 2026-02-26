<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="mx-auto max-w-xl space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Sign in to Wastely</h1>
		<p class="text-sm text-slate-600">Use email/password to access citizen, driver, and admin flows.</p>
	</div>

	<form method="post" action="?/signInEmail" use:enhance class="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
		<div class="grid gap-3">
			<label class="text-sm font-medium text-slate-700">
				Email
				<input
					type="email"
					name="email"
					required
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Password
				<input
					type="password"
					name="password"
					required
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Name (required for registration)
				<input
					name="name"
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				type="submit"
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Sign in
			</button>
			<button
				formaction="?/signUpEmail"
				class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
			>
				Register
			</button>
		</div>

		{#if form?.message}
			<p class="text-sm font-medium text-rose-600">{form.message}</p>
		{/if}
	</form>
</div>
