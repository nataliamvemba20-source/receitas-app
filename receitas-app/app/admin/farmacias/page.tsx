"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Farmacia = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  license_number: string | null;
  verified: boolean;
};

export default function AdminFarmacias() {
  const router = useRouter();
  const [farmacias, setFarmacias] = useState<Farmacia[]>([]);
  const [nome, setNome] = useState("");
  const [morada, setMorada] = useState("");
  const [coords, setCoords] = useState("");
  const [alvara, setAlvara] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [autorizado, setAutorizado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient()
      .from("pharmacies")
      .select("id, name, address, latitude, longitude, license_number, verified")
      .order("name");
    if (error) setMensagem(error.message);
    else setFarmacias(data as Farmacia[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function verificar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (data?.role !== "admin") {
        router.push("/painel");
        return;
      }
      setAutorizado(true);
      carregar();
    }
    verificar();
  }, [router, carregar]);

  async function registar(e: React.FormEvent) {
    e.preventDefault();
    setMensagem("");
    const partes = coords.split(",").map((p) => parseFloat(p.trim()));
    if (partes.length !== 2 || partes.some((n) => Number.isNaN(n))) {
      setMensagem(
        "Coordenadas inválidas. Cola como no Google Maps, por exemplo: -8.8147, 13.2302"
      );
      return;
    }
    const { error } = await createClient().from("pharmacies").insert({
      name: nome,
      address: morada,
      latitude: partes[0],
      longitude: partes[1],
      license_number: alvara,
      verified: false,
    });
    if (error) {
      setMensagem(error.message);
      return;
    }
    setNome("");
    setMorada("");
    setCoords("");
    setAlvara("");
    carregar();
  }

  async function alternar(f: Farmacia) {
    const { error } = await createClient()
      .from("pharmacies")
      .update({ verified: !f.verified })
      .eq("id", f.id);
    if (error) setMensagem(error.message);
    else carregar();
  }

  if (!autorizado) return <p className="p-6">A carregar...</p>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Farmácias</h1>

      <form onSubmit={registar} className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Registar farmácia</h2>
        <input
          className="w-full border rounded p-2"
          placeholder="Nome da farmácia"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Morada"
          value={morada}
          onChange={(e) => setMorada(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Coordenadas do Google Maps (ex.: -8.8147, 13.2302)"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Número do alvará"
          value={alvara}
          onChange={(e) => setAlvara(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full bg-green-600 text-white rounded p-2 font-semibold"
        >
          Registar
        </button>
        {mensagem && <p className="text-sm text-red-600">{mensagem}</p>}
      </form>

      <div className="space-y-2">
        {farmacias.map((f) => (
          <div
            key={f.id}
            className="bg-white rounded-xl shadow p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{f.name}</p>
              <p className="text-xs text-gray-600">{f.address}</p>
              <p className="text-xs text-gray-600">
                Alvará: {f.license_number ?? "sem número"}
              </p>
            </div>
            <button
              onClick={() => alternar(f)}
              className={
                f.verified
                  ? "text-xs bg-green-100 text-green-800 rounded px-3 py-2"
                  : "text-xs bg-amber-100 text-amber-800 rounded px-3 py-2"
              }
            >
              {f.verified ? "Verificada" : "Por verificar"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}