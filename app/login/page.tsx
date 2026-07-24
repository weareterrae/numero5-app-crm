"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Simbolo } from "@/components/marca/Simbolo";

type Modo = "password" | "link";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  function traduzir(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes("rate limit"))
      return "Limite de emails do Supabase atingido. Entra com password, ou espera uns minutos.";
    if (m.includes("invalid login credentials")) return "Email ou password errados.";
    if (m.includes("email logins are disabled"))
      return "O provider de Email está desligado no Supabase.";
    if (m.includes("signups not allowed"))
      return "A criação de contas está desligada. Cria o utilizador no painel do Supabase.";
    if (m.includes("email not confirmed"))
      return "Falta confirmar o email. No painel do Supabase, marca o utilizador como confirmado.";
    return msg;
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const supabase = criarClienteBrowser();

    if (modo === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setOcupado(false);
      if (error) return setErro(traduzir(error.message));
      router.push("/");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setOcupado(false);
    if (error) return setErro(traduzir(error.message));
    setEnviado(true);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm text-center">
        <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Nº 5</h1>
        <p className="mt-1 mb-8 text-sm text-grey">
          O departamento de marketing das marcas que não têm um.
        </p>

        {enviado ? (
          <div className="rounded-xl border border-line bg-white p-6">
            <p className="mb-1 font-bold">Está no teu email. 🖐️</p>
            <p className="text-sm text-grey">
              Mandámos um link para <b>{email}</b>. Abre-o neste dispositivo.
            </p>
          </div>
        ) : (
          <form onSubmit={submeter} className="text-left">
            <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-grey">
              O teu email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@numerocinco.pt"
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold"
            />

            {modo === "password" && (
              <>
                <label htmlFor="password" className="mt-3 mb-1.5 block text-xs font-bold text-grey">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold"
                />
              </>
            )}

            <button
              type="submit"
              disabled={ocupado}
              className="mt-4 w-full rounded-full bg-gold px-6 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
            >
              {ocupado ? "Um momento…" : "Entrar 🖐️"}
            </button>

            {erro && <p className="mt-3 text-sm text-bad">{erro}</p>}

            <button
              type="button"
              onClick={() => {
                setModo(modo === "password" ? "link" : "password");
                setErro("");
              }}
              className="mt-4 w-full text-xs font-bold text-gold-dark underline"
            >
              {modo === "password"
                ? "Prefiro receber um link por email"
                : "Prefiro entrar com password"}
            </button>

            <p className="mt-3 text-xs text-soft">
              {modo === "password"
                ? "A password é definida no painel do Supabase."
                : "O email interno do Supabase tem limite de envios."}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
