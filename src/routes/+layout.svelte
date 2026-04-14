<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import AppBottomNav from '$lib/components/AppBottomNav.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import './layout.css';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const adminLinks = [
		{ href: '/admin/dashboard', label: 'Dashboard' },
		{ href: '/admin/dispatch', label: 'Dispatch' },
		{ href: '/admin/reports', label: 'Citizen Reports' },
		{ href: '/admin/driver-reports', label: 'Driver Reports' }
	];

	const citizenNav = [
		{ href: '/citizen/report', label: 'Report', icon: 'report' as const },
		{ href: '/citizen/reports', label: 'My Reports', icon: 'list' as const }
	];

	const driverNav = [
		{ href: '/driver/run', label: 'Dashboard', icon: 'route' as const },
		{ href: '/driver/reports', label: 'Reports', icon: 'alert' as const }
	];

	onMount(() => {
		if (!browser || !('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.register('/service-worker.js');
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" content="#0f766e" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Wastely" />
</svelte:head>

{#if data.role === 'admin'}
	<div class="admin-shell">
		<div class="admin-backdrop"></div>
		<header class="admin-header">
			<div class="admin-header-inner">
				<div class="brand-block">
					<a href="/" class="brand-mark">W</a>
					<div>
						<p class="brand-name">Wastely Command</p>
						<p class="brand-subtitle">Municipal operations and field intelligence</p>
					</div>
				</div>

				<div class="admin-actions">
					<InstallPrompt />
					{#if data.user}
						<form method="post" action="/logout">
							<button type="submit" class="header-button primary">Sign out</button>
						</form>
					{:else}
						<a href="/login" class="header-button primary">Sign in</a>
					{/if}
				</div>
			</div>

			<nav class="admin-nav">
				{#each adminLinks as link}
					<a href={link.href} class:active={page.url.pathname === link.href || page.url.pathname.startsWith(`${link.href}/`)}>
						{link.label}
					</a>
				{/each}
			</nav>
		</header>

		<main class="admin-main">
			{@render children()}
		</main>
	</div>
{:else if data.role === 'citizen' || data.role === 'driver'}
	<div class="app-shell">
		<div class="app-backdrop"></div>
		<header class="app-header">
			<div>
				<p class="app-eyebrow">{data.role === 'citizen' ? 'Citizen App' : 'Driver App'}</p>
				<h1 class="app-title">Wastely</h1>
			</div>

			<div class="app-header-actions">
				<InstallPrompt />
				<form method="post" action="/logout">
					<button type="submit" class="header-button ghost">Exit</button>
				</form>
			</div>
		</header>

		<main class="app-main">
			{@render children()}
		</main>

		<AppBottomNav pathname={page.url.pathname} items={data.role === 'citizen' ? citizenNav : driverNav} />
	</div>
{:else}
	<div class="public-shell">
		<header class="public-header">
			<a href="/" class="public-brand">Wastely</a>
			<div class="admin-actions">
				<InstallPrompt />
				<a href="/login" class="header-button primary">Sign in</a>
			</div>
		</header>

		<main class="public-main">
			{@render children()}
		</main>
	</div>
{/if}
