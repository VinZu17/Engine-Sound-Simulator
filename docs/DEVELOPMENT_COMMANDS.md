# Development Commands

This reference collects the npm commands used during local development and production builds.

## Install Dependencies

Run this once after cloning the repository or whenever dependencies change:

```bash
npm install
```

## Start the Development Server

Start Vite in development mode:

```bash
npm run dev
```

The terminal will print the local development URL. Open that URL in a browser to run the simulator.

## Build for Production

Create an optimized production build:

```bash
npm run build
```

Use this before publishing or deploying the application to catch build-time TypeScript and bundling issues.

## Preview a Production Build

After building, preview the generated production bundle locally:

```bash
npm run preview
```

This is useful for checking behavior that may differ from the Vite development server.

## Typical Workflow

```text
Clone repository
      ↓
npm install
      ↓
npm run dev
      ↓
Make changes
      ↓
npm run build
      ↓
npm run preview
```

## Troubleshooting

If a command is unavailable or dependencies appear inconsistent, remove the local dependency installation and reinstall:

```bash
rm -rf node_modules
npm install
```

On Windows PowerShell, the equivalent cleanup is:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

For runtime-specific problems, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).