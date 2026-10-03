import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql, and, eq, isNotNull, not } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { tryDecryptField } from "@/lib/crypto/envelope";

const { transactions } = schema;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.authenticated) return auth.response;
  const { userId, dek } = auth.context;

  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // 'payee', 'note', or 'tag'
    
    if (!type || !["payee", "note", "tag"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Get up to 500 recent transactions to extract unique values
    const recentTx = await db
      .select({
        payee: transactions.payee,
        notes: transactions.notes,
        tags: transactions.tags,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId)))
      .orderBy(sql`${transactions.date} DESC`)
      .limit(500);

    const uniqueValues = new Set<string>();

    for (const tx of recentTx) {
      if (type === "payee" && tx.payee) {
        const decrypted = dek ? tryDecryptField(dek, tx.payee, "transactions.payee") : tx.payee;
        if (decrypted) uniqueValues.add(decrypted);
      } else if (type === "note" && tx.notes) {
        const decrypted = dek ? tryDecryptField(dek, tx.notes, "transactions.notes") : tx.notes;
        if (decrypted) uniqueValues.add(decrypted);
      } else if (type === "tag" && tx.tags) {
        const decrypted = dek ? tryDecryptField(dek, tx.tags, "transactions.tags") : tx.tags;
        if (decrypted) {
          // Tags are comma separated
          const tagsList = decrypted.split(",").map(t => t.trim()).filter(Boolean);
          tagsList.forEach(t => uniqueValues.add(t));
        }
      }
    }

    return NextResponse.json({ suggestions: Array.from(uniqueValues).slice(0, 20) });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}
