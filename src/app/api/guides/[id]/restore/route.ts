import { z } from "zod";
import { restoreVersion } from "@/lib/guide/edit/restore";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/guides/<id>/restore  { "versionNo": 1 }   (SRS FR-GUIDE-5, docs/05 M8)
//
// Makes an older version of the person's OWN copy the newest one, as a new version.
//
//   201 { versionId, versionNo }   restored; versionNo is the new version
//   400 / 401 / 404 / 413 / 415 { error }
//
// Rate limits come later (SEC-8).

const Id = z.uuid();
const Body = z.object({ versionNo: z.number().int().positive().max(100_000) });

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

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Sign in first", 401);

  const text = await request.text();
  if (text.length > 1_000) return fail("Request too large", 413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("Send JSON", 400);
  }
  const body = Body.safeParse(json);
  if (!body.success) return fail('Send {"versionNo": 1}', 400);

  const result = await restoreVersion(createServiceClient(), {
    guideId: guideId.data,
    userId: data.user.id,
    versionNo: body.data.versionNo,
  });
  if (!result.ok) return fail(result.error, result.status);

  return Response.json(
    { versionId: result.versionId, versionNo: result.versionNo },
    { status: 201 },
  );
}
