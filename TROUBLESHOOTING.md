# Troubleshooting

## The simulator does not start

Make sure dependencies are installed:

```bash
npm install
```

Then start the development server:

```bash
npm run dev
```

If Vite starts on a different local port, use the URL shown in the terminal.

## There is no engine sound

Most browsers require a user interaction before Web Audio can start. Click the simulator page and then use the ignition and starter controls.

Check that:

- the engine ignition is on with `R`
- the starter is held with `E`
- the browser tab is not muted
- the browser has permission to play audio

## The engine does not rev

Try the controls in this order:

1. Turn ignition on with `R`.
2. Hold `E` to crank the engine.
3. Hold `Space` for throttle.
4. Use `Arrow Up` and `Arrow Down` to change gears.
5. Hold `C` when using the clutch.

## The build fails

Run:

```bash
npm run build
```

The build runs TypeScript checking before the Vite production build. Read the first TypeScript error in the terminal; later errors can be a consequence of the same problem.

## The controls stop responding

The simulator clears held keyboard state when the browser window loses focus. Click the page again and press the desired key.

If the issue persists, reload the page and check the browser console for errors.
