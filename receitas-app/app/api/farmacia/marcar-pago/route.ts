import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const id = String(corpo.id ?? "");
  if (!id) return NextResponse.json({ erro: "Falta o pedido." }, { status: 400 });

  // Só marca se o pedido for desta farmácia e ainda estiver reservado.
  const { data: atualizado } = await admin
    .from("orders")
    .update({ status: "aceite" })
    .eq("id", id)
    .eq("pharmacy_id", perfil.pharmacy_id)
    .eq("status", "reservado")
    .select("id");

  if (!atualizado || atualizado.length === 0)
    return NextResponse.json(
      { erro: "Pedido não encontrado, ou já foi tratado." },
      { status: 404 }
    );

  return NextResponse.json({ ok: true });
}
