"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "registar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMensagem("");
    const supabase = createClient();

    if (modo === "registar") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nome } },
      });
      if (error) setMensagem(error.message);
      else if (data.session) router.push("/painel");
      else setMensagem("Conta criada. Confirma o teu email e depois entra.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMensagem(error.message);
      else router.push("/painel");
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </h1>

        {modo === "registar" && (
          <input
            className="w-full border rounded p-2"
            placeholder="Nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        )}
        <input
          className="w-full border rounded p-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          type="password"
          placeholder="Palavra-passe (mínimo 6 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white rounded p-2 font-semibold disabled:opacity-50"
        >
          {loading ? "A processar..." : modo === "entrar" ? "Entrar" : "Registar"}
        </button>

        {mensagem && <p className="text-sm text-red-600">{mensagem}</p>}

        <button
          type="button"
          className="w-full text-sm text-green-700 underline"
          onClick={() => setModo(modo === "entrar" ? "registar" : "entrar")}
        >
          {modo === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}