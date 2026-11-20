import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

  const corpo = await req.json();
  const codigo = String(corpo.code ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  const lat = Number(corpo.lat);
  const lng = Number(corpo.lng);
  if (!codigo) return NextResponse.json({ erro: "Escreve o código da receita." }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return NextResponse.json({ erro: "Não foi possível obter a tua localização." }, { status: 400 });

  // A receita tem de estar na conta deste paciente.
  const { data: receita } = await admin
    .from("prescriptions")
    .select("id, status, valid_until")
    .eq("code", codigo)
    .eq("patient_id", quem.user.id)
    .maybeSingle();
  if (!receita)
    return NextResponse.json({ erro: "Receita não encontrada na tua conta. Junta-a primeiro." }, { status: 404 });

  const hoje = new Date().toISOString().slice(0, 10);
  if (receita.status !== "ativa")
    return NextResponse.json({ erro: "Esta receita já não está ativa." }, { status: 400 });
  if (receita.valid_until < hoje)
    return NextResponse.json({ erro: "Esta receita já expirou." }, { status: 400 });

  // Medicamentos que ainda faltam levantar (nunca saem daqui os nomes).
  const { data: itens } = await admin
    .from("prescription_items")
    .select("medication_id, quantity, quantity_dispensed")
    .eq("prescription_id", receita.id);

  const necessarios = (itens ?? [])
    .map((i) => ({
      medication_id: i.medication_id as string,
      qtd: Number(i.quantity) - Number(i.quantity_dispensed ?? 0),
    }))
    .filter((i) => i.medication_id && i.qtd > 0);

  if (necessarios.length === 0)
    return NextResponse.json({ erro: "Esta receita já foi toda levantada." }, { status: 400 });

  const idsMed = necessarios.map((n) => n.medication_id);

  const { data: farmacias } = await admin
    .from("pharmacies")
    .select("id, name, address, latitude, longitude")
    .eq("active", true)
    .eq("verified", true);

  const { data: stock } = await admin
    .from("pharmacy_stock")
    .select("pharmacy_id, medication_id, price, quantity")
    .in("medication_id", idsMed);

  const resultados = [];
  for (const f of farmacias ?? []) {
    if (f.latitude == null || f.longitude == null) continue;

    let total = 0;
    let temTudo = true;
    for (const n of necessarios) {
      const linha = (stock ?? []).find(
        (s) => s.pharmacy_id === f.id && s.medication_id === n.medication_id
      );
      if (!linha || Number(linha.quantity) < n.qtd) {
        temTudo = false;
        break;
      }
      total += Number(linha.price) * n.qtd;
    }
    if (!temTudo) continue;

    resultados.push({
      id: f.id as string,
      nome: f.name as string,
      endereco: (f.address ?? "") as string,
      distancia_km: Math.round(distanciaKm(lat, lng, Number(f.latitude), Number(f.longitude)) * 10) / 10,
      total: Math.round(total * 100) / 100,
      mais_barata: false,
    });
  }

  if (resultados.length === 0)
    return NextResponse.json({
      farmacias: [],
      mensagem: "Nenhuma farmácia tem todos os medicamentos desta receita em stock.",
    });

  const menor = Math.min(...resultados.map((r) => r.total));
  for (const r of resultados) r.mais_barata = r.total === menor;

  resultados.sort((a, b) => a.distancia_km - b.distancia_km);
  return NextResponse.json({ farmacias: resultados.slice(0, 5) });
}
