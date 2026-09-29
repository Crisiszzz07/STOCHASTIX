# STOCHASTIX 

Laboratorio web para simular variables aleatorias a partir de números U(0,1),
conectado con el generador **https://simulacion-trabajo.vercel.app/**.


## Ejecutar (en caso de hacerle git clone)

```bash
pnpm install          # en la raíz (workspace)
pnpm dev              
pnpm server           # opcional: backend Go local en :8080 (Vite redirige /api allí)
pnpm test             # tests del motor TS (vitest)
pnpm server:test      # tests del backend Go
```



## Fuente de números R_i

Los R_i vienen **únicamente de archivos**; la app no genera números aleatorios propios.

1. En simulacion-trabajo genera tus números y pulsa «Exportar Excel».
2. En STOCHASTIX, panel **01 · Archivo de números R_i** (izquierda) o la zona central: arrastra el
   `simulacion_aleatorios.xlsx` o pulsa **Seleccionar archivo**.

También acepta `.csv` (`i,X_i,R_i,Estado`), `.json` (`[0.1, …]` o `{"data":[{"r":…}]}`) y pegar los valores como texto.

### Formato de la plantilla Excel

Hoja con el nombre del método (`Lineal Mixto`, `Multiplicativo`, `Cuadrático`, `Blum Blum Shub`, `Xorshift`):

- Fila 4: `i | X_i | R_i | Estado`, datos desde la fila 5.
- Columna F:G: `Semilla (X0)`, `a`, `c`, `m`, `N` (según el método).

El exportador escribe **fórmulas sin valores calculados**, así que STOCHASTIX reconstruye la serie con la misma
recurrencia y los parámetros de F:G (con aritmética entera exacta). Si la celda `R_i` trae un número (por ejemplo, porque
el archivo se guardó desde Excel o se pegaron valores a mano), se usa ese número. En Blum Blum Shub la columna R_i es un bit
de paridad, por lo que se usa `R_i = X_i / M`.

Si la secuencia no alcanza para N variables aparece **OVERFLOW** (o activa "Reciclar la secuencia").
Los R_i iguales a 0 ó 1 se aceptan y se ajustan a (ε, 1−ε) sólo donde se toma un logaritmo (**CLAMPED**).

## Reporte .xlsx completo

El botón **«Exportar reporte completo .xlsx»** (panel 04, y también en el Data Drawer) simula **todas las
distribuciones con todos sus métodos** sobre la misma secuencia de R_i y lo reúne en un solo Excel, con el estilo de
la plantilla de simulacion-trabajo (título en la fila 1, cabeceras en la fila 4) y fórmulas reales de Excel.
Cada distribución usa sus propios parámetros y su propia pregunta (la página los recuerda por distribución).

| Hoja | Contenido |
|---|---|
| **Resumen general** | Fuente de R_i, resultado de la auditoría de los R_i y una tabla comparativa de todos los métodos: N generadas, estado, media y varianza (simulada vs. teórica), favorables, P simulada, P teórica, error relativo, IC 95 %, veredicto, χ² y enlace a su hoja. ★ marca el método que se estaba viendo. |
| **Auditoría R_i** | Las 7 pruebas del panel «AUDITORÍA ESTADÍSTICA» de la plantilla (Promedios, Frecuencias, Kolmogorov-Smirnov, Entropía de Shannon, Monte Carlo para π, Distancia y Series de Coss Bu), leídas del archivo subido y calculadas con las mismas fórmulas de su hoja «Auxiliares». |
| **Distribución · Método** (una por método) | Variables paso a paso (`i · R_1…R_m · Nº R · X_i · ¿Cumple?`), panel con parámetros, condición, validación IC 95 %, estadísticos y χ², y tabla de frecuencias. |
| **R_i** | La secuencia completa. Se puede volver a cargar en la página como fuente. |
| **Auxiliares** | Tablas fila a fila de Kolmogorov-Smirnov, Monte Carlo, Distancia y Series, con fórmulas. |
| **Teoría** | f(x) o p(k) y F(x) de cada distribución. |

## Distribuciones y métodos

- **Binomial(n, p)**: suma de Bernoulli (`R < p`) o transformada inversa.
- **Poisson(λ)**: llegadas exponenciales `−ln(R)/λ` acumuladas hasta superar T = 1, o transformada inversa.
- **Normal(μ, σ)**: Box-Muller (`√(−2 ln R₁)·cos/sin(2πR₂)`) o TCL con n = 12 (`Σ R − 6`).
- **Erlang(k, λ)**: `−(1/λ)·Σ ln(Rᵢ)`.

El Query Engine calcula `P(X ≤ k)`, `P(X ≥ k)` y `P(a ≤ X ≤ b)` (con `<`/`>` estrictos) simulada vs. teórica exacta,
con error relativo, y resalta barras y área bajo la curva en el histograma.
