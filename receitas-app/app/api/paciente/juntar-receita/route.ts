import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizarTelefone(valor: unknown): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos.length === 9 ? "244" + digitos : digitos;
}

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
    .select("phone")
    .eq("id", quem.user.id)
    .single();
  const telefonePerfil = normalizarTelefone(perfil?.phone);
  if (!telefonePerfil)
    return NextResponse.json({ erro: "A tua conta não tem telemóvel registado." }, { status: 400 });

  const corpo = await req.json();
  const codigo: string = String(corpo.code ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!codigo) return NextResponse.json({ erro: "Escreve o código da receita." }, { status: 400 });

  // Mensagem igual para qualquer falha de correspondência, para ninguém descobrir códigos válidos.
  const naoCorresponde = NextResponse.json(
    { erro: "Não foi possível juntar esta receita. Confirma o código e o telemóvel da tua conta." },
    { status: 404 }
  );

  const { data: receita } = await admin
    .from("prescriptions")
    .select("id, code, status, valid_until, patient_id, patient_phone")
    .eq("code", codigo)
    .maybeSingle();

  if (!receita) return naoCorresponde;
  if (normalizarTelefone(receita.patient_phone) !== telefonePerfil) return naoCorresponde;

  if (receita.patient_id) {
    if (receita.patient_id === quem.user.id)
      return NextResponse.json({ ok: true, mensagem: "Esta receita já está na tua conta." });
    return naoCorresponde;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  if (receita.status !== "ativa")
    return NextResponse.json({ erro: "Esta receita já não está ativa." }, { status: 400 });
  if (receita.valid_until < hoje)
    return NextResponse.json({ erro: "Esta receita já expirou." }, { status: 400 });

  // .is("patient_id", null) evita que dois pedidos ao mesmo tempo juntem a mesma receita.
  const { data: atualizada, error } = await admin
    .from("prescriptions")
    .update({ patient_id: quem.user.id })
    .eq("id", receita.id)
    .is("patient_id", null)
    .select("id");

  if (error || !atualizada || atualizada.length === 0)
    return NextResponse.json({ erro: "Não foi possível juntar a receita. Tenta outra vez." }, { status: 500 });

  return NextResponse.json({ ok: true, mensagem: "Receita juntada à tua conta." });
}