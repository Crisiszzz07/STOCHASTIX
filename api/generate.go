// Función serverless de Vercel: POST /api/generate.
package handler

import (
	"net/http"

	"stochastix/server/httpapi"
)

func GenerateHandler(w http.ResponseWriter, r *http.Request) {
	httpapi.Generate(w, r)
}
