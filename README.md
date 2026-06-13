<p align="center" style="display: flex; justify-content: center;">
<img src="./docs/static/img/yozakura_logo_horizontal.svg" width="420" />
</p>

Yozakura is an AI-powered social simulation engine.

IN PROGRESS: Currently writing documentation, doing final testing and bugfixes before calling this release ready. If you want to poke around before then, feel free, but be aware that this is not officially "released" as of now.

## Installation

If you want to use Yozakura, head to the [getting started guide](https://mistval.github.io/yozakura/docs/getting-started) for download and installation instructions.

The rest of this document is mainly for developers interested in setting up a dev environment for contributing to or modifying Yozakura, although you can also clone the repo just to run Yozakura for your own use if you prefer that over the electron app and Docker.

## Development

### Requirements

- [Node.js v24](https://nodejs.org/) (see [.nvmrc](.nvmrc) for the exact recommended version)

Yozakura is split into two workspaces, each with its own dependencies. Run npm install in both:

```bash
npm install --prefix client
npm install --prefix server
```

### Running in development

From the root folder, start both the client and the server together:

```bash
npm run dev
```

This runs the server and the client concurrently with hot reloading.

That should be all you need to do to get it running. Navigate to [http://localhost:5173/](http://localhost:5173/) in your browser to see the app.

### Debugging in VS Code

To debug both the server and the client from within VS Code, the repo ships two VS Code launch configurations in [.vscode/launch.json](.vscode/launch.json):

1. **Start the server in debug mode** — run the **Debug Server** launch configuration. This starts the server with the Node debugger attached.
2. **Start the client** — run the client with `npm run dev --prefix client`.
3. **Attach to the client** — run the **Debug Client** launch configuration, which opens Chrome against the running client and attaches the debugger.

## Prod mode

Instead of running the `npm run dev` commands, you can run `npm run build:web && npm run start --prefix server` and go to http://localhost:3001/ in your browser. This will serve the minified app bundle without any of the dev tooling, which will be faster. If cloning the repo is your preferred way to run the application as a user, this is probably how you should do it, although the dev build seems plenty fast so it might not really matter.
