import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = () => Date.now();

export const ward = sqliteTable('ward', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	code: text('code').notNull().unique(),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const zone = sqliteTable(
	'zone',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		wardId: integer('ward_id')
			.notNull()
			.references(() => ward.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		code: text('code').notNull(),
		centerLat: real('center_lat'),
		centerLng: real('center_lng'),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		wardIdx: index('zone_ward_idx').on(table.wardId),
		zoneCodePerWard: uniqueIndex('zone_code_per_ward_idx').on(table.wardId, table.code)
	})
);

export const collectionPoint = sqliteTable(
	'collection_point',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		zoneId: integer('zone_id')
			.notNull()
			.references(() => zone.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		address: text('address'),
		latitude: real('latitude').notNull(),
		longitude: real('longitude').notNull(),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		zoneIdx: index('collection_point_zone_idx').on(table.zoneId)
	})
);

export const userRole = sqliteTable('user_role', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id').notNull().unique(),
	role: text('role', { enum: ['citizen', 'driver', 'admin'] }).notNull().default('citizen'),
	createdAt: integer('created_at').notNull().$defaultFn(now),
	updatedAt: integer('updated_at').notNull().$defaultFn(now)
});

export const vehicle = sqliteTable('vehicle', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	plateNumber: text('plate_number').notNull().unique(),
	capacityKg: real('capacity_kg').notNull().default(0),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const driverProfile = sqliteTable(
	'driver_profile',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').notNull().unique(),
		vehicleId: integer('vehicle_id').references(() => vehicle.id, { onDelete: 'set null' }),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at').notNull().$defaultFn(now),
		updatedAt: integer('updated_at').notNull().$defaultFn(now)
	},
	(table) => ({
		vehicleIdx: index('driver_profile_vehicle_idx').on(table.vehicleId)
	})
);

export const citizenReport = sqliteTable(
	'citizen_report',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		reporterUserId: text('reporter_user_id').notNull(),
		zoneId: integer('zone_id').references(() => zone.id, { onDelete: 'set null' }),
		category: text('category', {
			enum: ['uncollected', 'illegal_dumping', 'overflowing_bin', 'other']
		})
			.notNull()
			.default('uncollected'),
		description: text('description').notNull(),
		latitude: real('latitude').notNull(),
		longitude: real('longitude').notNull(),
		status: text('status', { enum: ['open', 'in_review', 'resolved', 'rejected'] })
			.notNull()
			.default('open'),
		createdAt: integer('created_at').notNull().$defaultFn(now),
		updatedAt: integer('updated_at').notNull().$defaultFn(now)
	},
	(table) => ({
		statusIdx: index('citizen_report_status_idx').on(table.status),
		zoneIdx: index('citizen_report_zone_idx').on(table.zoneId),
		reporterIdx: index('citizen_report_reporter_idx').on(table.reporterUserId)
	})
);

export const reportPhoto = sqliteTable(
	'report_photo',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		reportId: integer('report_id')
			.notNull()
			.references(() => citizenReport.id, { onDelete: 'cascade' }),
		objectKey: text('object_key').notNull().unique(),
		publicUrl: text('public_url').notNull(),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		reportIdx: index('report_photo_report_idx').on(table.reportId)
	})
);

export const roadConditionReport = sqliteTable(
	'road_condition_report',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		reporterUserId: text('reporter_user_id').notNull(),
		zoneId: integer('zone_id').references(() => zone.id, { onDelete: 'set null' }),
		severity: text('severity', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
		description: text('description').notNull(),
		latitude: real('latitude'),
		longitude: real('longitude'),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		zoneIdx: index('road_condition_zone_idx').on(table.zoneId)
	})
);

export const routeRun = sqliteTable(
	'route_run',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		runDate: text('run_date').notNull(),
		wardId: integer('ward_id').references(() => ward.id, { onDelete: 'set null' }),
		driverUserId: text('driver_user_id'),
		vehicleId: integer('vehicle_id').references(() => vehicle.id, { onDelete: 'set null' }),
		status: text('status', { enum: ['planned', 'in_progress', 'completed', 'blocked'] })
			.notNull()
			.default('planned'),
		plannedDistanceKm: real('planned_distance_km').notNull().default(0),
		startedAt: integer('started_at'),
		completedAt: integer('completed_at'),
		createdAt: integer('created_at').notNull().$defaultFn(now),
		updatedAt: integer('updated_at').notNull().$defaultFn(now)
	},
	(table) => ({
		runDateIdx: index('route_run_run_date_idx').on(table.runDate),
		statusIdx: index('route_run_status_idx').on(table.status),
		driverIdx: index('route_run_driver_idx').on(table.driverUserId)
	})
);

export const routeStop = sqliteTable(
	'route_stop',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		routeRunId: integer('route_run_id')
			.notNull()
			.references(() => routeRun.id, { onDelete: 'cascade' }),
		zoneId: integer('zone_id').references(() => zone.id, { onDelete: 'set null' }),
		sourceReportId: integer('source_report_id').references(() => citizenReport.id, {
			onDelete: 'set null'
		}),
		sequence: integer('sequence').notNull(),
		latitude: real('latitude').notNull(),
		longitude: real('longitude').notNull(),
		action: text('action').notNull().default('collect'),
		status: text('status', { enum: ['pending', 'done', 'skipped'] }).notNull().default('pending'),
		notes: text('notes'),
		completedAt: integer('completed_at'),
		createdAt: integer('created_at').notNull().$defaultFn(now),
		updatedAt: integer('updated_at').notNull().$defaultFn(now)
	},
	(table) => ({
		routeIdx: index('route_stop_route_idx').on(table.routeRunId),
		sequenceIdx: uniqueIndex('route_stop_route_sequence_idx').on(table.routeRunId, table.sequence)
	})
);

export const driverEventLog = sqliteTable(
	'driver_event_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		routeRunId: integer('route_run_id').references(() => routeRun.id, { onDelete: 'set null' }),
		driverUserId: text('driver_user_id').notNull(),
		eventType: text('event_type').notNull(),
		payloadJson: text('payload_json'),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		routeIdx: index('driver_event_route_idx').on(table.routeRunId),
		driverIdx: index('driver_event_driver_idx').on(table.driverUserId)
	})
);

export const wasteForecast = sqliteTable(
	'waste_forecast',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		zoneId: integer('zone_id')
			.notNull()
			.references(() => zone.id, { onDelete: 'cascade' }),
		forecastDate: text('forecast_date').notNull(),
		predictedVolumeKg: real('predicted_volume_kg').notNull().default(0),
		confidence: real('confidence').notNull().default(0),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		zoneDateIdx: uniqueIndex('waste_forecast_zone_date_idx').on(table.zoneId, table.forecastDate)
	})
);

export const kpiDailySnapshot = sqliteTable(
	'kpi_daily_snapshot',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		snapshotDate: text('snapshot_date').notNull().unique(),
		wardId: integer('ward_id').references(() => ward.id, { onDelete: 'set null' }),
		plannedRuns: integer('planned_runs').notNull().default(0),
		completedRuns: integer('completed_runs').notNull().default(0),
		openReports: integer('open_reports').notNull().default(0),
		resolvedReports: integer('resolved_reports').notNull().default(0),
		averageResponseHours: real('average_response_hours').notNull().default(0),
		avgRunDurationMinutes: real('avg_run_duration_minutes').notNull().default(0),
		totalDistanceKm: real('total_distance_km').notNull().default(0),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(table) => ({
		wardDateIdx: uniqueIndex('kpi_daily_snapshot_ward_date_idx').on(table.wardId, table.snapshotDate)
	})
);

export * from './auth.schema';
