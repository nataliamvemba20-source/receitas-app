"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Medicamento = { id: string; name: string; strength: string | null };
type Linha = {
  medication_id: string;
  price: number;
  quantity: number;
  medications: { name: string; strength: string | null };
};

function LinhaStock({
  l,
  onSalvar,
  onRemover,
}: {
  l: Linha;
  onSalvar: (id: string, preco: number, qtd: number) => void;
  onRemover: (id: string) => void;
}) {
  const [p, setP] = useState(String(l.price));
  const [q, setQ] = useState(String(l.quantity));
  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-2">
      <p className="font-medium">
        {l.medications.name} {l.medications.strength}
      </p>
      <div className="flex gap-2 items-center">
        <input
          className="w-28 border rounded p-2"
          type="number"
          min="0"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        <span className="text-sm text-gray-600">Kz</span>
        <input
          className="w-24 border rounded p-2"
          type="number"
          min="0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-sm text-gray-600">un.</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSalvar(l.medication_id, Number(p), parseInt(q) || 0)}
          className="text-sm bg-green-600 text-white rounded px-3 py-1"
        >
          Guardar
        </button>
        <button
          onClick={() => onRemover(l.medication_id)}
          className="text-sm bg-gray-200 rounded px-3 py-1"
        >
          Remover
        </button>
      </div>
    </div>
  );
}

export default function StockFarmacia() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [farmaciaId, setFarmaciaId] = useState("");
  const [farmaciaNome, setFarmaciaNome] = useState("");
  const [catalogo, setCatalogo] = useState<Medicamento[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [medId, setMedId] = useState("");
  const [preco, setPreco] = useState("");
  const [qtd, setQtd] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaDose, setNovaDose] = useState("");
  const [novoReceita, setNovoReceita] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async (id: string) => {
    const supabase = createClient();
    const cat = await supabase
      .from("medications")
      .select("id, name, strength")
      .order("name");
    const stock = await supabase
      .from("pharmacy_stock")
      .select("medication_id, price, quantity, medications(name, strength)")
      .eq("pharmacy_id", id);
    if (cat.error) setMensagem(cat.error.message);
    if (stock.error) setMensagem(stock.error.message);
    setCatalogo((cat.data ?? []) as Medicamento[]);
    const lista = (stock.data ?? []) as unknown as Linha[];
    lista.sort((a, b) => a.medications.name.localeCompare(b.medications.name));
    setLinhas(lista);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function iniciar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, pharmacy_id")
        .eq("id", user.id)
        .single();
      if (data?.role !== "farmacia" || !data.pharmacy_id) {
        router.push("/painel");
        return;
      }
      const f = await supabase
        .from("pharmacies")
        .select("name")
        .eq("id", data.pharmacy_id)
        .single();
      setFarmaciaId(data.pharmacy_id);
      setFarmaciaNome(f.data?.name ?? "");
      setAutorizado(true);
      carregar(data.pharmacy_id);
    }
    iniciar();
  }, [router, carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setMensagem("");
    const supabase = createClient();
    let id = medId;
    if (medId === "novo") {
      const { data, error } = await supabase
        .from("medications")
        .insert({
          name: novoNome,
          strength: novaDose,
          requires_prescription: novoReceita,
        })
        .select("id")
        .single();
      if (error || !data) {
        setMensagem(error?.message ?? "Erro ao criar o medicamento.");
        return;
      }
      id = data.id;
    }
    const { error } = await supabase.from("pharmacy_stock").upsert(
      {
        pharmacy_id: farmaciaId,
        medication_id: id,
        price: Number(preco),
        quantity: parseInt(qtd) || 0,
      },
      { onConflict: "pharmacy_id,medication_id" }
    );
    if (error) {
      setMensagem(error.message);
      return;
    }
    setMedId("");
    setPreco("");
    setQtd("");
    setNovoNome("");
    setNovaDose("");
    setNovoReceita(false);
    carregar(farmaciaId);
  }

  async function salvar(id: string, p: number, q: number) {
    const { data, error } = await createClient()
      .from("pharmacy_stock")
      .update({ price: p, quantity: q })
      .eq("pharmacy_id", farmaciaId)
      .eq("medication_id", id)
      .select();
    if (error) setMensagem(error.message);
    else if (!data || data.length === 0)
      setMensagem("A base de dados recusou a alteração (falta permissão de atualizar).");
    else {
      setMensagem("Guardado.");
      carregar(farmaciaId);
    }
  }

  async function remover(id: string) {
    const { error } = await createClient()
      .from("pharmacy_stock")
      .delete()
      .eq("pharmacy_id", farmaciaId)
      .eq("medication_id", id);
    if (error) setMensagem(error.message);
    else carregar(farmaciaId);
  }

  if (!autorizado) return <p className="p-6">A carregar...</p>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Stock e preços</h1>
      <p className="text-sm text-gray-600">{farmaciaNome}</p>

      <form onSubmit={adicionar} className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Adicionar ou atualizar medicamento</h2>
        <select
          className="w-full border rounded p-2"
          value={medId}
          onChange={(e) => setMedId(e.target.value)}
          required
        >
          <option value="">Escolhe o medicamento</option>
          {catalogo.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.strength}
            </option>
          ))}
          <option value="novo">+ Medicamento que não está na lista</option>
        </select>

        {medId === "novo" && (
          <div className="space-y-3 border rounded p-3">
            <input
              className="w-full border rounded p-2"
              placeholder="Nome (ex.: Cetirizina)"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              required
            />
            <input
              className="w-full border rounded p-2"
              placeholder="Dose (ex.: 10 mg)"
              value={novaDose}
              onChange={(e) => setNovaDose(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={novoReceita}
                onChange={(e) => setNovoReceita(e.target.checked)}
              />
              Só se vende com receita
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="flex-1 border rounded p-2"
            type="number"
            min="0"
            placeholder="Preço (Kz)"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            required
          />
          <input
            className="flex-1 border rounded p-2"
            type="number"
            min="0"
            placeholder="Quantidade"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-green-600 text-white rounded p-2 font-semibold"
        >
          Guardar
        </button>
        {mensagem && (
  <p
    className={
      mensagem === "Guardado."
        ? "text-sm text-green-700"
        : "text-sm text-red-600"
    }
  >
    {mensagem}
  </p>
)}
      </form>

      <div className="space-y-2">
        {linhas.length === 0 && (
          <p className="text-sm text-gray-600">Ainda não tens medicamentos no stock.</p>
        )}
        {linhas.map((l) => (
          <LinhaStock
            key={`${l.medication_id}-${l.price}-${l.quantity}`}
            l={l}
            onSalvar={salvar}
            onRemover={remover}
          />
        ))}
      </div>
    </main>
  );
}