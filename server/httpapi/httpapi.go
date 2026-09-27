// Package httpapi contiene los handlers HTTP de STOCHASTIX. Los usan tanto el
// servidor local (server/main.go) como las funciones serverless de Vercel (api/*.go).
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"stochastix/server/engine"
)

const (
	maxSamples  = 200_000
	maxUniforms = 2_000_000
	maxBody     = 64 << 20
)

type sourceSpec struct {
	Kind      string             `json:"kind"` // "prng" | "sequence"
	Generator string             `json:"generator"`
	Config    map[string]float64 `json:"config"`
	Values    []float64          `json:"values"`
	Wrap      bool               `json:"wrap"`
}

type simulateRequest struct {
	Dist   string             `json:"dist"`
	Method string             `json:"method"`
	Params map[string]float64 `json:"params"`
	N      int                `json:"n"`
	Source sourceSpec         `json:"source"`
}

type generateRequest struct {
	Method string             `json:"method"`
	Config map[string]float64 `json:"config"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, err error) {
	http.Error(w, err.Error(), status)
}

func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if r.Method != http.MethodPost {
		return errors.New("usa POST")
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	return dec.Decode(v)
}

// Simulate atiende POST /api/simulate.
func Simulate(w http.ResponseWriter, r *http.Request) {
	var req simulateRequest
	if err := decode(w, r, &req); err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	if req.N < 1 || req.N > maxSamples {
		fail(w, http.StatusBadRequest, fmt.Errorf("n ∈ [1, %d]", maxSamples))
		return
	}
	var src engine.Source
	switch req.Source.Kind {
	case "prng":
		g, err := engine.NewPrng(req.Source.Generator, req.Source.Config)
		if err != nil {
			fail(w, http.StatusBadRequest, err)
			return
		}
		src = engine.NewPrngSource(g)
	case "sequence":
		if len(req.Source.Values) > maxUniforms {
			fail(w, http.StatusBadRequest, fmt.Errorf("máximo %d uniformes", maxUniforms))
			return
		}
		for i, v := range req.Source.Values {
			if !(v >= 0 && v <= 1) {
				fail(w, http.StatusBadRequest, fmt.Errorf("R_%d = %v fuera de [0,1]", i+1, v))
				return
			}
		}
		src = engine.NewArraySource(req.Source.Values, req.Source.Wrap)
	default:
		fail(w, http.StatusBadRequest, fmt.Errorf("source.kind debe ser prng o sequence"))
		return
	}
	t0 := time.Now()
	res, err := engine.Simulate(req.Dist, req.Method, req.Params, src, req.N)
	if err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	w.Header().Set("X-Elapsed-Ms", fmt.Sprintf("%.2f", float64(time.Since(t0).Microseconds())/1000))
	writeJSON(w, http.StatusOK, res)
}

// Generate responde con el mismo JSON que /api/generate de simulacion-trabajo.
func Generate(w http.ResponseWriter, r *http.Request) {
	var req generateRequest
	if err := decode(w, r, &req); err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	n := int(req.Config["n"])
	if n < 1 || n > maxUniforms {
		fail(w, http.StatusBadRequest, fmt.Errorf("config.n ∈ [1, %d]", maxUniforms))
		return
	}
	g, err := engine.NewPrng(req.Method, req.Config)
	if err != nil {
		fail(w, http.StatusBadRequest, err)
		return
	}
	type row struct {
		I        int     `json:"i"`
		X        uint64  `json:"x"`
		R        float64 `json:"r"`
		IsRepeat bool    `json:"is_repeat"`
	}
	seen := make(map[uint64]struct{}, n)
	data := make([]row, n)
	for i := range data {
		x, r := g.Next()
		_, rep := seen[x]
		seen[x] = struct{}{}
		data[i] = row{i + 1, x, r, rep}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

// CORS permite llamar a la API desde otro origen (p. ej. Vite en desarrollo).
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Health atiende GET /api/health.
func Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "engine": "go", "version": "1.0.0"})
}

// Mux registra todas las rutas /api/* (servidor local).
func Mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", Health)
	mux.HandleFunc("/api/simulate", Simulate)
	mux.HandleFunc("/api/generate", Generate)
	return mux
}
