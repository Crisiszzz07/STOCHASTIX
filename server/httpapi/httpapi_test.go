package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	Health(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"engine":"go"`) {
		t.Fatalf("health: %d %s", rec.Code, rec.Body)
	}
}

func TestSimulateSequence(t *testing.T) {
	body := `{"dist":"erlang","method":"convolution","params":{"k":3,"lambda":1},"n":5,
	          "source":{"kind":"sequence","values":[0.1,0.2,0.3,0.4],"wrap":false}}`
	rec := httptest.NewRecorder()
	Simulate(rec, httptest.NewRequest(http.MethodPost, "/api/simulate", strings.NewReader(body)))
	if rec.Code != 200 {
		t.Fatalf("simulate: %d %s", rec.Code, rec.Body)
	}
	var res struct {
		Samples  []struct{ X float64 } `json:"samples"`
		Overflow bool                  `json:"overflow"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Samples) != 1 || !res.Overflow {
		t.Fatalf("esperaba 1 muestra con overflow: %+v", res)
	}
}

func TestSimulateRejectsBadValues(t *testing.T) {
	body := `{"dist":"normal","method":"boxmuller","params":{"mu":0,"sigma":1},"n":2,
	          "source":{"kind":"sequence","values":[0.5,1.7]}}`
	rec := httptest.NewRecorder()
	Simulate(rec, httptest.NewRequest(http.MethodPost, "/api/simulate", strings.NewReader(body)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("esperaba 400, got %d", rec.Code)
	}
}
