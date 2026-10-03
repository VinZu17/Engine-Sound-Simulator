# Contributing to Engine Sound Simulator

Thanks for your interest in improving Engine Sound Simulator.

## Development setup

Requirements:

- Node.js 18 or newer
- npm

Clone the repository and install dependencies:

```bash
git clone https://github.com/VinZu17/Engine-Sound-Simulator.git
cd Engine-Sound-Simulator
npm install
```

Start the development server:

```bash
npm run dev
```

Build the project before submitting a change:

```bash
npm run build
```

## Making a change

1. Create a focused branch from `main`.
2. Keep changes small and related to one purpose.
3. Use clear commit messages.
4. Run `npm run build` to catch TypeScript or build errors.
5. Open a pull request against `main`.
6. Explain what changed, why it changed, and how it was tested.

## Pull request checklist

- [ ] The change has a focused purpose.
- [ ] `npm run build` passes.
- [ ] Existing behavior was checked where relevant.
- [ ] Documentation was updated when needed.
- [ ] The pull request description explains the change and testing.

## Project areas

- `src/core/` — vehicle physics and drivetrain logic
- `src/audio/` — engine sound synthesis and playback
- `src/render/` — Three.js engine rendering and gauges
- `src/input/` — keyboard input handling
- `src/ui/` — interface and interaction logic
- `src/config/` — engine preset configuration
- `docs/` — reference documentation for controls, engine presets, architecture, and development commands
- `TROUBLESHOOTING.md` — problem/solution reference for startup, audio, build, and input issues

For larger changes, keep the implementation aligned with the existing architecture and avoid unrelated refactors.
