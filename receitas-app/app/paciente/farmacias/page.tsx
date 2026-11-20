"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase";

type Farmacia = {
  id: string;
  nome: string;
  endereco: string;
  distancia_km: number;
  total: number;
  mais_barata: boolean;
};

export default function EncontrarFarmacia() {
  const [codigo, setCodigo] = useState("");
  const [farmacias, setFarmacias] = useState<Farmacia[] | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [aProcurar, setAProcurar] = useState(false);

  function procurar() {
    setMensagem("");
    setFarmacias(null);
    if (!navigator.geolocation) {
      setMensagem("Este telemóvel não permite obter a localização.");
      return;
    }
    setAProcurar(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) {
            setMensagem("Sem sessão. Entra outra vez em /login.");
            return;
          }
          const resposta = await fetch("/api/paciente/encontrar-farmacia", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              code: codigo,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const r = await resposta.json();
          if (!resposta.ok) {
            setMensagem(r.erro ?? "Ocorreu um erro. Tenta outra vez.");
          } else if (r.farmacias.length === 0) {
            setMensagem(r.mensagem ?? "Nenhuma farmácia encontrada.");
          } else {
            setFarmacias(r.farmacias);
          }
        } catch {
          setMensagem("Não foi possível ligar ao servidor.");
        } finally {
          setAProcurar(false);
        }
      },
      () => {
        setMensagem("Não deste permissão para usar a localização. Permite-a no navegador e tenta outra vez.");
        setAProcurar(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Encontrar farmácia</h1>
      <p className="text-gray-600">
        Escreve o código da receita e vamos procurar as farmácias perto de ti.
      </p>

      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="RX-000000"
        className="w-full border rounded p-3 bg-white"
      />

      <button
        onClick={procurar}
        disabled={aProcurar || !codigo.trim()}
        className="bg-green-600 text-white rounded px-4 py-3 font-semibold disabled:opacity-50"
      >
        {aProcurar ? "A procurar..." : "Encontrar farmácia"}
      </button>

      {mensagem && <p className="text-red-600">{mensagem}</p>}

      {farmacias && (
        <div className="space-y-2">
          {farmacias.map((f, i) => (
            <div key={f.id} className="bg-white rounded-xl shadow p-4 space-y-1">
              <p className="font-semibold">
                {f.nome}
                {i === 0 && (
                  <span className="ml-2 text-xs bg-green-100 text-green-800 rounded px-2 py-1">
                    Mais próxima
                  </span>
                )}
                {f.mais_barata && (
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 rounded px-2 py-1">
                    Mais barata
                  </span>
                )}
              </p>
              {f.endereco && <p className="text-gray-600 text-sm">{f.endereco}</p>}
              <p className="text-sm">A {f.distancia_km} km de ti</p>
              <p className="text-lg font-bold">Total: {f.total} Kz</p>
            </div>
          ))}
        </div>
      )}

      <a href="/painel" className="block text-gray-600 underline">
        Voltar ao painel
      </a>
    </main>
  );
}
