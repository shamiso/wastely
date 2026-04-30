<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	type LeafletModule = typeof import('leaflet');
	type LeafletMap = import('leaflet').Map;
	type FeatureGroup = import('leaflet').FeatureGroup;
	type LeafletMarker = import('leaflet').Marker;
	type LeafletCircle = import('leaflet').Circle;

	export let center: [number, number] = [-17.8252, 31.0335];
	export let zoom = 12;
	export let fitToContent = true;
	export let focusPoints: Array<[number, number]> = [];
	export let ariaLabel = 'Map';
	export let routeRequests: Array<{
		points: Array<[number, number]>;
		label?: string;
		color?: string;
		weight?: number;
		dashArray?: string;
	}> = [];
	export let userLocation:
		| {
				lat: number;
				lng: number;
				accuracy?: number | null;
		  }
		| null = null;
	export let markers: Array<{
		lat: number;
		lng: number;
		label?: string;
		color?: string;
		fillColor?: string;
		radius?: number;
	}> = [];
	export let polylines: Array<{
		points: Array<[number, number]>;
		label?: string;
		color?: string;
		weight?: number;
		dashArray?: string;
	}> = [];

	let container: HTMLDivElement | null = null;
	let L: LeafletModule | null = null;
	let map: LeafletMap | null = null;
	let layerGroup: FeatureGroup | null = null;
	let redrawToken = 0;
	let userMarker: LeafletMarker | null = null;
	let userAccuracyCircle: LeafletCircle | null = null;

	function clearUserLocationLayers() {
		userMarker?.remove();
		userAccuracyCircle?.remove();
		userMarker = null;
		userAccuracyCircle = null;
	}

	function updateViewport() {
		if (!L || !map || !layerGroup) return;

		if (focusPoints.length > 0) {
			const bounds = L.latLngBounds(focusPoints);
			if (bounds.isValid()) {
				map.fitBounds(bounds.pad(0.32), {
					animate: false
				});
				return;
			}
		}

		if (fitToContent && (markers.length > 0 || polylines.length > 0 || routeRequests.length > 0)) {
			const bounds = layerGroup.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds.pad(0.2), {
					animate: false
				});
			}
			return;
		}

		map.setView(center, zoom, {
			animate: false
		});
	}

	async function fetchRoadRoute(points: Array<[number, number]>) {
		const coordinates = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
		const response = await fetch(
			`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`
		);
		if (!response.ok) {
			throw new Error(`Route fetch failed with status ${response.status}`);
		}

		const data = (await response.json()) as {
			routes?: Array<{
				geometry?: {
					type: 'LineString';
					coordinates: Array<[number, number]>;
				};
			}>;
		};

		const geometry = data.routes?.[0]?.geometry;
		if (!geometry?.coordinates || geometry.coordinates.length < 2) {
			throw new Error('Route geometry missing');
		}

		return geometry;
	}

	async function redraw() {
		if (!L || !map) return;
		const token = ++redrawToken;

		if (layerGroup) {
			layerGroup.remove();
		}

		layerGroup = L.featureGroup();

		for (const marker of markers) {
			const circle = L.circleMarker([marker.lat, marker.lng], {
				radius: marker.radius ?? 8,
				weight: 2,
				color: marker.color ?? '#0f172a',
				fillColor: marker.fillColor ?? marker.color ?? '#38bdf8',
				fillOpacity: 0.9
			});

			if (marker.label) circle.bindPopup(marker.label);
			circle.addTo(layerGroup);
		}

		for (const line of polylines) {
			const polyline = L.polyline(line.points, {
				color: line.color ?? '#0284c7',
				weight: line.weight ?? 4,
				dashArray: line.dashArray
			});
			if (line.label) polyline.bindPopup(line.label);
			polyline.addTo(layerGroup);
		}

		layerGroup.addTo(map);

		clearUserLocationLayers();
		if (userLocation) {
			const locationIcon = L.divIcon({
				className: 'driver-location-icon',
				html: '<span class="driver-location-ping"></span><span class="driver-location-dot"></span>',
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});

			userMarker = L.marker([userLocation.lat, userLocation.lng], {
				icon: locationIcon,
				zIndexOffset: 1000
			}).addTo(map);
			userMarker.bindPopup(
				`Your location${userLocation.accuracy ? ` • accuracy ${Math.round(userLocation.accuracy)} m` : ''}`
			);

			if (userLocation.accuracy && userLocation.accuracy > 0) {
				userAccuracyCircle = L.circle([userLocation.lat, userLocation.lng], {
					radius: userLocation.accuracy,
					color: '#2563eb',
					weight: 1,
					fillColor: '#60a5fa',
					fillOpacity: 0.16
				}).addTo(map);
			}
		}

		updateViewport();

		for (const routeRequest of routeRequests) {
			if (routeRequest.points.length < 2) continue;

			try {
				const geometry = await fetchRoadRoute(routeRequest.points);
				if (token !== redrawToken || !L || !layerGroup) return;

				const routeLayer = L.geoJSON(geometry, {
					style: {
						color: routeRequest.color ?? '#0284c7',
						weight: routeRequest.weight ?? 5,
						dashArray: routeRequest.dashArray
					}
				});
				if (routeRequest.label) routeLayer.bindPopup(routeRequest.label);
				routeLayer.addTo(layerGroup);
			} catch {
				if (token !== redrawToken || !L || !layerGroup) return;

				const fallbackLine = L.polyline(routeRequest.points, {
					color: routeRequest.color ?? '#0284c7',
					weight: routeRequest.weight ?? 5,
					dashArray: routeRequest.dashArray
				});
				if (routeRequest.label) fallbackLine.bindPopup(routeRequest.label);
				fallbackLine.addTo(layerGroup);
			}

			updateViewport();
		}
	}

	onMount(() => {
		let disposed = false;

		const initialize = async () => {
			if (!container) return;

			L = await import('leaflet');
			if (disposed || !container) return;

			map = L.map(container, {
				zoomControl: true
			});

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);

			redraw();
			setTimeout(() => map?.invalidateSize(), 0);
		};

		void initialize();

		return () => {
			disposed = true;
			clearUserLocationLayers();
			layerGroup?.remove();
			map?.remove();
			layerGroup = null;
			map = null;
		};
	});

	$: if (map) {
		redraw();
	}
</script>

<div class="map-picker-shell">
	<div bind:this={container} class="map-picker-canvas" aria-label={ariaLabel}></div>
</div>

<style>
	:global(.driver-location-icon) {
		background: transparent;
		border: 0;
	}

	:global(.driver-location-icon span) {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
	}

	:global(.driver-location-ping) {
		background: rgba(59, 130, 246, 0.24);
		animation: driver-location-pulse 1.8s ease-out infinite;
	}

	:global(.driver-location-dot) {
		inset: 5px;
		background: linear-gradient(135deg, #2563eb, #06b6d4);
		border: 2px solid #fff;
		box-shadow: 0 8px 18px rgba(37, 99, 235, 0.32);
	}

	@keyframes driver-location-pulse {
		0% {
			transform: scale(0.7);
			opacity: 0.95;
		}

		70% {
			transform: scale(1.65);
			opacity: 0;
		}

		100% {
			transform: scale(1.75);
			opacity: 0;
		}
	}
</style>
