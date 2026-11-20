"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Item = {
  quantity: number;
  unit_price: number;
  medication_id: string;
  medications: { name: string; strength: string | null };
};
type Pedido = {
  id: string;
  status: string;
  total: number;
  qr_token: string | null;
  created_at: string;
  order_items: Item[];
};

export default function PedidosFarmacia() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [farmaciaId, setFarmaciaId] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [lido, setLido] = useState("");
  const [aLer, setALer] = useState(false);
  const leitor = useRef<{ stop: () => Promise<void> } | null>(null);

  const carregar = useCallback(async (id: string) => {
    const { data, error } = await createClient()
      .from("orders")
      .select(
        "id, status, total, qr_token, created_at, order_items(quantity, unit_price, medication_id, medications(name, strength))"
      )
      .eq("pharmacy_id", id)
      .in("status", ["pago", "aceite"])
      .order("created_at", { ascending: true });
    if (error) setMensagem(error.message);
    else setPedidos(data as unknown as Pedido[]);
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
      setFarmaciaId(data.pharmacy_id);
      setAutorizado(true);
      carregar(data.pharmacy_id);
    }
    iniciar();
    return () => {
      leitor.current?.stop().catch(() => {});
    };
  }, [router, carregar]);

  async function mudarEstado(id: string, estado: "aceite" | "cancelado") {
    const { data, error } = await createClient()
      .from("orders")
      .update({ status: estado })
      .eq("id", id)
      .select();
    if (error) setMensagem(error.message);
    else if (!data || data.length === 0)
      setMensagem("A base de dados recusou a alteração.");
    else {
      setMensagem("");
      carregar(farmaciaId);
    }
  }

  async function levantar(p: Pedido) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "levantado", picked_up_at: new Date().toISOString() })
      .eq("id", p.id)
      .select();
    if (error || !data || data.length === 0) {
      setMensagem(error?.message ?? "A base de dados recusou a alteração.");
      return;
    }
    for (const i of p.order_items) {
      const { data: s } = await supabase
        .from("pharmacy_stock")
        .select("quantity")
        .eq("pharmacy_id", farmaciaId)
        .eq("medication_id", i.medication_id)
        .single();
      if (s) {
        await supabase
          .from("pharmacy_stock")
          .update({ quantity: Math.max(0, s.quantity - i.quantity) })
          .eq("pharmacy_id", farmaciaId)
          .eq("medication_id", i.medication_id);
      }
    }
    setMensagem("Levantado. Stock atualizado.");
    setLido("");
    carregar(farmaciaId);
  }

  async function iniciarLeitura() {
    setMensagem("");
    setALer(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const q = new Html5Qrcode("leitor");
      leitor.current = q;
      await q.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        (texto) => {
          setLido(texto.trim());
          q.stop().catch(() => {});
          leitor.current = null;
          setALer(false);
        },
        () => {}
      );
    } catch {
      setMensagem("Não foi possível abrir a câmara. Cola o código à mão.");
      setALer(false);
    }
  }

  async function pararLeitura() {
    await leitor.current?.stop().catch(() => {});
    leitor.current = null;
    setALer(false);
  }

  const encontrado = pedidos.find((p) => p.qr_token === lido && p.status === "aceite");

  if (!autorizado) return <p className="p-6">A carregar...</p>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Pedidos</h1>

      <section className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Ler QR do paciente</h2>
        <div id="leitor" className="w-full" />
        {aLer ? (
          <button onClick={pararLeitura} className="text-sm bg-gray-200 rounded px-3 py-2">
            Parar câmara
          </button>
        ) : (
          <button
            onClick={iniciarLeitura}
            className="text-sm bg-green-600 text-white rounded px-3 py-2"
          >
            Abrir câmara
          </button>
        )}
        <input
          className="w-full border rounded p-2 text-sm"
          placeholder="Ou cola aqui o código do QR"
          value={lido}
          onChange={(e) => setLido(e.target.value.trim())}
        />
        {lido && !encontrado && (
          <p className="text-sm text-red-600">
            Código não encontrado, ou o pedido ainda não foi aceite.
          </p>
        )}
        {encontrado && (
          <div className="border rounded p-3 space-y-2 bg-green-50">
            <p className="text-sm font-semibold text-green-800">Pedido válido</p>
            {encontrado.order_items.map((i, k) => (
              <p key={k} className="text-sm">
                {i.quantity}x {i.medications.name} {i.medications.strength}
              </p>
            ))}
            <button
              onClick={() => levantar(encontrado)}
              className="text-sm bg-green-600 text-white rounded px-3 py-2"
            >
              Marcar como levantado
            </button>
          </div>
        )}
      </section>

      {mensagem && (
        <p
          className={
            mensagem.startsWith("Levantado")
              ? "text-sm text-green-700"
              : "text-sm text-red-600"
          }
        >
          {mensagem}
        </p>
      )}

      <div className="space-y-2">
        {pedidos.length === 0 && (
          <p className="text-sm text-gray-600">Não há pedidos por tratar.</p>
        )}
        {pedidos.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="flex justify-between">
              <p className="text-xs text-gray-600">
                {new Date(p.created_at).toLocaleString("pt-PT")}
              </p>
              <span
                className={
                  p.status === "pago"
                    ? "text-xs bg-amber-100 text-amber-800 rounded px-2 py-1"
                    : "text-xs bg-green-100 text-green-800 rounded px-2 py-1"
                }
              >
                {p.status === "pago" ? "Pago" : "Aceite"}
              </span>
            </div>
            {p.order_items.map((i, k) => (
              <p key={k} className="text-sm">
                {i.quantity}x {i.medications.name} {i.medications.strength}
              </p>
            ))}
            <p className="font-semibold">
              {Number(p.total).toLocaleString("pt-PT")} Kz
            </p>
            {p.status === "pago" && (
              <div className="flex gap-2">
                <button
                  onClick={() => mudarEstado(p.id, "aceite")}
                  className="text-sm bg-green-600 text-white rounded px-3 py-1"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => mudarEstado(p.id, "cancelado")}
                  className="text-sm bg-gray-200 rounded px-3 py-1"
                >
                  Recusar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}