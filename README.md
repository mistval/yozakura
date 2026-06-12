<p align="center" style="display: flex; justify-content: center;">
<img src="./docs/static/img/yozakura_logo_horizontal.svg" width="420" />
</p>

Yozakura is an AI-powered social simulation engine.

IN PROGRESS: Currently writing documentation, doing final testing and bugfixes before calling this release ready. If you want to poke around before then, feel free, but be aware that this is not officially "released" as of now.

## Installation

If you just want to **use** Yozakura, head to the [getting started guide](https://mistval.github.io/yozakura/docs/getting-started) for download and installation instructions.

The rest of this document is for developers interested in contributing to or modifying Yozakura.

## Development

### Requirements

- [Node.js v24](https://nodejs.org/) (see [.nvmrc](.nvmrc) for the exact recommended version)

Yozakura is split into two workspaces, each with its own dependencies. Install them both before doing anything else:

```bash
npm install --prefix client
npm install --prefix server
```

### Running in development

From the root folder, start both the client and the server together:

```bash
npm run dev
```

This runs the server (`tsx watch`) and the client (Vite, served at [http://localhost:5173](http://localhost:5173)) concurrently.

### Debugging in VS Code

To debug both the server and the client from within VS Code, the repo ships two VS Code launch configurations in [.vscode/launch.json](.vscode/launch.json):

1. **Start the server in debug mode** — run the **Debug Server** launch configuration. This starts the server with the Node debugger attached.
2. **Start the client** — run the client with `npm run dev --prefix client`) so Vite serves it at [http://localhost:5173](http://localhost:5173).
3. **Attach to the client** — run the **Debug Client** launch configuration, which opens Chrome against the running client and attaches the debugger so you can set breakpoints in the client code too.
