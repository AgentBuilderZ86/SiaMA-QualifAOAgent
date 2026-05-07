"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginForm() {
  const initialState: LoginState = { error: "" };
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="card">
      <div>
        <p className="eyebrow">SiaMA Qualif AO</p>
        <h1>Connexion</h1>
        <p className="muted">Accès sécurisé au dashboard des appels d'offres.</p>
      </div>

      {state.error ? <div className="alert">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <button className="button" disabled={pending} type="submit">
        {pending ? "Connexion..." : "Se connecter"}
      </button>
    </form>
  );
}
