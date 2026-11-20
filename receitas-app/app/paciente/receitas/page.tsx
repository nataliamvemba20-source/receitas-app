"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Receita = {
  id: string;
  code: string;
  status: string;
  issued_at: string;
  valid_until: string;
};

export default function MinhasReceitas() {
  const router = useRouter();
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const { data } = await createClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          router.push("/login");
          return;
        }
        const resp = await fetch("/api/paciente/minhas-receitas", {
          headers: { Authorization: "Bearer " + token },
        });
        const dados = await resp.json();
        if (!resp.ok) setErro(dados.erro ?? "Erro ao carregar.");
        else setReceitas(dados.receitas);
      } catch {
        setErro("Não foi possível ligar ao servidor.");
      } finally {
        setACarregar(false);
      }
    }
    carregar();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">As minhas receitas</h1>

      {aCarregar && <p>A carregar...</p>}
      {erro && <p className="text-red-600">{erro}</p>}
      {!aCarregar && !erro && receitas.length === 0 && (
        <p className="text-gray-600">Ainda não tens receitas na conta.</p>
      )}

      <div className="space-y-2">
        {receitas.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow p-4">
            <p className="font-bold">{r.code}</p>
            <p>Emitida em {r.issued_at}</p>
            <p>Válida até {r.valid_until}</p>
            <p>Estado: {r.status}</p>
            <a href={"/paciente/receitas/ver?id=" + r.id} className="inline-block mt-2 bg-green-600 text-white rounded px-4 py-2 font-semibold">Ver farmácias</a>
          </div>
        ))}
      </div>

      <a href="/paciente/juntar" className="block text-green-700 underline">
        Juntar outra receita
      </a>
      <a href="/painel" className="block text-gray-600 underline">
        Voltar ao painel
      </a>
    </main>
  );
}
