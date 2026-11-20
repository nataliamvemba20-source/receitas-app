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

  const { data, error } = await admin
    .from("prescriptions")
    .select("id, code, status, issued_at, valid_until")
    .eq("patient_id", quem.user.id)
    .order("issued_at", { ascending: false });

  if (error) return NextResponse.json({ erro: "Não foi possível carregar as receitas." }, { status: 500 });
  return NextResponse.json({ receitas: data ?? [] });
}
