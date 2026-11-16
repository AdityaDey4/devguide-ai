import { z } from "zod";
import { EditRequest, MAX_BODY_CHARS } from "@/lib/guide/edit/request";
import { saveEdit } from "@/lib/guide/edit/saveEdit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/guides/<id>/versions  { "sections": [{ "key", "markdown" }], "note": "..." }
// (docs/03-Architecture.md section 8, SRS FR-GUIDE-3)
//
// Saves a person's edit as a new version of THEIR copy of the guide. <id> is the guide the person
// was looking at, the shared one or their own copy; the first edit of a shared guide makes the
// copy, and the shared guide is never changed.
//
//   201 { guideId, versionId, versionNo, forked }   saved; guideId is the person's copy
//   400 / 401 / 404 / 409 / 413 / 415 { error }
//
// Only the sections that changed are sent. Rate limits come later (SEC-8).

const Id = z.uuid();

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guideId = Id.safeParse((await context.params).id);
  if (!guideId.success) return fail("Not a guide id", 400);
  // A browser form on another site cannot send JSON, so this also blocks cross-site posts.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return fail("Send the request as application/json", 415);
  }

  // The proxy only does an optimistic redirect: the real check is here, next to the work.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Sign in first", 401);

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fail("Request too large", 413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("Send JSON", 400);
  }
  const body = EditRequest.safeParse(json);
  if (!body.success) {
    return fail('Send {"sections": [{"key", "markdown"}], "note"}', 400);
  }

  const result = await saveEdit(createServiceClient(), {
    guideId: guideId.data,
    userId: data.user.id,
    edits: body.data.sections,
    note: body.data.note,
  });
  if (!result.ok) return fail(result.error, result.status);

  return Response.json(
    {
      guideId: result.guideId,
      versionId: result.versionId,
      versionNo: result.versionNo,
      forked: result.forked,
    },
    { status: 201 },
  );
}
