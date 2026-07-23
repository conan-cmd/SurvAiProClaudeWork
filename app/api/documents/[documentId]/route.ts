import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { deleteFile } from "@/lib/storage"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const doc = await db.orgDocument.findFirst({
    where: { id: params.documentId, organizationId: user.organizationId },
  })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await deleteFile(doc.fileUrl).catch(() => {})
  await db.orgDocument.delete({ where: { id: doc.id } })
  return NextResponse.json({ success: true })
}
