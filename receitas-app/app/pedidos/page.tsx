"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "../../lib/supabase";

type Pedido = {
  id: string;
  status: string;
  total: number;
  qr_token: string | null;
  created_at: string;
  pharmacies: {
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  order_items: {
    quantity: number;
    unit_price: number;
    medications: { name: string; strength: string | null };
  }[];
};

const textos: Record<string, string> = {
  pago: "Pago. À espera que a farmácia aceite.",
  aceite: "Aceite. Mostra o QR na farmácia para levantar.",
  levantado: "Levantado.",
  cancelado: "Cancelado.",
};

export default function Pedidos() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function carregar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, total, qr_token, created_at, pharmacies(name, address, latitude, longitude), order_items(quantity, unit_price, medications(name, strength))"
        )
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });
      if (error) setErro(error.message);
      else setPedidos(data as unknown as Pedido[]);
      setPronto(true);
    }
    carregar();
  }, [router]);

  if (!pronto) return <p className="p-6">A carregar...</p>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Os meus pedidos</h1>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!erro && pedidos.length === 0 && (
        <p className="text-sm text-gray-600">Ainda não tens pedidos.</p>
      )}

      {pedidos.map((p) => (
        <section key={p.id} className="bg-white rounded-xl shadow p-4 space-y-3">
          <div>
            <p className="font-semibold">{p.pharmacies.name}</p>
            <p className="text-xs text-gray-600">{p.pharmacies.address}</p>
            {p.pharmacies.latitude != null && p.pharmacies.longitude != null && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.pharmacies.latitude},${p.pharmacies.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-green-700 underline"
              >
                Como chegar
              </a>
            )}
          </div>

          {p.order_items.map((i, k) => (
            <p key={k} className="text-sm">
              {i.quantity}x {i.medications.name} {i.medications.strength}
            </p>
          ))}

          <p className="font-semibold">
            Total: {Number(p.total).toLocaleString("pt-PT")} Kz
          </p>
          <p className="text-sm text-gray-700">{textos[p.status] ?? p.status}</p>

          {p.status === "aceite" && p.qr_token && (
            <div className="flex justify-center bg-white p-3 border rounded">
              <QRCodeSVG value={p.qr_token} size={200} />
            </div>
          )}
        </section>
      ))}
    </main>
  );
}