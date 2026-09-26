# rincon-maldito

## Apocalipsis · La quinta trompeta

Una historieta dibujada a mano (Apocalipsis 9:1-12) que cobra vida en pixel art:
cada viñeta aparece animada, con su texto escrito como máquina de escribir, y al final
se muestra la historieta completa con todas las viñetas animadas y el dibujo original.

**Ver en línea:** https://claudiojara.github.io/rincon-maldito/

- `docs/index.html` y `docs/comic.js`: la página y la animación (canvas de 160×100, dibujado pixel por pixel, sin dependencias).
- `docs/assets/original.png`: el dibujo original.
- `.github/workflows/pages.yml`: publica `docs/` en la rama `gh-pages` en cada push.

Para verlo en local: `python3 -m http.server -d docs` y abrir http://localhost:8000.
