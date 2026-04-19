import { createRoot } from "react-dom/client";
import { initSentry, Sentry, isSentryEnabled } from "./lib/sentry";
import App from "./App";
import "./index.css";

// Init Sentry before any component mounts so render-time exceptions are
// caught. Safe to call with no DSN — becomes a noop.
initSentry();

const root = createRoot(document.getElementById("root")!);

if (isSentryEnabled()) {
  // Wrap the app tree so any uncaught render exception is reported to
  // Sentry and swapped for a minimal fallback UI instead of a blank page.
  root.render(
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div className="p-8 max-w-lg mx-auto text-center">
          <h1 className="text-xl font-semibold mb-2">Something broke.</h1>
          <p className="text-sm text-muted-foreground mb-4">
            We've been notified. Try reloading — if it keeps happening, tell us
            what you were doing.
          </p>
          <button
            className="underline text-sm"
            onClick={() => {
              resetError();
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  );
} else {
  // Sentry disabled — skip the boundary wrapper entirely so a bad env
  // config doesn't swap the real UI for a fallback in dev.
  root.render(<App />);
}
