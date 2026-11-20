"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Dados = {
  estado: string;
  total: number;
  receita: string;
  paciente: string;
  itens: { nome: string; quantidade: number; precoUnit: number }[];
};

export default function Levantar() {
  const router = useRouter();
  const [qr, setQr] = useState("");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [aTrabalhar, setATrabalhar] = useState(false);

  async function enviar(confirmar: boolean) {
    setErro("");
    setSucesso("");
    setATrabalhar(true);
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }
      const resp = await fetch("/api/farmacia/levantar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ qr, confirmar }),
      });
      const r = await resp.json();
      if (!resp.ok) {
        setErro(r.erro ?? "Erro.");
        if (!confirmar) setDados(null);
      } else if (confirmar) {
        setSucesso(r.mensagem);
        setDados(null);
        setQr("");
      } else {
        setDados(r.pedido);
      }
    } catch {
      setErro("Não foi possível ligar ao servidor.");
    } finally {
      setATrabalhar(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Levantamento de pedido</h1>
      <p className="text-gray-600">Escreve ou cola o código do QR do paciente.</p>

      <input
        value={qr}
        onChange={(e) => setQr(e.target.value)}
        placeholder="Código do pedido"
        className="w-full border rounded p-3 bg-white"
      />
      <button
        onClick={() => enviar(false)}
        disabled={aTrabalhar || !qr.trim()}
        className="bg-green-600 text-white rounded px-4 py-3 font-semibold disabled:opacity-50"
      >
        {aTrabalhar ? "A verificar..." : "Verificar"}
      </button>

      {erro && <p className="text-red-600 font-semibold">{erro}</p>}
      {sucesso && <p className="text-green-700 font-semibold">{sucesso}</p>}

      {dados && (
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <p className="text-green-700 font-semibold">Assinatura do médico válida.</p>
          <p>Receita {dados.receita} — {dados.paciente}</p>
          <ul className="text-sm text-gray-700 space-y-1">
            {dados.itens.map((i) => (
              <li key={i.nome} className="flex justify-between gap-2">
                <span>{i.nome} x{i.quantidade}</span>
                <span>{(i.precoUnit * i.quantidade).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="font-bold">Total: {dados.total.toFixed(2)}</p>
          <button
            onClick={() => enviar(true)}
            disabled={aTrabalhar}
            className="bg-gray-800 text-white rounded px-4 py-3 font-semibold disabled:opacity-50"
          >
            Confirmar entrega
          </button>
        </div>
      )}

      <a href="/painel" className="block text-gray-600 underline">
        Voltar ao painel
      </a>
    </main>
  );
}