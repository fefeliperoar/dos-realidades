# Dos realidades

Ejercicio 02 del curso (DPPI 2026), sobre visión artificial y representación. La idea era tomar una sola cámara y usarla para armar dos maneras completamente distintas de "ver" lo mismo.

**Demo:** `<pendiente>`
**Repo:** `<pendiente>`

## De qué se trata

Hay dos sistemas corriendo al mismo tiempo, con la misma cámara:

- **Sistema A** usa MediaPipe Pose para detectar el cuerpo y dibuja los puntos y conexiones como una especie de constelación que se mueve con la persona.
- **Sistema B** no reconoce nada en particular: compara cada frame con el anterior y muestra en qué zonas de la imagen hubo cambios de luz, como partículas que aparecen donde hay movimiento.

Ninguno de los dos muestra la cámara tal cual — cada uno se queda solo con el dato que le importa y lo dibuja a su manera. Por eso terminan pareciendo dos cosas distintas aunque estén mirando lo mismo.

## Cómo probarlo

El `index.html` no se puede abrir directo con doble clic porque el script usa módulos de JS. Hay que levantar un servidor local desde la carpeta, por ejemplo:

```
python3 -m http.server 8000
```

y entrar a `http://localhost:8000`. Va a pedir permiso de cámara — hay que aceptarlo y apretar "Activar cámara".

## Reflexión

El Sistema A hace visible la dimensión estructural del cuerpo: su topología, sus articulaciones y su configuración espacial en un instante dado. Sabe dónde están las manos, la cadera o la cabeza, pero no percibe si el fondo se mueve, si cambia la luz o si hay algo en la escena que no sea un cuerpo reconocible para el modelo. El Sistema B, en cambio, hace visible la dimensión temporal del cambio: revela dónde ocurre variación entre un frame y otro, sin distinguir si esa variación proviene de un cuerpo, una sombra o un objeto cualquiera. No sabe *qué* se mueve, solo que algo se mueve. Ninguno de los dos ve "la escena completa": uno reduce la realidad a una anatomía reconocible, el otro a un campo de diferencias de píxeles. Juntos evidencian que toda visión artificial recorta el mundo según aquello que fue diseñada para detectar.

## Tecnologías

MediaPipe Pose Landmarker (cargado desde CDN) y Canvas 2D con JavaScript puro, sin frameworks ni build.

---
Felipe · Ejercicio 02 — Dos realidades · DPPI 2026
