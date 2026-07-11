package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsStore persists and aggregates in-house product-analytics events.
// It powers the admin monitoring panel (usage metrics, click heatmaps, dwell,
// and drop-off). Minors are excluded upstream, so this only ever holds adult data.
type AnalyticsStore struct {
	db *pgxpool.Pool
}

func NewAnalyticsStore(db *pgxpool.Pool) *AnalyticsStore {
	return &AnalyticsStore{db: db}
}

// AnalyticsEvent is one behavioral event as received from the client. Coordinate
// and duration fields are pointers so "not applicable" is stored as SQL NULL.
type AnalyticsEvent struct {
	SessionID  uuid.UUID       `json:"sessionId"`
	EventType  string          `json:"type"`
	Route      string          `json:"route"`
	Element    string          `json:"element"`
	X          *float64        `json:"x"`
	Y          *float64        `json:"y"`
	VW         *int            `json:"vw"`
	VH         *int            `json:"vh"`
	DurationMs *int            `json:"durationMs"`
	Meta       json.RawMessage `json:"meta"`
	ClientTS   *time.Time      `json:"clientTs"`
}

// InsertBatch bulk-inserts a batch of events for one user via COPY (efficient for
// the high write volume analytics produces).
func (s *AnalyticsStore) InsertBatch(ctx context.Context, userID uuid.UUID, segment string, events []AnalyticsEvent) error {
	if len(events) == 0 {
		return nil
	}
	rows := make([][]interface{}, 0, len(events))
	for _, e := range events {
		var meta interface{}
		if len(e.Meta) > 0 {
			meta = []byte(e.Meta)
		}
		var elem, route interface{}
		if e.Route != "" {
			route = e.Route
		}
		if e.Element != "" {
			elem = e.Element
		}
		rows = append(rows, []interface{}{
			e.SessionID, userID, segment, e.EventType, route, elem,
			e.X, e.Y, e.VW, e.VH, e.DurationMs, meta, e.ClientTS,
		})
	}
	_, err := s.db.CopyFrom(ctx,
		pgx.Identifier{"analytics_events"},
		[]string{"session_id", "user_id", "segment", "event_type", "route", "element", "x", "y", "vw", "vh", "duration_ms", "meta", "client_ts"},
		pgx.CopyFromRows(rows),
	)
	return err
}

