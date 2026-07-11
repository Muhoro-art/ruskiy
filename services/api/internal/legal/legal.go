// Package legal holds the CURRENT versions of the legal documents users consent to at
// signup. Bump a version (date string) whenever that document's text changes — a new
// version means existing users should be asked to re-accept. The version recorded in
// legal_consents pins exactly which text a user agreed to.
package legal

// Keep these in sync with the document dates rendered by the web app at /legal/*.
const (
	TermsVersion   = "2026-07-11"
	PrivacyVersion = "2026-07-11"
	CookieVersion  = "2026-07-11"
	// ConsentVersion is the standalone "Consent to the processing of personal data"
	// document (152-FZ Art. 9), agreed via its OWN checkbox — recorded separately.
	ConsentVersion = "2026-07-11"
)

// Versions is the current set, exposed to the client so the signup form links to and
// records the right versions.
type Versions struct {
	Terms   string `json:"terms"`
	Privacy string `json:"privacy"`
	Cookie  string `json:"cookie"`
	Consent string `json:"consent"`
}

func Current() Versions {
	return Versions{Terms: TermsVersion, Privacy: PrivacyVersion, Cookie: CookieVersion, Consent: ConsentVersion}
}
