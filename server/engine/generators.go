package engine

import (
	"fmt"
	"math/bits"
)

type Prng interface {
	Next() (x uint64, r float64)
}
func mulmod(a, b, m uint64) uint64 {
	hi, lo := bits.Mul64(a%m, b%m)
	_, rem := bits.Div64(hi%m, lo, m)
	return rem
}

type congruential struct {
	x, a, c, d, m uint64
}

func (g *congruential) Next() (uint64, float64) {
	// X = (d·X² + a·X + c) mod m  (mixto: d=0; multiplicativo: d=0, c=0)
	v := mulmod(g.a, g.x, g.m)
	if g.d != 0 {
		v = (v + mulmod(mulmod(g.d, g.x, g.m), g.x, g.m)) % g.m
	}
	g.x = (v + g.c%g.m) % g.m
	return g.x, float64(g.x) / float64(g.m)
}

type bbs struct{ x, m uint64 }

func (g *bbs) Next() (uint64, float64) {
	g.x = mulmod(g.x, g.x, g.m)
	return g.x, float64(g.x) / float64(g.m)
}

type xorshift struct {
	x       uint32
	a, b, c uint
}

func (g *xorshift) Next() (uint64, float64) {
	g.x ^= g.x << g.a
	g.x ^= g.x >> g.b
	g.x ^= g.x << g.c
	return uint64(g.x), float64(g.x) / 4294967295
}

func param(cfg map[string]float64, key string) (uint64, error) {
	v, ok := cfg[key]
	if !ok {
		return 0, fmt.Errorf("falta el parámetro %q", key)
	}
	if v < 0 || v != float64(int64(v)) {
		return 0, fmt.Errorf("%s debe ser entero ≥ 0", key)
	}
	return uint64(v), nil
}

// NewPrng construye uno de los 5 generadores de simulacion-trabajo.
func NewPrng(method string, cfg map[string]float64) (Prng, error) {
	get := func(keys ...string) ([]uint64, error) {
		out := make([]uint64, len(keys))
		for i, k := range keys {
			v, err := param(cfg, k)
			if err != nil {
				return nil, err
			}
			out[i] = v
		}
		return out, nil
	}
	switch method {
	case "mixto", "multiplicativo", "cuadratico":
		v, err := get("seed", "a", "m")
		if err != nil {
			return nil, err
		}
		if v[2] < 2 {
			return nil, fmt.Errorf("m ≥ 2")
		}
		g := &congruential{x: v[0] % v[2], a: v[1], m: v[2]}
		if method != "multiplicativo" {
			if g.c, err = param(cfg, "c"); err != nil {
				return nil, err
			}
		}
		if method == "cuadratico" {
			if g.d, err = param(cfg, "d"); err != nil {
				return nil, err
			}
		}
		return g, nil
	case "bbs":
		seed, err := param(cfg, "seed")
		if err != nil {
			return nil, err
		}
		m, err := param(cfg, "M")
		if err != nil {
			pq, err2 := get("p", "q")
			if err2 != nil {
				return nil, err2
			}
			m = pq[0] * pq[1]
		}
		if m < 2 {
			return nil, fmt.Errorf("M = p·q ≥ 2")
		}
		return &bbs{x: seed % m, m: m}, nil
	case "xorshift":
		v, err := get("seed", "a", "b", "c")
		if err != nil {
			return nil, err
		}
		for _, s := range v[1:] {
			if s < 1 || s > 31 {
				return nil, fmt.Errorf("desplazamientos a, b, c ∈ [1, 31]")
			}
		}
		if uint32(v[0]) == 0 {
			return nil, fmt.Errorf("X0 ≠ 0")
		}
		return &xorshift{x: uint32(v[0]), a: uint(v[1]), b: uint(v[2]), c: uint(v[3])}, nil
	}
	return nil, fmt.Errorf("generador desconocido %q", method)
}
