"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase";

type Opcao = { id: string; name: string };

export default function AdminContas() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [farmacias, setFarmacias] = useState<Opcao[]>([]);
  const [hospitais, setHospitais] = useState<Opcao[]>([]);
  const [tipo, setTipo] = useState<"medico" | "farmacia">("farmacia");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [farmaciaId, setFarmaciaId] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [sucesso, setSucesso] = useState("");

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
        .select("role")
        .eq("id", user.id)
        .single();
      if (data?.role !== "admin") {
        router.push("/painel");
        return;
      }
      setAutorizado(true);
      const f = await supabase
        .from("pharmacies")
        .select("id, name")
        .eq("verified", true)
        .order("name");
      const h = await supabase.from("hospitals").select("id, name").order("name");
      setFarmacias((f.data ?? []) as Opcao[]);
      setHospitais((h.data ?? []) as Opcao[]);
    }
    iniciar();
  }, [router]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setMensagem("");
    setSucesso("");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const resposta = await fetch("/api/admin/criar-conta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        nome,
        email,
        password,
        role: tipo,
        pharmacy_id: tipo === "farmacia" ? farmaciaId : null,
        hospital_id: tipo === "medico" ? hospitalId : null,
      }),
    });
    const corpo = await resposta.json();
    if (!resposta.ok) {
      setMensagem(corpo.erro ?? "Erro ao criar conta.");
      return;
    }
    setSucesso(`Conta criada: ${email}`);
    setNome("");
    setEmail("");
    setPassword("");
  }

  if (!autorizado) return <p className="p-6">A carregar...</p>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Criar conta</h1>

      <form onSubmit={criar} className="bg-white rounded-xl shadow p-4 space-y-3">
        <select
          className="w-full border rounded p-2"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "medico" | "farmacia")}
        >
          <option value="farmacia">Operadora de farmácia</option>
          <option value="medico">Médico</option>
        </select>

        <input
          className="w-full border rounded p-2"
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          type="text"
          placeholder="Palavra-passe inicial (mínimo 6 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {tipo === "farmacia" ? (
          <select
            className="w-full border rounded p-2"
            value={farmaciaId}
            onChange={(e) => setFarmaciaId(e.target.value)}
            required
          >
            <option value="">Escolhe a farmácia verificada</option>
            {farmacias.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            className="w-full border rounded p-2"
            value={hospitalId}
            onChange={(e) => setHospitalId(e.target.value)}
            required
          >
            <option value="">Escolhe o hospital</option>
            {hospitais.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          className="w-full bg-green-600 text-white rounded p-2 font-semibold"
        >
          Criar conta
        </button>
        {mensagem && <p className="text-sm text-red-600">{mensagem}</p>}
        {sucesso && <p className="text-sm text-green-700">{sucesso}</p>}
      </form>
    </main>
  );
}