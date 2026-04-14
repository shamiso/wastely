<script lang="ts">
	import { onMount } from 'svelte';

	type DeferredInstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	};

	let deferredPrompt: DeferredInstallPromptEvent | null = null;
	let installState = $state<'hidden' | 'available' | 'installed'>('hidden');

	async function install() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		const choice = await deferredPrompt.userChoice;
		if (choice.outcome === 'accepted') {
			installState = 'installed';
			deferredPrompt = null;
		}
	}

	onMount(() => {
		if (window.matchMedia('(display-mode: standalone)').matches) {
			installState = 'installed';
		}

		const handlePrompt = (event: Event) => {
			event.preventDefault();
			deferredPrompt = event as DeferredInstallPromptEvent;
			installState = 'available';
		};

		const handleInstalled = () => {
			installState = 'installed';
			deferredPrompt = null;
		};

		window.addEventListener('beforeinstallprompt', handlePrompt);
		window.addEventListener('appinstalled', handleInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', handlePrompt);
			window.removeEventListener('appinstalled', handleInstalled);
		};
	});
</script>

{#if installState === 'available'}
	<button type="button" onclick={install} class="install-chip">
		Install app
	</button>
{:else if installState === 'installed'}
	<span class="install-chip installed">Installed</span>
{/if}
