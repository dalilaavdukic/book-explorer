import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { logout, type User } from "../api/auth.ts";
import { changeSession, useAuth } from "../auth/session.ts";
import styles from "./Header.module.scss";
import { BookIcon, CloseIcon } from "./icons.tsx";

export default function Header() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <BookIcon className={styles.brandIcon} />
          Book Explorer
        </Link>
        {user !== null ? (
          <Account user={user} />
        ) : (
          // Hidden on the login page, which would otherwise return to itself.
          location.pathname !== "/login" && (
            <Link
              to="/login"
              state={{ from: location }}
              className={styles.button}
            >
              Log in
            </Link>
          )
        )}
      </div>
    </header>
  );
}

function Account({ user }: { user: User }) {
  const client = useQueryClient();
  const logOutRef = useRef<HTMLButtonElement>(null);
  const { mutate, reset, isPending, isError } = useMutation({
    mutationFn: logout,
    // Only once the server has ended the session (AC-A5).
    onSuccess: () => changeSession(client, null, { loggedOutHere: true }),
  });

  return (
    <div className={styles.account}>
      <span className={styles.username}>{user.username}</span>
      <button
        ref={logOutRef}
        type="button"
        className={styles.button}
        onClick={() => mutate()}
        disabled={isPending}
      >
        Log out
      </button>
      {isError && (
        <div className={styles.error}>
          <p role="alert">Couldn't log out. Please try again.</p>
          <button
            type="button"
            aria-label="Dismiss"
            className={styles.dismiss}
            onClick={() => {
              reset();
              // This button goes away with the message.
              logOutRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
