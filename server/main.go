package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"stochastix/server/httpapi"
)

func main() {
	addr := flag.String("addr", ":8080", "dirección de escucha")
	static := flag.String("static", "", "carpeta del build de Vite a servir (p. ej. web/dist)")
	flag.Parse()

	mux := httpapi.Mux()
	if *static != "" {
		dir, _ := filepath.Abs(*static)
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
			log.Fatalf("no se encontró %s/index.html (ejecuta pnpm build primero)", dir)
		}
		mux.Handle("/", http.FileServer(http.Dir(dir)))
		log.Printf("sirviendo frontend desde %s", dir)
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           httpapi.CORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	log.Printf("STOCHASTIX Go engine escuchando en %s", *addr)
	log.Fatal(srv.ListenAndServe())
}
