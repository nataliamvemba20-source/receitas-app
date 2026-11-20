import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPrivateKey, randomInt, randomUUID, sign } from "crypto";

type ItemEntrada = {
  medication_id: string;
  medication_name: string;
  dosage: string;
  quantity: number;
};

export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

  const { data: perfil } = await admin
    .from("profiles")
    .select("role, full_name, hospital_id")
    .eq("id", quem.user.id)
    .single();
  if (perfil?.role !== "medico" || !perfil.hospital_id)
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = await req.json();
  const nome: string = (corpo.patient_name ?? "").trim();
  const digitos = String(corpo.patient_phone ?? "").replace(/\D/g, "");
const telefone: string = digitos.length === 9 ? "244" + digitos : digitos;
  const nascimento: string | null = corpo.patient_birth_date || null;
  const itens: ItemEntrada[] = Array.isArray(corpo.items) ? corpo.items : [];

  if (!nome || !telefone)
    return NextResponse.json({ erro: "Preenche o nome e o telemóvel do paciente." }, { status: 400 });
  if (itens.length === 0 || itens.some((i) => !i.medication_id || !(i.quantity > 0)))
    return NextResponse.json({ erro: "Adiciona pelo menos um medicamento com quantidade." }, { status: 400 });

  const dias = Math.min(Math.max(parseInt(corpo.valid_days) || 30, 1), 180);
  const emitida = new Date().toISOString().slice(0, 10);
  const valida = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

  const chave = createPrivateKey({
    key: Buffer.from(process.env.RECEITA_PRIVATE_KEY ?? "", "base64"),
    format: "der",
    type: "pkcs8",
  });

  let id = "";
  let codigo = "";
  let assinatura = "";
  let guardada = false;

  for (let tentativa = 0; tentativa < 5 && !guardada; tentativa++) {
    id = randomUUID();
    codigo = `RX-${randomInt(100000, 1000000)}`;
    const dados = JSON.stringify({
      id,
      codigo,
      hospital_id: perfil.hospital_id,
      doctor_id: quem.user.id,
      patient_phone: telefone,
      patient_birth_date: nascimento,
      emitida,
      valida,
      itens: itens.map((i) => ({
        medication_id: i.medication_id,
        dosage: i.dosage,
        quantity: i.quantity,
      })),
    });
    assinatura = sign(null, Buffer.from(dados), chave).toString("base64");

    const { error } = await admin.from("prescriptions").insert({
      id,
      code: codigo,
      hospital_id: perfil.hospital_id,
      doctor_id: quem.user.id,
      patient_name: nome,
      patient_phone: telefone,
      patient_birth_date: nascimento,
      issued_at: emitida,
      valid_until: valida,
      signature: assinatura,
      status: "ativa",
    });
    if (!error) guardada = true;
    else if (error.code !== "23505")
      return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  if (!guardada)
    return NextResponse.json({ erro: "Não foi possível gerar um código único." }, { status: 500 });

  const { error: erroItens } = await admin.from("prescription_items").insert(
    itens.map((i) => ({
      prescription_id: id,
      medication_id: i.medication_id,
      medication_name: i.medication_name,
      dosage: i.dosage,
      quantity: i.quantity,
    }))
  );
  if (erroItens) {
    await admin.from("prescriptions").delete().eq("id", id);
    return NextResponse.json({ erro: erroItens.message }, { status: 400 });
  }

  const { data: hospital } = await admin
    .from("hospitals")
    .select("name")
    .eq("id", perfil.hospital_id)
    .single();

  return NextResponse.json({
    ok: true,
    ficha: {
      id,
      code: codigo,
      signature: assinatura,
      issued_at: emitida,
      valid_until: valida,
      doctor_name: perfil.full_name,
      hospital_name: hospital?.name ?? "",
      patient_name: nome,
      patient_birth_date: nascimento,
      items: itens.map((i) => ({
        medication_name: i.medication_name,
        dosage: i.dosage,
        quantity: i.quantity,
      })),
    },
  });
}