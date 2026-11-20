"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase";

export default function JuntarReceita() {
  const [codigo, setCodigo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);

  async function juntar() {
    setMensagem("");
    setSucesso(false);
    setAEnviar(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMensagem("Sem sessão. Entra outra vez em /login.");
        return;
      }
      const resposta = await fetch("/api/paciente/juntar-receita", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ code: codigo }),
      });
      const resultado = await resposta.json();
      if (resposta.ok && resultado.ok) {
        setSucesso(true);
        setMensagem(resultado.mensagem);
        setCodigo("");
      } else {
        setMensagem(resultado.erro ?? "Ocorreu um erro. Tenta outra vez.");
      }
    } catch {
      setMensagem("Não foi possível ligar ao servidor.");
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Juntar receita</h1>
      <p className="text-gray-600">
        Escreve o código que o médico te deu (por exemplo RX-123456).
      </p>

      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="RX-000000"
        className="w-full border rounded p-3 bg-white"
      />

      <button
        onClick={juntar}
        disabled={aEnviar || !codigo.trim()}
        className="bg-green-600 text-white rounded px-4 py-3 font-semibold disabled:opacity-50"
      >
        {aEnviar ? "A juntar..." : "Juntar receita"}
      </button>

      {mensagem && (
        <p className={sucesso ? "text-green-700" : "text-red-600"}>{mensagem}</p>
      )}

      <a href="/painel" className="block text-gray-600 underline">
        Voltar ao painel
      </a>
    </main>
  );
}
