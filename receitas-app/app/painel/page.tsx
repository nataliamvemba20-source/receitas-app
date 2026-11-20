"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase";

type Perfil = { full_name: string | null; role: string };
type Entrada = { texto: string; href?: string };

const menus: Record<string, Entrada[]> = {
  paciente: [
    { texto: "Procurar medicamento", href: "/pesquisa" },
    { texto: "Juntar receita", href: "/paciente/juntar" },
    { texto: "As minhas receitas", href: "/paciente/receitas" },
    { texto: "Encontrar farmácia", href: "/paciente/farmacias" },
    { texto: "Os meus pedidos (em breve)" },
    { texto: "Lembretes das tomas (em breve)" },
  ],
  medico: [{ texto: "Emitir receita", href: "/medico/receitas/nova" }],
  farmacia: [
    { texto: "Stock e preços", href: "/farmacia/stock" },
    { texto: "Levantar pedido (ler QR)", href: "/farmacia/levantar" },
  ],
  admin: [
    { texto: "Registar e verificar farmácias", href: "/admin/farmacias" },
    { texto: "Criar contas de médicos e farmácias", href: "/admin/contas" },
  ],
};

export default function Painel() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState("");

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
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();
      if (error) setErro(error.message);
      else setPerfil(data);
    }
    carregar();
  }, [router]);

  async function sair() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  if (erro) return <p className="p-6 text-red-600">{erro}</p>;
  if (!perfil) return <p className="p-6">A carregar...</p>;

  const entradas = menus[perfil.role] ?? [];

  return (
    <main className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Olá, {perfil.full_name}</h1>
      <p>
        O teu perfil é: <strong>{perfil.role}</strong>
      </p>

      <div className="space-y-2">
        {entradas.map((e) =>
          e.href ? (
            <a
              key={e.texto}
              href={e.href}
              className="block bg-green-600 text-white rounded-xl p-4 font-semibold"
            >
              {e.texto}
            </a>
          ) : (
            <div key={e.texto} className="bg-white rounded-xl shadow p-4 text-gray-500">
              {e.texto}
            </div>
          )
        )}
      </div>

      <button onClick={sair} className="bg-gray-800 text-white rounded px-4 py-2">
        Sair
      </button>
    </main>
  );
}