<script lang="ts">
	export let pathname = '/';
	export let items: Array<{
		href: string;
		label: string;
		icon: 'report' | 'list' | 'route' | 'alert';
	}> = [];

	function iconPath(icon: 'report' | 'list' | 'route' | 'alert') {
		switch (icon) {
			case 'report':
				return 'M12 3l8 4v6c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4zm0 5v5m0 4h.01';
			case 'list':
				return 'M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01';
			case 'route':
				return 'M6 19a2 2 0 110-4 2 2 0 010 4zm12-10a2 2 0 110-4 2 2 0 010 4zM6 15V8a4 4 0 014-4h6m2 4v8a4 4 0 01-4 4H8';
			case 'alert':
				return 'M10.3 3.9l-7.1 12.3A1.2 1.2 0 004.2 18h15.6a1.2 1.2 0 001-1.8L13.7 3.9a1.2 1.2 0 00-2 0zM12 9v3m0 3h.01';
		}
	}
</script>

<nav class="app-bottom-nav">
	{#each items as item}
		{@const active = pathname === item.href || pathname.startsWith(`${item.href}/`)}
		<a href={item.href} class:active class="app-bottom-link">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d={iconPath(item.icon)} />
			</svg>
			<span>{item.label}</span>
		</a>
	{/each}
</nav>
