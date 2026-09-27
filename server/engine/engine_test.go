package engine

import (
	"math"
	"testing"
)

func TestMixtoMatchesGeneratorSite(t *testing.T) {
	// simulacion-trabajo /api/generate: seed=4 a=5 c=7 m=8 → 3, 6, 5, 0, 7
	g, err := NewPrng("mixto", map[string]float64{"seed": 4, "a": 5, "c": 7, "m": 8})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []uint64{3, 6, 5, 0, 7} {
		if x, _ := g.Next(); x != want {
			t.Fatalf("got %d want %d", x, want)
		}
	}
}

func TestLargeModulusNoOverflow(t *testing.T) {
	g, _ := NewPrng("mixto", map[string]float64{"seed": 12345, "a": 1103515245, "c": 12345, "m": 2147483648})
	x, _ := g.Next()
	if want := uint64((1103515245*12345 + 12345) % 2147483648); x != want {
		t.Fatalf("got %d want %d", x, want)
	}
}

func TestXorshift(t *testing.T) {
	g, _ := NewPrng("xorshift", map[string]float64{"seed": 123456789, "a": 13, "b": 17, "c": 5})
	x := uint32(123456789)
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	if got, _ := g.Next(); got != uint64(x) {
		t.Fatalf("got %d want %d", got, x)
	}
}

func TestBoundaryUniformsAreSafe(t *testing.T) {
	for _, c := range []struct {
		dist, method string
		p            map[string]float64
	}{
		{"poisson", "arrivals", map[string]float64{"lambda": 4}},
		{"normal", "boxmuller", map[string]float64{"mu": 0, "sigma": 1}},
		{"erlang", "convolution", map[string]float64{"k": 3, "lambda": 1}},
	} {
		res, err := Simulate(c.dist, c.method, c.p, NewArraySource([]float64{0, 1, 0.5}, true), 300)
		if err != nil {
			t.Fatal(err)
		}
		for _, s := range res.Samples {
			if math.IsNaN(s.X) || math.IsInf(s.X, 0) {
				t.Fatalf("%s: valor no finito", c.dist)
			}
		}
		if res.Clamped == 0 {
			t.Fatalf("%s: se esperaban uniformes ajustadas", c.dist)
		}
	}
}

func TestOverflow(t *testing.T) {
	res, _ := Simulate("erlang", "convolution", map[string]float64{"k": 3, "lambda": 1},
		NewArraySource([]float64{0.1, 0.2, 0.3, 0.4}, false), 5)
	if len(res.Samples) != 1 || !res.Overflow {
		t.Fatalf("esperaba 1 muestra y overflow, got %d %v", len(res.Samples), res.Overflow)
	}
	want := -(math.Log(0.1) + math.Log(0.2) + math.Log(0.3))
	if math.Abs(res.Samples[0].X-want) > 1e-12 {
		t.Fatalf("got %v want %v", res.Samples[0].X, want)
	}
}

func TestMoments(t *testing.T) {
	cases := []struct {
		dist, method string
		p            map[string]float64
		mean, v      float64
	}{
		{"binomial", "bernoulli", map[string]float64{"n": 10, "p": 0.3}, 3, 2.1},
		{"binomial", "inverse", map[string]float64{"n": 10, "p": 0.3}, 3, 2.1},
		{"poisson", "arrivals", map[string]float64{"lambda": 4}, 4, 4},
		{"poisson", "inverse", map[string]float64{"lambda": 4}, 4, 4},
		{"normal", "boxmuller", map[string]float64{"mu": 0, "sigma": 1}, 0, 1},
		{"normal", "tcl12", map[string]float64{"mu": 0, "sigma": 1}, 0, 1},
		{"erlang", "convolution", map[string]float64{"k": 3, "lambda": 1}, 3, 3},
	}
	for _, c := range cases {
		g, _ := NewPrng("mixto", map[string]float64{"seed": 12345, "a": 1103515245, "c": 12345, "m": 2147483648})
		res, err := Simulate(c.dist, c.method, c.p, NewPrngSource(g), 40000)
		if err != nil {
			t.Fatal(err)
		}
		var m, m2 float64
		for i, s := range res.Samples {
			d := s.X - m
			m += d / float64(i+1)
			m2 += d * (s.X - m)
		}
		v := m2 / float64(len(res.Samples)-1)
		if math.Abs(m-c.mean) > 0.05*math.Max(1, c.mean) || math.Abs(v-c.v)/c.v > 0.06 {
			t.Errorf("%s/%s: media %.4f var %.4f", c.dist, c.method, m, v)
		}
	}
}
