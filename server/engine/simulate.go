package engine

import (
	"fmt"
	"math"
)

// Eps mantiene U estrictamente dentro de (0,1) cuando se toma ln(U).
const Eps = 1e-12

const maxPoissonEvents = 100_000

// Source entrega uniformes; ok=false cuando una secuencia manual se agota.
type Source interface {
	Next() (u float64, ok bool)
	Consumed() int
}

type prngSource struct {
	g        Prng
	consumed int
}

func (s *prngSource) Next() (float64, bool) {
	s.consumed++
	_, r := s.g.Next()
	return r, true
}
func (s *prngSource) Consumed() int { return s.consumed }

type arraySource struct {
	values   []float64
	wrap     bool
	i        int
	consumed int
}

func (s *arraySource) Next() (float64, bool) {
	if len(s.values) == 0 {
		return 0, false
	}
	if s.i >= len(s.values) {
		if !s.wrap {
			return 0, false
		}
		s.i = 0
	}
	s.consumed++
	u := s.values[s.i]
	s.i++
	return u, true
}
func (s *arraySource) Consumed() int { return s.consumed }

func NewPrngSource(g Prng) Source                  { return &prngSource{g: g} }
func NewArraySource(v []float64, wrap bool) Source { return &arraySource{values: v, wrap: wrap} }

func openUnit(u float64) float64 {
	if math.IsNaN(u) || math.IsInf(u, 0) {
		return 0.5
	}
	return math.Min(1-Eps, math.Max(Eps, u))
}

func negLog(u float64) float64 { return -math.Log(openUnit(u)) }
// formula de la transformada inversa de la normal, para el caso de la distribucion normal
func inverseNormal(p float64) float64 {
	if p <= 0 { return -8.0 }
	if p >= 1 { return 8.0 }
	sign := 1.0
	if p < 0.5 {
		sign = -1.0
	} else {
		p = 1.0 - p
	}
	t := math.Sqrt(-2 * math.Log(p))
	c0, c1, c2 := 2.515517, 0.802853, 0.010328
	d1, d2, d3 := 1.432788, 0.189269, 0.001308
	z := t - (c0 + c1*t + c2*t*t)/(1 + d1*t + d2*t*t + d3*t*t*t)
	return sign * z
}

// Sample es una variable generada junto con las uniformes que consumió.
type Sample struct {
	I  int       `json:"i"`
	Rs []float64 `json:"rs"`
	X  float64   `json:"x"`
}

type Result struct {
	Samples   []Sample `json:"samples"`
	Requested int      `json:"requested"`
	Overflow  bool     `json:"overflow"`
	Consumed  int      `json:"consumed"`
	Clamped   int      `json:"clamped"`
}

func lgamma(x float64) float64 {
	v, _ := math.Lgamma(x)
	return v
}

func binomPmf(k, n int, p float64) float64 {
	if k < 0 || k > n {
		return 0
	}
	if p <= 0 {
		if k == 0 {
			return 1
		}
		return 0
	}
	if p >= 1 {
		if k == n {
			return 1
		}
		return 0
	}
	return math.Exp(lgamma(float64(n+1)) - lgamma(float64(k+1)) - lgamma(float64(n-k+1)) +
		float64(k)*math.Log(p) + float64(n-k)*math.Log1p(-p))
}

func poissonPmf(k int, lambda float64) float64 {
	if k < 0 {
		return 0
	}
	return math.Exp(float64(k)*math.Log(lambda) - lambda - lgamma(float64(k+1)))
}

func cdfTable(pmf func(int) float64, kMax int) []float64 {
	t := make([]float64, kMax+1)
	F := 0.0
	for k := 0; k <= kMax; k++ {
		F += pmf(k)
		t[k] = F
	}
	return t
}

// inverseDiscrete devuelve min{k : F(k) ≥ u}.
func inverseDiscrete(u float64, t []float64) int {
	lo, hi := 0, len(t)-1
	for lo < hi {
		mid := (lo + hi) / 2
		if t[mid] >= u {
			hi = mid
		} else {
			lo = mid + 1
		}
	}
	return lo
}

func need(p map[string]float64, keys ...string) error {
	for _, k := range keys {
		v, ok := p[k]
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("falta el parámetro %q", k)
		}
	}
	return nil
}

