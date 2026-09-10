# Keep the Main Thread Free with Web Workers

Slides and demos for my KCDC 2026 talk, **Keep the Main Thread Free with Web Workers**.

This talk starts with a familiar web app problem: useful JavaScript work can still get in the way of the user experience. The demos build from a tiny main-thread blocking example to a realistic map app where expensive analysis work is moved into a Web Worker.

## Talk theme

Useful work can still be in the wrong place.

The main thread owns the user experience: clicks, rendering, UI updates, and interaction. Web Workers give CPU-heavy data work somewhere else to run when that work does not need direct access to the DOM.

## THREAD checklist

The talk follows the **THREAD** checklist:

- **T**rigger the stutter
- **H**unt the blocker
- **R**elocate the work
- **E**stablish the protocol
- **A**dd guardrails
- **D**ecide when the pattern belongs

## Repository contents

- `slides.pdf` - PowerPoint [slide deck](https://github.com/cyatteau/kcdc2026-web-workers/blob/main/slides.pdf) for the talk
- `demo-01/` - Trigger the stutter
- `demo-02/` - Move the work
- `demo-03/` - Protocol, progress, and cancellation
- `demo-04/` - Debounced filter worker
- `demo-05/` - Seattle Parks Priority Explorer
- `README.md` - This file

## Demos

| Demo | Focus | What it shows |
|---|---|---|
| Demo 1 | Trigger the stutter | A synchronous JavaScript task blocks input, animation, and repainting. |
| Demo 2 | Move the work | The same kind of expensive work runs on the main thread first, then in a Web Worker. |
| Demo 3 | Protocol, progress, cancellation | The page and worker communicate with request IDs, progress messages, cancellation, and stale-message handling. |
| Demo 4 | Debounced filter worker | A search/filter UI uses debounce and stale-result handling to avoid spamming the worker. |
| Demo 5 | Seattle Parks Priority Explorer | The full pattern inside a map app using ArcGIS Maps SDK for JavaScript. |

## Running the demos

These demos are plain front-end demos. Run them from a local web server, not by opening the HTML files directly from the file system.

From the root of the repo:

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

You can also use a Node-based static server:

```bash
npx serve .
```

## Demo 5 API key setup

Demo 5 uses ArcGIS services for the map portion.

Before running Demo 5, create a local `config.js` file with your ArcGIS API key:

```js
window.ARCGIS_API_KEY = "YOUR_API_KEY_HERE";
```

If the repo includes a `config.example.js` file, copy it first:

```bash
cp config.example.js config.js
```

Do not commit your real API key. Keep it restricted to the domains or localhost origins you actually use.

## Key idea

A worker does not replace the UI. It protects it.

Use workers when the work is CPU-heavy, can be passed as plain data, and the interface needs to stay responsive while that work runs.

Workers are probably overkill for tiny calculations, DOM work, or normal async calls that are already not blocking the page.

## Resources

- [Web Workers API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Using Web Workers - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/latest/)
- [ArcGIS API key authentication](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/)

## About

Created for **KCDC 2026** by Courtney Yatteau.

- GitHub: [@cyatteau](https://github.com/cyatteau)
- YouTube / X / dev.to: `@c_yatteau`
