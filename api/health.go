// Función serverless de Vercel: GET /api/health.
package handler

import (
	"net/http"

	"stochastix/server/httpapi"
)

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Health(w, r)
}
