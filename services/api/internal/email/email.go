// Package email sends transactional mail (currently: address-verification links).
// It is pluggable: a real SMTP sender when SMTP_* is configured, else a dev "log"
// sender that just writes the message (and the verify link) to the server log so the
// whole flow is testable without a mail server.
package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// Sender delivers a single message. Implementations must be safe for concurrent use.
type Sender interface {
	Send(to, subject, textBody string) error
	// Configured reports whether real mail will actually be delivered (false = dev log).
	Configured() bool
}

// Config is read from the environment.
type Config struct {
	Host string // SMTP_HOST
	Port string // SMTP_PORT (587 STARTTLS, 465 implicit TLS)
	User string // SMTP_USER
	Pass string // SMTP_PASS
	From string // SMTP_FROM (e.g. "Russkiy <no-reply@yourdomain.ru>")
}

// New returns an SMTP sender when SMTP_HOST + SMTP_FROM are set, otherwise a log sender.
func New() Sender {
	cfg := Config{
		Host: os.Getenv("SMTP_HOST"),
		Port: getenv("SMTP_PORT", "587"),
		User: os.Getenv("SMTP_USER"),
		Pass: os.Getenv("SMTP_PASS"),
		From: os.Getenv("SMTP_FROM"),
	}
	if cfg.Host == "" || cfg.From == "" {
		log.Println("email: SMTP not configured (SMTP_HOST/SMTP_FROM unset) — using the DEV log sender; verification links will be written to the server log, NOT emailed.")
		return &logSender{}
	}
	log.Printf("email: SMTP sender configured (%s:%s, from %s)", cfg.Host, cfg.Port, cfg.From)
	return &smtpSender{cfg: cfg}
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// ---- dev log sender ----

type logSender struct{}

func (s *logSender) Configured() bool { return false }
func (s *logSender) Send(to, subject, textBody string) error {
	log.Printf("email(DEV, not sent) → %s | %s\n%s", to, subject, textBody)
	return nil
}

// ---- SMTP sender ----

type smtpSender struct{ cfg Config }

func (s *smtpSender) Configured() bool { return true }

func (s *smtpSender) Send(to, subject, textBody string) error {
	from := s.cfg.From
	msg := buildMessage(from, to, subject, textBody)
	addr := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	var auth smtp.Auth
	if s.cfg.User != "" {
		auth = smtp.PlainAuth("", s.cfg.User, s.cfg.Pass, s.cfg.Host)
	}

	// Port 465 = implicit TLS (SMTPS): dial a TLS socket first. Everything else
	// (typically 587) = STARTTLS, which net/smtp.SendMail negotiates itself.
	if s.cfg.Port == "465" {
		return s.sendImplicitTLS(addr, auth, from, to, msg)
	}
	return smtp.SendMail(addr, auth, senderAddress(from), []string{to}, msg)
}

func (s *smtpSender) sendImplicitTLS(addr string, auth smtp.Auth, from, to string, msg []byte) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12})
	if err != nil {
		return err
	}
	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return err
	}
	defer c.Close()
	if auth != nil {
		if err := c.Auth(auth); err != nil {
			return err
		}
	}
	if err := c.Mail(senderAddress(from)); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	wc, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := wc.Write(msg); err != nil {
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return c.Quit()
}

// senderAddress extracts the bare address from a "Name <addr>" From header for the
// SMTP envelope (MAIL FROM).
func senderAddress(from string) string {
	if i := strings.LastIndex(from, "<"); i >= 0 {
		if j := strings.Index(from[i:], ">"); j >= 0 {
			return from[i+1 : i+j]
		}
	}
	return from
}

func buildMessage(from, to, subject, textBody string) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().UTC().Format(time.RFC1123Z))
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(textBody)
	return []byte(b.String())
}
