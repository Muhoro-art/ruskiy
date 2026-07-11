package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LegalConsentStore persists + retrieves the clickwrap consent audit trail (Terms /
// Privacy / Cookie acceptance at signup).
type LegalConsentStore struct {
	db *pgxpool.Pool
}

func NewLegalConsentStore(db *pgxpool.Pool) *LegalConsentStore { return &LegalConsentStore{db: db} }

// Record stores one consent event. ip/userAgent are truncated defensively by the caller.
func (s *LegalConsentStore) Record(ctx context.Context, userID uuid.UUID, terms, privacy, cookie, consent, ip, userAgent string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO legal_consents (user_id, terms_version, privacy_version, cookie_version, consent_version, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		userID, terms, privacy, cookie, consent, ip, userAgent)
	return err
}

type LegalConsent struct {
	TermsVersion   string    `json:"termsVersion"`
	PrivacyVersion string    `json:"privacyVersion"`
	CookieVersion  string    `json:"cookieVersion"`
	ConsentVersion string    `json:"consentVersion"`
	AcceptedAt     time.Time `json:"acceptedAt"`
	IPAddress      string    `json:"ipAddress"`
	UserAgent      string    `json:"userAgent"`
}

// ListForUser returns a user's consent records, newest first — their own auditable copy
// (behind GET /me/legal-consents) and the evidence a regulator would request.
func (s *LegalConsentStore) ListForUser(ctx context.Context, userID uuid.UUID) ([]LegalConsent, error) {
	rows, err := s.db.Query(ctx,
		`SELECT terms_version, privacy_version, cookie_version, COALESCE(consent_version,''), accepted_at,
		        COALESCE(ip_address,''), COALESCE(user_agent,'')
		 FROM legal_consents WHERE user_id=$1 ORDER BY accepted_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LegalConsent{}
	for rows.Next() {
		var c LegalConsent
		if err := rows.Scan(&c.TermsVersion, &c.PrivacyVersion, &c.CookieVersion, &c.ConsentVersion, &c.AcceptedAt, &c.IPAddress, &c.UserAgent); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
