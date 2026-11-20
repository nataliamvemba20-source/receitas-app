"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "../../../../lib/supabase";

type Med = { id: string; name: string; strength: string | null };
type Campo = "medication_id" | "dose" | "horas" | "dias" | "quantity";
type ItemForm = {
  medication_id: string;
  dose: string;
  horas: string;
  dias: string;
  quantity: string;
  manual: boolean;
};
type Ficha = {
  id: string;
  code: string;
  signature: string;
  issued_at: string;
  valid_until: string;
  doctor_name: string;
  hospital_name: string;
  patient_name: string;
  patient_birth_date: string | null;
  items: { medication_name: string; dosage: string; quantity: number }[];
};

function idade(d: string | null) {
  if (!d) return null;
  const n = new Date(d);
  const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a;
}

function data(d: string) {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

function calcular(horas: string, dias: string) {
  const h = parseInt(horas);
  const d = parseInt(dias);
  if (!(h > 0) || !(d > 0)) return "";
  return String(Math.ceil(24 / h) * d);
}

const vazio: ItemForm = {
  medication_id: "",
  dose: "",
  horas: "8",
  dias: "7",
  quantity: "21",
  manual: false,
};

export default function NovaReceita() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [catalogo, setCatalogo] = useState<Med[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [validade, setValidade] = useState("30");
  const [linhas, setLinhas] = useState<ItemForm[]>([{ ...vazio }]);
  const [mensagem, setMensagem] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);

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
      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (p?.role !== "medico") {
        router.push("/painel");
        return;
      }
      const { data: cat } = await supabase
        .from("medications")
        .select("id, name, strength")
        .order("name");
      setCatalogo((cat ?? []) as Med[]);
      setAutorizado(true);
    }
    iniciar();
  }, [router]);

  function mudar(i: number, campo: Campo, valor: string) {
    setLinhas(
      linhas.map((l, k) => {
        if (k !== i) return l;
        const nova: ItemForm = { ...l, [campo]: valor };
        if (campo === "quantity") nova.manual = true;
        else if ((campo === "horas" || campo === "dias") && !nova.manual)
          nova.quantity = calcular(nova.horas, nova.dias);
        return nova;
      })
    );
  }

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    setMensagem("");

    for (const l of linhas) {
      if (
        !l.medication_id ||
        !l.dose.trim() ||
        !(parseInt(l.horas) > 0) ||
        !(parseInt(l.dias) > 0) ||
        !(parseInt(l.quantity) > 0)
      ) {
        setMensagem(
          "Em cada medicamento, preenche o nome, a dose, as horas, os dias e a quantidade."
        );
        return;
      }
    }

    const itens = linhas.map((l) => {
      const m = catalogo.find((c) => c.id === l.medication_id);
      return {
        medication_id: l.medication_id,
        medication_name: m ? `${m.name} ${m.strength ?? ""}`.trim() : "",
        dosage: `${l.dose.trim()}, a cada ${parseInt(l.horas)} horas, durante ${parseInt(l.dias)} dias`,
        quantity: parseInt(l.quantity),
      };
    });

    const {
      data: { session },
    } = await createClient().auth.getSession();
    const resposta = await fetch("/api/medico/emitir-receita", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        patient_name: nome,
        patient_phone: telefone,
        patient_birth_date: nascimento,
        valid_days: validade,
        items: itens,
      }),
    });
    const corpo = await resposta.json();
    if (!resposta.ok) {
      setMensagem(corpo.erro ?? "Erro ao emitir a receita.");
      return;
    }
    setFicha(corpo.ficha);
  }

  function nova() {
    setFicha(null);
    setNome("");
    setTelefone("");
    setNascimento("");
    setValidade("30");
    setLinhas([{ ...vazio }]);
  }

  if (!autorizado) return <p className="p-6">A carregar...</p>;

  if (ficha) {
    const anos = idade(ficha.patient_birth_date);
    return (
      <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow p-5 space-y-3 print:shadow-none">
          <div className="text-center border-b pb-3">
            <p className="text-lg font-bold uppercase tracking-wide">
              {ficha.hospital_name}
            </p>
            <p className="text-xs text-gray-600">Receita médica digital</p>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">Código da receita</p>
            <p className="text-sm font-bold">{ficha.code}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
            <p>
              <span className="text-gray-600">Paciente</span>
              <br />
              <strong>{ficha.patient_name}</strong>
            </p>
            <p>
              <span className="text-gray-600">Idade</span>
              <br />
              <strong>{anos != null ? `${anos} anos` : "não indicada"}</strong>
            </p>
            <p>
              <span className="text-gray-600">Emitida em</span>
              <br />
              <strong>{data(ficha.issued_at)}</strong>
            </p>
            <p>
              <span className="text-gray-600">Válida até</span>
              <br />
              <strong>{data(ficha.valid_until)}</strong>
            </p>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm">
              <strong>{ficha.items.length} medicamento(s)</strong>
              <br />
              <span className="text-gray-600">
                A lista é mostrada na app depois do pagamento.
              </span>
            </p>
          </div>

          <div className="border-t pt-3 flex gap-4 items-center">
            <QRCodeSVG value={`${ficha.id}.${ficha.signature}`} size={140} />
            <div className="text-sm">
              <p className="text-gray-600">Médico</p>
              <p className="font-semibold">{ficha.doctor_name}</p>
              <p className="text-xs text-gray-600">{ficha.hospital_name}</p>
              <p className="text-xs text-gray-600 mt-2">
                Sem QR, use o código {ficha.code}
              </p>
            </div>
          </div>
        </div>

        <div className="print:hidden bg-yellow-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600">
            Só para o médico (não sai na impressão)
          </p>
          {ficha.items.map((i, k) => (
            <p key={k} className="text-sm">
              <strong>{i.medication_name}</strong>, {i.quantity} un.
              {i.dosage && <span> ({i.dosage})</span>}
            </p>
          ))}
        </div>

        <div className="flex gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="bg-green-600 text-white rounded px-4 py-2 font-semibold"
          >
            Imprimir ficha
          </button>
          <button onClick={nova} className="bg-gray-200 rounded px-4 py-2">
            Nova receita
          </button>
          <a href="/painel" className="px-4 py-2 text-sm text-green-700 underline">
            Painel
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <a href="/painel" className="text-sm text-green-700 underline">
        Voltar ao painel
      </a>
      <h1 className="text-2xl font-bold">Emitir receita</h1>

      <form onSubmit={emitir} className="bg-white rounded-xl shadow p-4 space-y-3">
        <input
          className="w-full border rounded p-2"
          placeholder="Nome do paciente"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <input
          className="w-full border rounded p-2"
          type="tel"
          placeholder="Telemóvel do paciente (ex.: 923456789)"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          required
        />
        <label className="block text-sm text-gray-600">
          Data de nascimento (a idade conta para a dose)
          <input
            className="w-full border rounded p-2 mt-1 text-black"
            type="date"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-gray-600">
          Validade da receita (dias para levantar na farmácia)
          <input
            className="w-full border rounded p-2 mt-1 text-black"
            type="number"
            min="1"
            max="180"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            required
          />
        </label>

        <h2 className="font-semibold pt-2">Medicamentos</h2>
        {linhas.map((l, i) => (
          <div key={i} className="border rounded p-3 space-y-2 bg-gray-50">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold">Medicamento {i + 1}</p>
              {linhas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}
                  className="text-sm bg-gray-200 rounded px-3 py-1"
                >
                  Remover
                </button>
              )}
            </div>

            <select
              className="w-full border rounded p-2 bg-white"
              value={l.medication_id}
              onChange={(e) => mudar(i, "medication_id", e.target.value)}
              required
            >
              <option value="">Escolhe o medicamento</option>
              {catalogo.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.strength}
                </option>
              ))}
            </select>

            <input
              className="w-full border rounded p-2 bg-white"
              placeholder="Dose de cada toma (ex.: 1 cápsula)"
              value={l.dose}
              onChange={(e) => mudar(i, "dose", e.target.value)}
              required
            />

            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-600">
                A cada (horas)
                <input
                  className="w-full border rounded p-2 mt-1 bg-white text-black"
                  type="number"
                  min="1"
                  max="48"
                  value={l.horas}
                  onChange={(e) => mudar(i, "horas", e.target.value)}
                  required
                />
              </label>
              <label className="text-xs text-gray-600">
                Durante (dias)
                <input
                  className="w-full border rounded p-2 mt-1 bg-white text-black"
                  type="number"
                  min="1"
                  max="365"
                  value={l.dias}
                  onChange={(e) => mudar(i, "dias", e.target.value)}
                  required
                />
              </label>
              <label className="text-xs text-gray-600">
                Quantidade
                <input
                  className="w-full border rounded p-2 mt-1 bg-white text-black"
                  type="number"
                  min="1"
                  value={l.quantity}
                  onChange={(e) => mudar(i, "quantity", e.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        ))}
        
        <button
          type="button"
          onClick={() => setLinhas([...linhas, { ...vazio }])}
          className="w-full border-2 border-dashed border-green-600 text-green-700 rounded p-2 font-semibold"
        >
          + Adicionar outro medicamento
        </button>

        <button
          type="submit"
          className="w-full bg-green-600 text-white rounded p-2 font-semibold"
        >
          Emitir e assinar
        </button>
        {mensagem && <p className="text-sm text-red-600">{mensagem}</p>}
      </form>
    </main>
  );
}