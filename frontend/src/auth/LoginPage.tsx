import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, type To, useLocation } from "react-router-dom";
import { login } from "../api/auth.ts";
import { ApiError } from "../api/client.ts";
import styles from "./LoginPage.module.scss";
import { changeSession, useAuth } from "./session.ts";

export default function LoginPage() {
  const { user } = useAuth();
  const state: unknown = useLocation().state;
  // Fixed when the page opens: only a login made here returns to where the
  // reader came from. Opened while logged in, it goes to the catalog (AC-A6).
  const [target] = useState(() =>
    user === null ? returnTarget(state) : { to: "/" },
  );

  if (user !== null) {
    return <Navigate to={target.to} state={target.state} replace />;
  }
  return <LoginForm />;
}

function LoginForm() {
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { mutate, isPending, error } = useMutation({
    mutationFn: login,
    // The page redirects once the session has a reader.
    onSuccess: (session) => changeSession(client, session.user),
  });

  const canSubmit = username.trim() !== "" && password !== "" && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) {
      mutate({ username, password });
    }
  }

  return (
    <section className={styles.login}>
      <h1>Log in</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          Username
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error instanceof ApiError && error.status === 400
              ? "Invalid username or password."
              : "Couldn't log in. Please try again."}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          Log in
        </button>
      </form>
    </section>
  );
}

interface ReturnTarget {
  to: To;
  state?: unknown;
}

// "Log in" links pass the current location as router state, which another site
// can't set, so this can never redirect off the app (arch §8.6). The location's
// own state goes with it, so "Back to books" still works there.
function returnTarget(state: unknown): ReturnTarget {
  const from: unknown =
    typeof state === "object" && state !== null && "from" in state
      ? state.from
      : undefined;
  if (
    typeof from === "object" &&
    from !== null &&
    "pathname" in from &&
    "search" in from &&
    "hash" in from &&
    typeof from.pathname === "string" &&
    from.pathname.startsWith("/") &&
    typeof from.search === "string" &&
    typeof from.hash === "string"
  ) {
    return {
      to: { pathname: from.pathname, search: from.search, hash: from.hash },
      state: "state" in from ? from.state : undefined,
    };
  }
  return { to: "/" };
}
