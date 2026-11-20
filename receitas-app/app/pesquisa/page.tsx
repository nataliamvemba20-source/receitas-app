"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase";

type Linha = {
  price: number;
  quantity: number;
  medications: {
    id: string;
    name: string;
    strength: string | null;
    requires_prescription: boolean;
  };
  pharmacies: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
};

type Posicao = { lat: number; lon: number };

function distanciaKm(a: Posicao, lat: number, lon: number) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLon = rad(lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function Pesquisa() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pos, setPos] = useState<Posicao | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const espera = setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("pharmacy_stock")
        .select(
          "price, quantity, medications!inner(id, name, strength, requires_prescription), pharmacies!inner(id, name, address, latitude, longitude)"
        )
        .ilike("medications.name", `%${termo}%`)
        .gt("quantity", 0)
        .eq("pharmacies.verified", true)
        .limit(100);
      if (error) setErro(error.message);
      else {
        setErro("");
        setLinhas(data as unknown as Linha[]);
      }
    }, 300);
    return () => clearTimeout(espera);
  }, [termo, router]);

  function usarLocalizacao() {
    setAviso("");
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setAviso("Não foi possível obter a localização. Ordenado por preço.")
    );
  }

  async function comprar(l: Linha) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    const { data: pedido, error } = await supabase
      .from("orders")
      .insert({
        patient_id: user.id,
        pharmacy_id: l.pharmacies.id,
        status: "pago",
        total: Number(l.price),
        qr_token: crypto.randomUUID(),
      })
      .select("id")
      .single();
    if (error || !pedido) {
      setErro(error?.message ?? "Erro ao criar o pedido.");
      return;
    }
    const { error: erroItem } = await supabase.from("order_items").insert({
      order_id: pedido.id,
      medication_id: l.medications.id,
      quantity: 1,
      unit_price: Number(l.price),
    });
    if (erroItem) {
      setErro(erroItem.message);
      return;
    }
    router.push("/pedidos");
  }

  const grupos = new Map<string, Linha[]>();
  for (const l of linhas) {
    const lista = grupos.get(l.medications.id) ?? [];
    lista.push(l);
    grupos.set(l.medications.id, lista);
  }

  function dist(l: Linha) {
    if (!pos || l.pharmacies.latitude == null || l.pharmacies.longitude == null)
      return null;
    return distanciaKm(pos, l.pharmacies.latitude, l.pharmacies.longitude);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Procurar medicamento</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded p-2 bg-white"
          placeholder="Ex.: paracetamol"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
        <button
          onClick={usarLocalizacao}
          className="bg-green-600 text-white rounded px-3 text-sm"
        >
          {pos ? "Localização ativa" : "Perto de mim"}
        </button>
      </div>

      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!erro && linhas.length === 0 && (
        <p className="text-sm text-gray-600">Nenhum medicamento encontrado.</p>
      )}

      {Array.from(grupos.values()).map((grupo) => {
        const med = grupo[0].medications;
        const menor = Math.min(...grupo.map((l) => Number(l.price)));
        const ordenado = [...grupo].sort((a, b) => {
          const da = dist(a);
          const db = dist(b);
          if (da != null && db != null) return da - db;
          return Number(a.price) - Number(b.price);
        });
        return (
          <section key={med.id} className="bg-white rounded-xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {med.name} {med.strength}
              </h2>
              {med.requires_prescription && (
                <span className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-1">
                  Pede receita
                </span>
              )}
            </div>
            {ordenado.map((l) => {
              const d = dist(l);
              return (
                <div
                  key={l.pharmacies.id}
                  className="flex items-center justify-between border-t pt-2"
                >
                  <div>
                    <p className="text-sm font-medium">{l.pharmacies.name}</p>
                    <p className="text-xs text-gray-600">
                      {l.pharmacies.address}
                      {d != null && ` · ${d.toFixed(1)} km`}
                    </p>
                    {l.pharmacies.latitude != null &&
                      l.pharmacies.longitude != null && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${l.pharmacies.latitude},${l.pharmacies.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-green-700 underline"
                        >
                          Como chegar
                        </a>
                      )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {Number(l.price).toLocaleString("pt-PT")} Kz
                    </p>
                    {Number(l.price) === menor && grupo.length > 1 && (
                      <span className="text-xs text-green-700">Mais barato</span>
                    )}
                    {med.requires_prescription ? (
                      <p className="text-xs text-amber-700">Precisa de receita</p>
                    ) : (
                      <button
                        onClick={() => comprar(l)}
                        className="mt-1 text-xs bg-green-600 text-white rounded px-3 py-1"
                      >
                        Comprar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}