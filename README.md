# Portal_Web_2026-II

Recreación **académica** de la mecánica de "portales" en 3D, jugable en el
navegador (Three.js + Rapier + Vite + TypeScript). Proyecto del curso de
Cómputo Visual (2026-II).

## Cómo ejecutar

Requisitos: Node.js 20.19+ (o 22.12+).

```bash
npm install        # instala las dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # typecheck + build de producción en dist/
npm run preview    # sirve el build localmente
npm run typecheck  # comprueba tipos (tsc --noEmit)
npm test           # corre las pruebas (vitest run)
```

Para compilar con la base de GitHub Pages: `BASE_PATH=/<repositorio>/ npm run build`.

## Despliegue

El sitio se publica automáticamente en **GitHub Pages** mediante el workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que se
dispara en `push` a `main` y manualmente (pestaña *Actions* → *Run
workflow*). El build usa `BASE_PATH=/<repositorio>/` de forma automática.

Configuración manual (una sola vez, desde el panel de GitHub):

1. **Settings → Pages → Source** → elegir **GitHub Actions**.
2. Esperar a que el primer despliegue termine.
3. La URL pública es `https://<usuario>.github.io/<repositorio>/`.

## Política de assets

Repositorio público: solo se usan assets **propios o CC0**. Ningún material de
Valve ni de otros terceros.

## Licencia

[AGPL-3.0](LICENSE)
