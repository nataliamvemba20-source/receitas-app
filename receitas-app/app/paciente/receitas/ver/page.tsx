"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../../lib/supabase";

type Farmacia = {
  id: string;
  nome: string;
  morada: string | null;
  total: number;
  tem: { nome: string; quantidade: number; subtotal: number }[];
  falta: { nome: string; quantidade: number }[];
  temTudo: boolean;
  distanciaKm: number | null;
  perto: boolean | null;
  comoChegar: string;
};

function Conteudo() {
  const router = useRouter();
  const params = useSearchParams();
  const receitaId = params.get("id");
  const [farmacias, setFarmacias] = useState<Farmacia[]>([]);
  const [codigo, setCodigo] = useState("");
  const [raio, setRaio] = useState(5);
  const [semNenhum, setSemNenhum] = useState(0);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    async function pedir(lat: number | null, lon: number | null) {
      try {
        const { data } = await createClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          router.push("/login");
          return;
        }
        const resp = await fetch("/api/paciente/farmacias-receita", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ prescription_id: receitaId, latitude: lat, longitude: lon }),
        });
        const dados = await resp.json();
        if (!resp.ok) setErro(dados.erro ?? "Erro ao carregar.");
        else {
          setFarmacias(dados.farmacias);
          setCodigo(dados.receita.code);
          setRaio(dados.raioPertoKm);
          setSemNenhum(dados.semNenhum);
        }
      } catch {
        setErro("Não foi possível ligar ao servidor.");
      } finally {
        setACarregar(false);
      }
    }

    if (!receitaId) {
      setErro("Receita em falta.");
      setACarregar(false);
      return;
    }
    if (!navigator.geolocation) {
      setAviso("O teu navegador não dá a localização. Não consigo calcular distâncias.");
      pedir(null, null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pedir(pos.coords.latitude, pos.coords.longitude),
      () => {
        setAviso("Não deste acesso à localização, por isso não mostro as distâncias.");
        pedir(null, null);
      },
      { timeout: 10000 }
    );
  }, [receitaId, router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Farmácias para {codigo || "a receita"}</h1>

      {aCarregar && <p>A procurar farmácias...</p>}
      {aviso && <p className="text-amber-700">{aviso}</p>}
      {erro && <p className="text-red-600">{erro}</p>}
      {!aCarregar && !erro && farmacias.length === 0 && (
        <p className="text-gray-600">
          Nenhuma farmácia verificada tem estes medicamentos neste momento.
        </p>
      )}

      <div className="space-y-3">
        {farmacias.map((f) => (
          <div key={f.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <p className="font-bold">{f.nome}</p>
              <p className="font-bold text-green-700">{f.total.toFixed(2)}</p>
            </div>
            {f.morada && <p className="text-gray-600">{f.morada}</p>}

            {f.distanciaKm !== null && (
              <p className={f.perto ? "text-green-700" : "text-gray-600"}>
                {f.distanciaKm} km — {f.perto ? "perto (até " + raio + " km)" : "longe"}
              </p>
            )}

            <p className={f.temTudo ? "text-green-700 font-semibold" : "text-amber-700 font-semibold"}>
              {f.temTudo
                ? "Tem todos os medicamentos"
                : "Tem só parte dos medicamentos (o total é só do que tem)"}
            </p>

            <ul className="text-sm text-gray-700">{f.tem.map((t) => (<li key={t.nome}>{t.nome} x{t.quantidade} - {t.subtotal.toFixed(2)}</li>))}</ul>
            {f.falta.length > 0 && (
              <p className="text-red-600 text-sm">
                Em falta: {f.falta.map((x) => x.nome).join(", ")}
              </p>
            )}

            <a
              href={f.comoChegar}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-green-600 text-white rounded px-4 py-2 font-semibold"
            >
              Como chegar
            </a>
          </div>
        ))}
      </div>

      {semNenhum > 0 && (
        <p className="text-gray-500 text-sm">
          {semNenhum} farmácia(s) não têm nenhum destes medicamentos.
        </p>
      )}

      <a href="/paciente/receitas" className="block text-gray-600 underline">
        Voltar às minhas receitas
      </a>
    </main>
  );
}

export default function VerFarmacias() {
  return (
    <Suspense fallback={<p className="p-6">A carregar...</p>}>
      <Conteudo />
    </Suspense>
  );
}