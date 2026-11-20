"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "../../../lib/supabase";

type Pedido = {
  id: string;
  estado: string;
  total: number;
  qr: string | null;
  numItens: number;
  farmacia: string;
  morada: string;
  itens: { nome: string; quantidade: number; precoUnit: number }[];
};

function Conteudo() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const { data } = await createClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          router.push("/login");
          return;
        }
        const resp = await fetch("/api/paciente/pedido?id=" + id, {
          headers: { Authorization: "Bearer " + token },
        });
        const dados = await resp.json();
        if (!resp.ok) setErro(dados.erro ?? "Erro ao carregar.");
        else setPedido(dados.pedido);
      } catch {
        setErro("Não foi possível ligar ao servidor.");
      }
    }
    carregar();
  }, [id, router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">O meu pedido</h1>
      {erro && <p className="text-red-600">{erro}</p>}
      {!pedido && !erro && <p>A carregar...</p>}

      {pedido && (
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <p className="font-bold">{pedido.farmacia}</p>
          {pedido.morada && <p className="text-gray-600">{pedido.morada}</p>}
          <p>
            Estado: <strong>{pedido.estado}</strong>
          </p>

          {pedido.itens.length > 0 && (
            <ul className="text-sm text-gray-700 space-y-1">
              {pedido.itens.map((i) => (
                <li key={i.nome} className="flex justify-between gap-2">
                  <span>
                    {i.nome} x{i.quantidade}
                  </span>
                  <span>{(i.precoUnit * i.quantidade).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="font-bold text-green-700">Total: {pedido.total.toFixed(2)}</p>

          {pedido.qr ? (
            <>
              <div className="flex justify-center py-2">
                <QRCodeSVG value={pedido.qr} size={200} />
              </div>
              <p className="text-center text-sm text-gray-600">
                Mostra este código na farmácia para levantares os medicamentos.
              </p>
            </>
          ) : (
            <p className="text-amber-700">
              Reserva feita ({pedido.numItens} medicamento(s)). Os medicamentos e o código QR só
              aparecem depois do pagamento.
            </p>
          )}
        </div>
      )}

      <a href="/paciente/receitas" className="block text-gray-600 underline">
        Voltar às minhas receitas
      </a>
    </main>
  );
}

export default function PaginaPedido() {
  return (
    <Suspense fallback={<p className="p-6">A carregar...</p>}>
      <Conteudo />
    </Suspense>
  );
}