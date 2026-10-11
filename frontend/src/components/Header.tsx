import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { logout, type User } from "../api/auth.ts";
import { changeSession, useAuth } from "../auth/session.ts";
import styles from "./Header.module.scss";

export default function Header() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          Book Explorer
        </Link>
        {user !== null ? (
          <Account user={user} />
        ) : (
          // Hidden on the login page, which would otherwise return to itself.
          location.pathname !== "/login" && (
            <Link to="/login" state={{ from: location }}>
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
  const { mutate, isPending, isError } = useMutation({
    mutationFn: logout,
    // Only once the server has ended the session (AC-A5).
    onSuccess: () => changeSession(client, null, { loggedOutHere: true }),
  });

  return (
    <div className={styles.account}>
      <span className={styles.username}>{user.username}</span>
      <button type="button" onClick={() => mutate()} disabled={isPending}>
        Log out
      </button>
      {isError && (
        <p role="alert" className={styles.error}>
          Couldn't log out. Please try again.
        </p>
      )}
    </div>
  );
}
