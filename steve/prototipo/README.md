# STEVE — prototipo fase 1

Consulta de protocolos de un servicio hospitalario para enfermería y TCAE. La supervisión sube los protocolos (PDF, TXT o MD) y el personal pregunta desde el móvil. Cada respuesta cita el protocolo y la página o sección de la que sale; si la respuesta no está en los protocolos, STEVE dice "No consta en los protocolos del servicio."

> **Prototipo con documentos de prueba.** Los 5 protocolos de `seed/` son ficticios. No usar con protocolos ni datos reales sin la aprobación de Informática y del Delegado de Protección de Datos del hospital.

## Puesta en marcha

Requiere Node 20 o superior.

```bash
cd steve/prototipo
npm install
npm start                     # modo demostración (sin IA)
ANTHROPIC_API_KEY=... npm start   # modo IA
```

Abre `http://localhost:3000`. Usuarios de prueba: `admin` (supervisión), `enfermera` y `tcae`, con la contraseña `steve-demo`.

| Variable | Por defecto | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Sin ella arranca en modo demostración: devuelve los fragmentos más relevantes, sin IA |
| `STEVE_MODEL` | `claude-opus-5` | Modelo de Claude |
| `STEVE_MAX_CONTEXT_TOKENS` | `150000` | Si los protocolos vigentes superan esta cifra, se envían solo las páginas más relevantes |
| `STEVE_DEMO_PASSWORD` | `steve-demo` | Contraseña de los usuarios de prueba (solo al crearlos por primera vez) |
| `STEVE_DATA_DIR` | `./data` | Dónde se guardan protocolos, usuarios y registro |
| `STEVE_FALLBACKS` | activado | `0` desactiva el reenvío automático a otro modelo si Claude rechaza una consulta |
| `PORT` | `3000` | Puerto |

Pruebas: `npm test`.

## Cómo funciona

```
Móvil (PWA) ──► servidor Node ──► Claude (citas activadas)
                 · usuarios y roles
                 · protocolos por servicio (texto por página/sección)
                 · filtro de datos de pacientes
                 · registro de preguntas
```

- **Qué se envía a Claude.** Si los protocolos vigentes caben en `STEVE_MAX_CONTEXT_TOKENS`, se envían todos en cada pregunta, en el mismo orden, con caché: a partir de la segunda pregunta esa parte se cobra a una fracción del precio (con muy pocos protocolos, como los de prueba, puede no alcanzar el tamaño mínimo para cachearse). Si no caben, se eligen las páginas más relevantes (BM25) y se pierde la caché.
- **Citas.** Cada página o sección va como un bloque de un documento con `citations` activadas; la respuesta indica qué bloques cita y el servidor lo traduce a "protocolo · versión · pág. N". Pulsando la fuente se abre esa página con el texto citado resaltado.
- **Solo protocolos vigentes.** Marcar un protocolo como obsoleto lo saca de las respuestas sin borrarlo.
- **Datos de pacientes.** Las preguntas con número de cama o habitación, historia clínica, DNI/NIE, tarjeta sanitaria, teléfono o fecha de nacimiento se bloquean antes de salir del servidor y no se guardan. Es una red de seguridad, no un filtro completo: un nombre propio no se detecta.
- **Preguntas sin respuesta.** La supervisión ve las preguntas que no encontraron respuesta: indican huecos en los protocolos.
- **Seguridad básica.** Contraseñas con scrypt, cookie de sesión `HttpOnly` + `SameSite=Strict`, cabecera propia obligatoria en las peticiones que modifican (CSRF), límite de intentos de acceso, CSP estricta sin scripts en línea.

## Estructura

```
src/server.js    rutas HTTP, sesiones, permisos
src/steve.js     selección de protocolos, petición a Claude, lectura de citas, modo demo
src/extract.js   texto de PDF (pdf.js) y de TXT/MD
src/text.js      normalización, troceado y búsqueda BM25
src/privacy.js   detección de datos de pacientes
src/store.js     almacenamiento en JSON (sustituible por una base de datos)
public/          interfaz móvil (PWA)
seed/            protocolos ficticios de prueba
test/            pruebas unitarias y de la API (con un cliente de Claude simulado)
```

## Limitaciones conocidas del prototipo

- **No se ha probado contra la API real de Claude**: las pruebas usan un cliente simulado que reproduce el formato documentado de las citas. Lo primero al tener una clave es hacer preguntas reales y revisar las citas.
- PDF escaneados: no se leen (hace falta OCR). Word: hay que guardarlo como PDF.
- Las sesiones se guardan en memoria: al reiniciar el servidor hay que volver a entrar.
- Almacenamiento en archivos JSON: válido para un servicio y pocos usuarios, no para producción.
- Los usuarios solo se crean al arrancar (los de prueba). No hay pantalla de gestión de usuarios.
- No hay evaluación de calidad: antes de un piloto hace falta un conjunto de 50–100 preguntas reales con su respuesta correcta según los protocolos.