// PurgeOld deletes behavioral events older than `days` (data minimization /
// retention). The admin dashboards only ever query a trailing ≤90-day window, so
// anything older is never used yet was previously retained forever.
func (s *AnalyticsStore) PurgeOld(ctx context.Context, days int) (int64, error) {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM analytics_events WHERE created_at < now() - make_interval(days => $1)`, days)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ---------------- aggregations for the admin dashboards ----------------

type DayPoint struct {
	Day      time.Time `json:"day"`
	Users    int       `json:"users"`
	Sessions int       `json:"sessions"`
	Events   int       `json:"events"`
}

type TypeCount struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type Overview struct {
	Days          int         `json:"days"`
	Daily         []DayPoint  `json:"daily"`
	EventsByType  []TypeCount `json:"eventsByType"`
	TotalEvents   int         `json:"totalEvents"`
	TotalSessions int         `json:"totalSessions"`
	TotalUsers    int         `json:"totalUsers"`
	AvgSessionMs  int         `json:"avgSessionMs"`
}

// sessionStatsSQL is the ONE canonical rollup for period totals + average session
// length, reused by Overview and Engagement so their numbers always reconcile. A
// "session" is a session_id; its span is first→last event time (covers every
// session, not just those that emitted a clean session_end), capped at 1h to bound
// idle inflation. Returns (events, users, sessions, avgSessionMs).
const sessionStatsSQL = `
WITH ev AS (
	SELECT user_id, session_id, COALESCE(client_ts, created_at) AS ts
	FROM analytics_events
	WHERE created_at >= now() - make_interval(days => $1)
),
sess AS (
	SELECT session_id, min(ts) AS started, max(ts) AS ended FROM ev GROUP BY session_id
)
SELECT (SELECT count(*) FROM ev),
       (SELECT count(DISTINCT user_id) FROM ev),
       (SELECT count(*) FROM sess),
       COALESCE((SELECT avg(LEAST(extract(epoch FROM (ended - started)) * 1000, 3600000))
                 FILTER (WHERE ended > started) FROM sess), 0)::int`

func (s *AnalyticsStore) Overview(ctx context.Context, days int) (*Overview, error) {
	out := &Overview{Days: days, Daily: []DayPoint{}, EventsByType: []TypeCount{}}

	// Daily series, zero-filled across the whole window so the chart always spans
	// exactly `days` calendar days (quiet days show as 0, not gaps).
	rows, err := s.db.Query(ctx, `
		SELECT gd::date AS day, COALESCE(a.users, 0), COALESCE(a.sessions, 0), COALESCE(a.events, 0)
		FROM generate_series(date_trunc('day', now()) - make_interval(days => $1 - 1),
		                     date_trunc('day', now()), interval '1 day') gd
		LEFT JOIN (
			SELECT date_trunc('day', created_at) dd,
			       COUNT(DISTINCT user_id) users, COUNT(DISTINCT session_id) sessions, COUNT(*) events
			FROM analytics_events
			WHERE created_at >= date_trunc('day', now()) - make_interval(days => $1 - 1)
			GROUP BY dd
		) a ON a.dd = gd
		ORDER BY gd`, days)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p DayPoint
		if err := rows.Scan(&p.Day, &p.Users, &p.Sessions, &p.Events); err != nil {
			rows.Close()
			return nil, err
		}
		out.Daily = append(out.Daily, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	trows, err := s.db.Query(ctx, `
		SELECT event_type, COUNT(*) FROM analytics_events
		WHERE created_at >= now() - make_interval(days => $1)
		GROUP BY event_type ORDER BY 2 DESC`, days)
	if err != nil {
		return nil, err
	}
	for trows.Next() {
		var t TypeCount
		if err := trows.Scan(&t.Type, &t.Count); err != nil {
			trows.Close()
			return nil, err
		}
		out.EventsByType = append(out.EventsByType, t)
	}
	trows.Close()
	if err := trows.Err(); err != nil {
		return nil, err
	}

	if err := s.db.QueryRow(ctx, sessionStatsSQL, days).Scan(
		&out.TotalEvents, &out.TotalUsers, &out.TotalSessions, &out.AvgSessionMs); err != nil {
		return nil, err
	}

	return out, nil
}

type RouteUsage struct {
	Route     string `json:"route"`
	Views     int    `json:"views"`
	Users     int    `json:"users"`
	AvgTimeMs int    `json:"avgTimeMs"`
}

// Routes ranks routes by traffic (least-used last). Time-on-page is derived from
// the event stream — the gap between a page_view and the next event in the same
// session (capped at 30m) — so it's always populated, not dependent on a separate
// client-emitted dwell event that can be lost.
func (s *AnalyticsStore) Routes(ctx context.Context, days int) ([]RouteUsage, error) {
	rows, err := s.db.Query(ctx, `
		WITH ev AS (
			SELECT session_id, user_id, route, event_type,
			       COALESCE(client_ts, created_at) AS ts,
			       lead(COALESCE(client_ts, created_at)) OVER (
			           PARTITION BY session_id ORDER BY COALESCE(client_ts, created_at), id) AS next_ts
			FROM analytics_events
			WHERE created_at >= now() - make_interval(days => $1)
		)
		SELECT route,
		       COUNT(*) FILTER (WHERE event_type='page_view')                AS views,
		       COUNT(DISTINCT user_id) FILTER (WHERE event_type='page_view') AS users,
		       COALESCE(AVG(LEAST(extract(epoch FROM (next_ts - ts)) * 1000, 1800000))
		           FILTER (WHERE event_type='page_view' AND next_ts > ts), 0)::int AS avg_ms
		FROM ev
		WHERE route IS NOT NULL
		GROUP BY route
		HAVING COUNT(*) FILTER (WHERE event_type='page_view') > 0
		ORDER BY views DESC`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RouteUsage{}
	for rows.Next() {
		var u RouteUsage
		if err := rows.Scan(&u.Route, &u.Views, &u.Users, &u.AvgTimeMs); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

type HeatCell struct {
	GX int `json:"gx"`
	GY int `json:"gy"`
	W  int `json:"w"`
}
type HeatmapGrid struct {
	Route string     `json:"route"`
	GridW int        `json:"gridW"`
	GridH int        `json:"gridH"`
	MaxW  int        `json:"maxW"`
	Cells []HeatCell `json:"cells"`
}

// ClickHeatmap buckets normalized click coordinates for a route into a grid so the
// admin panel can render an aggregate heatmap without exposing individual points.
func (s *AnalyticsStore) ClickHeatmap(ctx context.Context, route string, days, gridW, gridH int) (*HeatmapGrid, error) {
	out := &HeatmapGrid{Route: route, GridW: gridW, GridH: gridH, Cells: []HeatCell{}}
	rows, err := s.db.Query(ctx, `
		SELECT LEAST(floor(x * $3)::int, $3-1) AS gx,
		       LEAST(floor(y * $4)::int, $4-1) AS gy,
		       COUNT(*) AS w
		FROM analytics_events
		WHERE event_type='click' AND route=$1
		  AND x IS NOT NULL AND y IS NOT NULL AND x >= 0 AND y >= 0
		  AND created_at >= now() - make_interval(days => $2)
		GROUP BY gx, gy`, route, days, gridW, gridH)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c HeatCell
		if err := rows.Scan(&c.GX, &c.GY, &c.W); err != nil {
			return nil, err
		}
		if c.W > out.MaxW {
			out.MaxW = c.W
		}
		out.Cells = append(out.Cells, c)
	}
	return out, rows.Err()
}

type ExitRoute struct {
	Route string `json:"route"`
	Count int    `json:"count"`
}
type TaskFunnel struct {
	Task      string `json:"task"`
	Starts    int    `json:"starts"`
	Completes int    `json:"completes"`
	Abandons  int    `json:"abandons"`
}
type Engagement struct {
	Days         int          `json:"days"`
	ExitRoutes   []ExitRoute  `json:"exitRoutes"`
	TaskFunnel   []TaskFunnel `json:"taskFunnel"`
	AvgSessionMs int          `json:"avgSessionMs"`
}

// Engagement surfaces where sessions end (drop-off) and where learners abandon
// tasks (boredom / difficulty), plus average session length.
func (s *AnalyticsStore) Engagement(ctx context.Context, days int) (*Engagement, error) {
	out := &Engagement{Days: days, ExitRoutes: []ExitRoute{}, TaskFunnel: []TaskFunnel{}}

	erows, err := s.db.Query(ctx, `
		SELECT route, COUNT(*) FROM (
			SELECT DISTINCT ON (session_id) session_id, route
			FROM analytics_events
			WHERE route IS NOT NULL AND created_at >= now() - make_interval(days => $1)
			-- A whole batch shares one created_at (single COPY), so order by the
			-- client's own event time, then insertion order (id), to find the true
			-- last route of each session.
			ORDER BY session_id, COALESCE(client_ts, created_at) DESC, id DESC
		) last GROUP BY route ORDER BY 2 DESC`, days)
	if err != nil {
		return nil, err
	}
	for erows.Next() {
		var e ExitRoute
		if err := erows.Scan(&e.Route, &e.Count); err != nil {
			erows.Close()
			return nil, err
		}
		out.ExitRoutes = append(out.ExitRoutes, e)
	}
	erows.Close()
	if err := erows.Err(); err != nil {
		return nil, err
	}

	frows, err := s.db.Query(ctx, `
		SELECT COALESCE(meta->>'task','(unknown)') AS task,
		       COUNT(*) FILTER (WHERE event_type='task_start')    AS starts,
		       COUNT(*) FILTER (WHERE event_type='task_complete') AS completes,
		       COUNT(*) FILTER (WHERE event_type='task_abandon')  AS abandons
		FROM analytics_events
		WHERE event_type IN ('task_start','task_complete','task_abandon')
		  AND created_at >= now() - make_interval(days => $1)
		GROUP BY task ORDER BY starts DESC LIMIT 50`, days)
	if err != nil {
		return nil, err
	}
	for frows.Next() {
		var f TaskFunnel
		if err := frows.Scan(&f.Task, &f.Starts, &f.Completes, &f.Abandons); err != nil {
			frows.Close()
			return nil, err
		}
		out.TaskFunnel = append(out.TaskFunnel, f)
	}
	frows.Close()
	if err := frows.Err(); err != nil {
		return nil, err
	}

	// Same canonical session rollup as Overview, so "Avg session" is identical on
	// both dashboards.
	var evs, usrs, sess int
	if err := s.db.QueryRow(ctx, sessionStatsSQL, days).Scan(&evs, &usrs, &sess, &out.AvgSessionMs); err != nil {
		return nil, err
	}

	return out, nil
}
