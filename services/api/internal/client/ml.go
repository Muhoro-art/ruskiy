package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// MLClient communicates with the Python ML service.
type MLClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewMLClient creates a new ML service client.
func NewMLClient(baseURL string) *MLClient {
	return &MLClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// ClassifyErrorRequest is the request body for the error classification endpoint.
type ClassifyErrorRequest struct {
	LearnerResponse string `json:"learner_response"`
	CorrectAnswer   string `json:"correct_answer"`
	SkillID         string `json:"skill_id"`
	LearnerLevel    string `json:"learner_level"`
	ErrorHistory    []struct {
		ErrorType string `json:"error_type"`
		Count     int    `json:"count"`
	} `json:"error_history"`
}

// ClassifyErrorResponse is the response from the error classification endpoint.
type ClassifyErrorResponse struct {
	ErrorType   string  `json:"error_type"`
	Confidence  float64 `json:"confidence"`
	Explanation string  `json:"explanation"`
	Suggestion  string  `json:"suggestion"`
}

// ClassifyError calls the ML service to classify a learner's error.
func (c *MLClient) ClassifyError(ctx context.Context, req ClassifyErrorRequest) (*ClassifyErrorResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/classify-error", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		// ML service unavailable — return nil (non-fatal)
		return nil, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil // non-fatal
	}

	var result ClassifyErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, nil
	}
	return &result, nil
}

// Health checks if the ML service is healthy.
func (c *MLClient) Health(ctx context.Context) bool {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
