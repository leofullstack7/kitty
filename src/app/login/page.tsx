import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-serif text-3xl">Abriendo la casa…</div>}>
      <LoginForm />
    </Suspense>
  );
}
