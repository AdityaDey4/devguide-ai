// Saving an edit from the browser: used by the guide's edit screen.
//
//   const result = await saveGuideEdit(guideId, [{ key: "installation", markdown: "..." }], "Fixed a typo");
//   result -> { ok: true }
//          |  { ok: false, error: "Nothing was changed" }
//
// Only the sections that changed are sent. Browser only: no server code in here.

export type SectionEdit = { key: string; markdown: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveGuideEdit(
  guideId: string,
  sections: SectionEdit[],
  note: string,
): Promise<SaveResult> {
  try {
    const response = await fetch(`/api/guides/${guideId}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(note.trim() ? { sections, note } : { sections }),
    });
    if (response.ok) return { ok: true };

    // The route's own messages are written for people ("Nothing was changed") for these codes.
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : null;
    if (response.status === 401) {
      return { ok: false, error: "Sign in again to save your changes." };
    }
    if ((response.status === 400 || response.status === 409) && message) {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Could not save. Please try again." };
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection.",
    };
  }
}

// Restoring an older version of the person's own copy: used by the version screen.
//
//   await restoreGuideVersion(guideId, 1) -> { ok: true } | { ok: false, error: "That is already the current version" }
//
// The restore becomes a new version; nothing is deleted. Browser only.
export async function restoreGuideVersion(
  guideId: string,
  versionNo: number,
): Promise<SaveResult> {
  try {
    const response = await fetch(`/api/guides/${guideId}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionNo }),
    });
    if (response.ok) return { ok: true };

    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : null;
    if (response.status === 401) {
      return { ok: false, error: "Sign in again to restore." };
    }
    if ((response.status === 400 || response.status === 404) && message) {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Could not restore. Please try again." };
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection.",
    };
  }
}
