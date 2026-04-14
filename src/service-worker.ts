/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `wastely-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(ASSETS);
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
			await self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;

	const isNavigation = event.request.mode === 'navigate';

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(event.request);

			if (cached && !isNavigation) return cached;

			try {
				const response = await fetch(event.request);
				if (response.ok && (isNavigation || url.pathname.startsWith('/_app/') || url.pathname.startsWith('/icons/'))) {
					cache.put(event.request, response.clone());
				}
				return response;
			} catch {
				if (cached) return cached;
				if (isNavigation) {
					const fallback = await cache.match('/');
					if (fallback) return fallback;
				}
				throw new Error('Network unavailable');
			}
		})()
	);
});