// Validate replica las reglas de DistSpec.validate del cliente.
func Validate(dist string, p map[string]float64) error {
	switch dist {
	case "binomial":
		if err := need(p, "n", "p"); err != nil {
			return err
		}
		if p["n"] < 1 || p["n"] > 500 || p["n"] != math.Trunc(p["n"]) {
			return fmt.Errorf("n ∈ {1..500}")
		}
		if p["p"] < 0 || p["p"] > 1 {
			return fmt.Errorf("p ∈ [0,1]")
		}
	case "poisson":
		if err := need(p, "lambda"); err != nil {
			return err
		}
		if p["lambda"] <= 0 || p["lambda"] > 100 {
			return fmt.Errorf("λ ∈ (0,100]")
		}
	case "normal":
		if err := need(p, "mu", "sigma"); err != nil {
			return err
		}
		if p["sigma"] <= 0 {
			return fmt.Errorf("σ > 0")
		}
	case "erlang":
		if err := need(p, "k", "lambda"); err != nil {
			return err
		}
		if p["k"] < 1 || p["k"] > 50 || p["k"] != math.Trunc(p["k"]) {
			return fmt.Errorf("k ∈ {1..50}")
		}
		if p["lambda"] <= 0 {
			return fmt.Errorf("λ > 0")
		}
	case "uniform": // uniforme agregado
		if err := need(p, "a", "b"); err != nil {
			return err
		}
		if p["a"] >= p["b"] {
			return fmt.Errorf("A debe ser menor que B")
		}
	default:
		return fmt.Errorf("distribución desconocida %q", dist)
	}
	return nil
}

// Simulate genera n variables de la distribución indicada consumiendo uniformes de src.
func Simulate(dist, method string, p map[string]float64, src Source, n int) (*Result, error) {
	if err := Validate(dist, p); err != nil {
		return nil, err
	}
	res := &Result{Requested: n, Samples: make([]Sample, 0, n)}
	take := func() (float64, bool) {
		u, ok := src.Next()
		if ok && (u < Eps || u > 1-Eps) {
			res.Clamped++
		}
		return u, ok
	}

	var table []float64
	if method == "inverse" && dist == "binomial" {
		nn := int(p["n"])
		table = cdfTable(func(k int) float64 { return binomPmf(k, nn, p["p"]) }, nn)
	} else if method == "inverse" && dist == "poisson" {
		l := p["lambda"]
		table = cdfTable(func(k int) float64 { return poissonPmf(k, l) }, int(math.Ceil(l+20*math.Sqrt(l)+50)))
	}

outer:
	for len(res.Samples) < n {
		i := len(res.Samples) + 1
		switch dist {
		case "binomial":
			if method == "inverse" {
				u, ok := take()
				if !ok {
					break outer
				}
				res.Samples = append(res.Samples, Sample{i, []float64{u}, float64(inverseDiscrete(u, table))})
			} else {
				trials := int(p["n"])
				rs := make([]float64, 0, trials)
				x := 0
				for j := 0; j < trials; j++ {
					u, ok := take()
					if !ok {
						break outer
					}
					rs = append(rs, u)
					if u < p["p"] {
						x++
					}
				}
				res.Samples = append(res.Samples, Sample{i, rs, float64(x)})
			}
		case "poisson":
			if method == "inverse" {
				u, ok := take()
				if !ok {
					break outer
				}
				res.Samples = append(res.Samples, Sample{i, []float64{u}, float64(inverseDiscrete(u, table))})
			} else {
				var rs []float64
				t, x := 0.0, 0
				for x < maxPoissonEvents {
					u, ok := take()
					if !ok {
						break outer
					}
					rs = append(rs, u)
					t += negLog(u) / p["lambda"]
					if t > 1 {
						break
					}
					x++
				}
				res.Samples = append(res.Samples, Sample{i, rs, float64(x)})
			}

			case "normal":
			mu, sigma := p["mu"], p["sigma"]
			if method == "inverse" {
				u, ok := take()
				if !ok {
					break outer
				}
				z := inverseNormal(u) // Llama a la fórmula de Hastings
				res.Samples = append(res.Samples, Sample{i, []float64{u}, mu + sigma*z})
			} else if method == "tcl12" {
				rs := make([]float64, 0, 12)
				s := 0.0
				for j := 0; j < 12; j++ {
					u, ok := take()
					if !ok {
						break outer
					}
					rs = append(rs, u)
					s += u
				}
				res.Samples = append(res.Samples, Sample{i, rs, mu + sigma*(s-6)})
			} else {
				// Box-Muller por defecto
				u1, ok := take()
				if !ok {
					break outer
				}
				u2, ok := take()
				if !ok {
					break outer
				}
				radius := math.Sqrt(-2 * math.Log(openUnit(u1)))
				theta := 2 * math.Pi * u2
				rs := []float64{u1, u2}
				res.Samples = append(res.Samples, Sample{i, rs, mu + sigma*radius*math.Cos(theta)})
				if len(res.Samples) < n {
					res.Samples = append(res.Samples, Sample{i + 1, rs, mu + sigma*radius*math.Sin(theta)})
				}
			}
			
		case "erlang":
			k := int(p["k"])
			rs := make([]float64, 0, k)
			s := 0.0
			for j := 0; j < k; j++ {
				u, ok := take()
				if !ok {
					break outer
				}
				rs = append(rs, u)
				s += negLog(u)
			}
			res.Samples = append(res.Samples, Sample{i, rs, s / p["lambda"]})

		case "uniform": // uniforme agregado
			u, ok := take()
			if !ok {
				break outer
			}
			a, b := p["a"], p["b"]
			res.Samples = append(res.Samples, Sample{i, []float64{u}, a + (b-a)*u})
		}
	}
	res.Overflow = len(res.Samples) < n
	res.Consumed = src.Consumed()
	return res, nil
}
