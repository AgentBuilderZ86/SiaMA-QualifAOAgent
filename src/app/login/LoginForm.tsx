"use client";

import Image from "next/image";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginForm() {
  const initialState: LoginState = { error: "" };
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction}>
      <div className="brand-mark">
        <Image src="/brand/sia-mark.svg" alt="Sia" width={64} height={22} priority />
        <span>SiaGPT · AO Agent</span>
      </div>
      <div>
        <h1>Connexion</h1>
        <p className="muted">Accès sécurisé au pipeline d'appels d'offres.</p>
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

      <button className="btn btn--accent" disabled={pending} type="submit">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
