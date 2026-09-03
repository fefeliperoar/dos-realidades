# Dos realidades

Ejercicio 02 del curso (DPPI 2026), sobre visión artificial y representación. La idea era tomar una sola cámara y usarla para armar dos maneras completamente distintas de "ver" lo mismo.

**Demo:** https://fefeliperoar.github.io/dos-realidades/
**Repo:** https://github.com/fefeliperoar/dos-realidades

## De qué se trata

Hay dos sistemas corriendo al mismo tiempo, con la misma cámara. Ninguno de los dos muestra la imagen de la cámara tal cual — cada uno se queda solo con el dato que le importa y lo dibuja a su manera. Por eso terminan pareciendo dos cosas distintas aunque estén mirando lo mismo.

**Sistema A — Visión Corporal.** Usa MediaPipe para encontrar los puntos del cuerpo de la persona (hombros, codos, caderas, rodillas, etc.) en cada frame. En vez de mostrar esos puntos tal cual, se dibujan conectados por líneas curvas que se mueven levemente solas, como si fueran un tejido vivo en lugar de un esqueleto rígido. Cada zona del cuerpo (cabeza, torso, brazos, piernas) tiene su propio color, y los puntos se ven más grandes o más chicos según qué tan segura está la detección y qué tan cerca está esa parte del cuerpo de la cámara. Si no hay nadie en cuadro, en el centro aparecen unos anillos suaves pulsando, como si el sistema estuviera "buscando" un cuerpo.

**Sistema B — Movimiento.** Este no reconoce cuerpos ni nada en particular: solo compara cada frame con el anterior y se fija dónde cambió el brillo de la imagen. Donde detecta un cambio, nacen partículas — mientras más brusco fue el cambio, más partículas aparecen, más rápido se mueven y más grandes son. El color también cuenta algo: los cambios suaves se ven en tonos azules/violetas y los cambios bruscos en tonos naranjos. Las partículas se van apagando solas con el tiempo y dejan una especie de estela, en vez de desaparecer de golpe.

## Cómo probarlo

El `index.html` no se puede abrir directo con doble clic porque el script usa módulos de JS. Hay que levantar un servidor local desde la carpeta, por ejemplo:

```
python3 -m http.server 8000
```

y entrar a `http://localhost:8000`. Va a pedir permiso de cámara — hay que aceptarlo y apretar el botón "Cámara".

## Reflexión

Frente a la cámara ocurre una sola escena, pero cada sistema encuentra algo distinto en ella. Uno reconoce un cuerpo a través de puntos y relaciones; el otro simplemente observa dónde algo cambia. Ninguno está equivocado, pero ninguno puede verlo todo.

Merleau-Ponty planteaba que nuestra percepción está ligada a las posibilidades y límites de nuestro cuerpo. Con las máquinas ocurre algo parecido: aquello que pueden percibir depende de cómo fueron construidas y de qué les enseñamos a buscar.

Kosuth, por otro lado, nos permite recordar que una representación nunca es aquello que representa. Los puntos, las líneas y las huellas de movimiento hablan de una persona, pero no son esa persona.

Tal vez lo interesante de construir una máquina que observa no sea preguntarnos cuánto puede ver, sino comenzar a reconocer todo aquello que, inevitablemente, deja fuera.

## Tecnologías

MediaPipe Pose Landmarker (cargado desde CDN) y Canvas 2D con JavaScript puro, sin frameworks ni build.

---
Felipe · Ejercicio 02 — Dos realidades · DPPI 2026
