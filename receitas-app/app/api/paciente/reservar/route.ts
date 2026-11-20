import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const ESTADO_INICIAL = "reservado";

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

  const corpo = await req.json();
  const receitaId = String(corpo.prescription_id ?? "");
  const farmaciaId = String(corpo.pharmacy_id ?? "");
  if (!receitaId || !farmaciaId)
    return NextResponse.json({ erro: "Dados em falta." }, { status: 400 });

  const { data: receita } = await admin
    .from("prescriptions")
    .select("id, status, valid_until")
    .eq("id", receitaId)
    .eq("patient_id", quem.user.id)
    .maybeSingle();
  if (!receita) return NextResponse.json({ erro: "Receita não encontrada." }, { status: 404 });

  const hoje = new Date().toISOString().slice(0, 10);
  if (receita.status !== "ativa")
    return NextResponse.json({ erro: "Esta receita já não está ativa." }, { status: 400 });
  if (receita.valid_until < hoje)
    return NextResponse.json({ erro: "Esta receita já expirou." }, { status: 400 });

  const { data: farmacia } = await admin
    .from("pharmacies")
    .select("id")
    .eq("id", farmaciaId)
    .eq("active", true)
    .eq("verified", true)
    .maybeSingle();
  if (!farmacia) return NextResponse.json({ erro: "Farmácia não disponível." }, { status: 404 });

  const { data: existente } = await admin
    .from("orders")
    .select("id")
    .eq("patient_id", quem.user.id)
    .eq("prescription_id", receita.id)
    .eq("pharmacy_id", farmacia.id)
    .eq("status", ESTADO_INICIAL)
    .maybeSingle();
  if (existente) return NextResponse.json({ ok: true, order_id: existente.id });

  const { data: itensBrutos } = await admin
    .from("prescription_items")
    .select("medication_id, quantity, quantity_dispensed")
    .eq("prescription_id", receita.id);

  const itens = (itensBrutos ?? [])
    .map((i) => ({
      medication_id: i.medication_id as string,
      quantidade: (i.quantity as number) - ((i.quantity_dispensed as number) ?? 0),
    }))
    .filter((i) => i.quantidade > 0);
  if (itens.length === 0)
    return NextResponse.json({ erro: "Esta receita não tem nada por levantar." }, { status: 400 });

  const { data: stock } = await admin
    .from("pharmacy_stock")
    .select("medication_id, price, quantity")
    .eq("pharmacy_id", farmacia.id)
    .in("medication_id", itens.map((i) => i.medication_id));

  const linhas: { medication_id: string; quantity: number; unit_price: number }[] = [];
  for (const item of itens) {
    const s = (stock ?? []).find((x) => x.medication_id === item.medication_id);
    if (s && (s.quantity as number) >= item.quantidade) {
      linhas.push({
        medication_id: item.medication_id,
        quantity: item.quantidade,
        unit_price: Number(s.price),
      });
    }
  }
  if (linhas.length === 0)
    return NextResponse.json({ erro: "Esta farmácia já não tem estes medicamentos." }, { status: 400 });

  const total = Math.round(linhas.reduce((t, l) => t + l.unit_price * l.quantity, 0) * 100) / 100;
  const qr = randomBytes(24).toString("hex");

  const { data: pedido, error } = await admin
    .from("orders")
    .insert({
      patient_id: quem.user.id,
      pharmacy_id: farmacia.id,
      prescription_id: receita.id,
      status: ESTADO_INICIAL,
      total,
      qr_token: qr,
    })
    .select("id")
    .single();
  if (error || !pedido)
    return NextResponse.json({ erro: "Não foi possível criar o pedido." }, { status: 500 });

  const { error: erroItens } = await admin
    .from("order_items")
    .insert(linhas.map((l) => ({ ...l, order_id: pedido.id })));
  if (erroItens) {
    await admin.from("orders").delete().eq("id", pedido.id);
    return NextResponse.json({ erro: "Não foi possível criar o pedido." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order_id: pedido.id });
}