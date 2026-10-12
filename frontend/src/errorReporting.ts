/**
 * The one place unexpected errors go. It writes them to the console; an error
 * service would be called from here.
 */
export function reportUnexpectedError(error: unknown, context?: string) {
  console.error("Unexpected error:", error, context ?? "");
}

/**
 * Reports errors thrown outside React and promise rejections nobody handles.
 * Returns a function that stops listening.
 */
export function listenForUnhandledErrors() {
  const onError = (event: ErrorEvent) => {
    reportUnexpectedError(event.error ?? event.message, "uncaught error");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportUnexpectedError(event.reason, "unhandled promise rejection");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
