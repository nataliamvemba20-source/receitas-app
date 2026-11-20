import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPrivateKey, createPublicKey, verify } from "crypto";

const ESTADOS_PAGOS = ["pago", "aceite"];

function permutacoes<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista];
  const saida: T[][] = [];
  lista.forEach((el, i) => {
    const resto = [...lista.slice(0, i), ...lista.slice(i + 1)];
    for (const p of permutacoes(resto)) saida.push([el, ...p]);
  });
  return saida;
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
    .select("role, pharmacy_id")
    .eq("id", quem.user.id)
    .single();
  if (perfil?.role !== "farmacia" || !perfil.pharmacy_id)
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = await req.json();
  const qr = String(corpo.qr ?? "").trim();
  const confirmar = corpo.confirmar === true;
  if (!qr) return NextResponse.json({ erro: "Escreve o código do pedido." }, { status: 400 });

  const naoEncontrado = NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  const { data: pedido } = await admin
    .from("orders")
    .select("id, status, total, pharmacy_id, prescription_id")
    .eq("qr_token", qr)
    .maybeSingle();
  if (!pedido || pedido.pharmacy_id !== perfil.pharmacy_id) return naoEncontrado;

  if (pedido.status === "levantado")
    return NextResponse.json({ erro: "Este pedido já foi levantado." }, { status: 400 });
  if (!ESTADOS_PAGOS.includes(pedido.status))
    return NextResponse.json({ erro: "Este pedido ainda não está pago." }, { status: 400 });

  const { data: receita } = await admin
    .from("prescriptions")
    .select(
      "id, code, status, valid_until, issued_at, hospital_id, doctor_id, patient_phone, patient_birth_date, signature, patient_name"
    )
    .eq("id", pedido.prescription_id)
    .maybeSingle();
  if (!receita) return NextResponse.json({ erro: "Receita não encontrada." }, { status: 404 });

  const hoje = new Date().toISOString().slice(0, 10);
  if (receita.status !== "ativa")
    return NextResponse.json({ erro: "A receita já não está ativa." }, { status: 400 });
  if (receita.valid_until < hoje)
    return NextResponse.json({ erro: "A receita expirou." }, { status: 400 });

  // Verificar a assinatura do médico
  const { data: itensReceita } = await admin
    .from("prescription_items")
    .select("medication_id, dosage, quantity, quantity_dispensed")
    .eq("prescription_id", receita.id);
  const itensAssinados = (itensReceita ?? []).map((i) => ({
    medication_id: i.medication_id,
    dosage: i.dosage,
    quantity: i.quantity,
  }));

  if (itensAssinados.length > 6)
    return NextResponse.json({ erro: "Receita com demasiados itens para verificar." }, { status: 400 });

  const chavePrivada = createPrivateKey({
    key: Buffer.from(process.env.RECEITA_PRIVATE_KEY ?? "", "base64"),
    format: "der",
    type: "pkcs8",
  });
  const chavePublica = createPublicKey(chavePrivada);
  const assinatura = Buffer.from(String(receita.signature ?? ""), "base64");

  let valida = false;
  for (const ordem of permutacoes(itensAssinados)) {
    const dados = JSON.stringify({
      id: receita.id,
      codigo: receita.code,
      hospital_id: receita.hospital_id,
      doctor_id: receita.doctor_id,
      patient_phone: receita.patient_phone,
      patient_birth_date: receita.patient_birth_date ?? null,
      emitida: receita.issued_at,
      valida: receita.valid_until,
      itens: ordem,
    });
    if (verify(null, Buffer.from(dados), chavePublica, assinatura)) {
      valida = true;
      break;
    }
  }
  if (!valida)
    return NextResponse.json(
      { erro: "ASSINATURA INVÁLIDA. Não entregues os medicamentos." },
      { status: 400 }
    );

  const { data: linhas } = await admin
    .from("order_items")
    .select("medication_id, quantity, unit_price")
    .eq("order_id", pedido.id);
  const { data: meds } = await admin
    .from("medications")
    .select("id, name")
    .in("id", (linhas ?? []).map((l) => l.medication_id as string));

  const itens = (linhas ?? []).map((l) => ({
    medication_id: l.medication_id as string,
    nome: (meds ?? []).find((m) => m.id === l.medication_id)?.name ?? "Medicamento",
    quantidade: l.quantity as number,
    precoUnit: Number(l.unit_price),
  }));

  if (!confirmar) {
    return NextResponse.json({
      verificado: true,
      pedido: {
        estado: pedido.status,
        total: Number(pedido.total),
        receita: receita.code,
        paciente: receita.patient_name,
        itens,
      },
    });
  }

  // Confirmar o levantamento: verificar stock primeiro
  const { data: stock } = await admin
    .from("pharmacy_stock")
    .select("medication_id, quantity")
    .eq("pharmacy_id", perfil.pharmacy_id)
    .in("medication_id", itens.map((i) => i.medication_id));
  for (const item of itens) {
    const s = (stock ?? []).find((x) => x.medication_id === item.medication_id);
    if (!s || (s.quantity as number) < item.quantidade)
      return NextResponse.json({ erro: "Stock insuficiente para " + item.nome + "." }, { status: 400 });
  }

  // Marcar como levantado só se ainda estiver pago (evita levantar duas vezes)
  const { data: marcado } = await admin
    .from("orders")
    .update({ status: "levantado", picked_up_at: new Date().toISOString() })
    .eq("id", pedido.id)
    .in("status", ESTADOS_PAGOS)
    .select("id");
  if (!marcado || marcado.length === 0)
    return NextResponse.json({ erro: "Este pedido já foi levantado." }, { status: 400 });

  for (const item of itens) {
    const s = (stock ?? []).find((x) => x.medication_id === item.medication_id)!;
    await admin
      .from("pharmacy_stock")
      .update({ quantity: (s.quantity as number) - item.quantidade })
      .eq("pharmacy_id", perfil.pharmacy_id)
      .eq("medication_id", item.medication_id);

    const ri = (itensReceita ?? []).find((r) => r.medication_id === item.medication_id);
    await admin
      .from("prescription_items")
      .update({ quantity_dispensed: ((ri?.quantity_dispensed as number) ?? 0) + item.quantidade })
      .eq("prescription_id", receita.id)
      .eq("medication_id", item.medication_id);
  }

  return NextResponse.json({ ok: true, mensagem: "Levantamento confirmado." });
}
