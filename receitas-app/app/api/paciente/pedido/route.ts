import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { data: pedido } = await admin
    .from("orders")
    .select("id, status, total, qr_token, created_at, pharmacy_id")
    .eq("id", id)
    .eq("patient_id", quem.user.id)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  const { data: farmacia } = await admin
    .from("pharmacies")
    .select("name, address")
    .eq("id", pedido.pharmacy_id)
    .maybeSingle();

  const { data: linhas } = await admin
    .from("order_items")
    .select("medication_id, quantity, unit_price")
    .eq("order_id", pedido.id);

  const { data: meds } = await admin
    .from("medications")
    .select("id, name")
    .in("id", (linhas ?? []).map((l) => l.medication_id as string));

  const itens = (linhas ?? []).map((l) => ({
    nome: (meds ?? []).find((m) => m.id === l.medication_id)?.name ?? "Medicamento",
    quantidade: l.quantity as number,
    precoUnit: Number(l.unit_price),
  }));

  const pago = pedido.status !== "reservado";

  return NextResponse.json({
    pedido: {
      id: pedido.id,
      estado: pedido.status,
      total: Number(pedido.total),
      qr: pago ? pedido.qr_token : null,
      farmacia: farmacia?.name ?? "",
      morada: farmacia?.address ?? "",
      numItens: itens.length,
      itens: pago ? itens : [],
    },
  });
}