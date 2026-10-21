# Portal_Web_2026-II

Recreación **académica** de la mecánica de portales (enlazados en pares, conservación de
momento, cubos, botones y puertas) en 3D, jugable en el navegador. Proyecto del curso de
Cómputo Visual (2026-II).

## Stack

| Función | Herramienta |
|---|---|
| Render 3D | [Three.js](https://threejs.org/) |
| Física | [Rapier](https://rapier.rs/) — `@dimforge/rapier3d-compat` (WASM) |
| Build | [Vite](https://vite.dev/) |
| Controles FPS | Pointer Lock API (nativa) |
| Despliegue | GitHub Pages (sitio 100 % estático) |

## Ejecución local

Requisitos: Node.js 20.19+ (o 22.12+).

```bash
npm install        # instala las dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # build de producción en dist/
npm run preview    # sirve el build localmente
```

## Despliegue

Cada `push` a `main` compila y publica `dist/` en GitHub Pages automáticamente
(workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). URL pública:

https://shryhakakizuki.github.io/Portal_Web_2026-II/

## Navegadores

Soportado: Chrome, Firefox y Edge de escritorio (requiere WebGL y Pointer Lock).
No hay soporte para navegadores móviles.

## Documentación

- [Plan del proyecto y arquitectura](docs/plan-mvp.md): stack, arquitectura en capas,
  sistema de portales, definición del MVP y plan de tareas por fases con criterios de
  aceptación.

## Licencia

[AGPL-3.0](LICENSE)
