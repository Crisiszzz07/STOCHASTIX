// Función serverless de Vercel: POST /api/simulate.
package handler

import (
	"net/http"

	"stochastix/server/httpapi"
)

func SimulateHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Simulate(w, r)
}
