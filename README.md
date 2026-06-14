<p align="center" style="display: flex; justify-content: center;">
<img src="./docs/static/img/yozakura_logo_horizontal.svg" width="420" />
</p>

Yozakura is an AI-powered social simulation in which characters (including the user) move around a map, interact with each other via the user's LLM of choice, and form memories and intentions towards each other, creating a dynamically evolving narrative with up to dozens or even hundreds of characters.

## Installation

If you want to use Yozakura, head to the [getting started guide](https://mistval.github.io/yozakura/docs/getting-started) for download and installation instructions for the Electron app or Docker image.

If you want to contribute, tinker, or you just prefer the `git clone` installation method, continue reading below.

## Requirements

- [Node.js v24](https://nodejs.org/) (see [.nvmrc](.nvmrc) for the exact recommended version)
- [Git](https://git-scm.com/)

## Quick Start

If you want to run a production build and use the application, run these commands after installing Node.js and Git:

```sh
git clone https://github.com/mistval/yozakura.git
cd yozakura
git checkout main
npm install --prefix client
npm install --prefix server
npm run build:web
npm run start --prefix server
```

Then go to http://localhost:3001/ in your browser.

## Dev Setup

If you want to run Yozakura in dev mode, then after cloning, run:

```sh
npm install --prefix client
npm install --prefix server
npm run dev
```

This runs the server and the client concurrently with hot reloading.

That should be all you need to do to get it running. Navigate to [http://localhost:5173/](http://localhost:5173/) in your browser to see the app.

## Debugging in VS Code

To debug both the server and the client from within VS Code, the repo ships two VS Code launch configurations in [.vscode/launch.json](.vscode/launch.json):

1. **Start the server in debug mode** — run the **Debug Server** launch configuration. This starts the server with the Node debugger attached.
2. **Start the client** — run the client with `npm run dev --prefix client`.
3. **Attach to the client** — run the **Debug Client** launch configuration, which opens Chrome against the running client and attaches the debugger.

## Bugs and Feature Requests

Please submit features requests to [Discussions](https://github.com/mistval/yozakura/discussions) and bug reports to [Issues](https://github.com/mistval/yozakura/issues).

You can also join [my Discord](https://discord.com/invite/S92qCjbNHt) for either purpose or others.
