export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminFirestore, FieldValue, Timestamp } from "@/lib/firebaseAdmin";

const VALID_CATEGORIES = ["bug", "idea", "general"] as const;
type FeedbackCategory = (typeof VALID_CATEGORIES)[number];

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug Report",
  idea: "Feature Idea",
  general: "General",
};

/** Sanitizes single-line fields to prevent CRLF email header injection. */
function sanitizeSingleLine(val: unknown, fallback = ""): string {
  if (typeof val !== "string") return fallback;
  return val.replace(/[\r\n\x00-\x1F\x7F]+/g, " ").trim() || fallback;
}

export async function POST(req: Request) {
  // 1. Authentication Gate
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { category, message, metadata, website, openedAt } = body ?? {};

  // 2. Honeypot check: if website is non-empty, silently acknowledge without saving or emailing
  if (typeof website === "string" ? website.trim().length > 0 : Boolean(website)) {
    return NextResponse.json({ ok: true });
  }

  // 3. Timing check: reject humanly impossible form completions (< 2000ms)
  if (typeof openedAt === "number" && Date.now() - openedAt < 2000) {
    return NextResponse.json(
      { error: "Submission too fast. Please take your time." },
      { status: 400 }
    );
  }

  // 4. Validation: Category strictly "bug" | "idea" | "general"
  if (typeof category !== "string" || !VALID_CATEGORIES.includes(category as FeedbackCategory)) {
    return NextResponse.json(
      { error: "Invalid category. Must be 'bug', 'idea', or 'general'." },
      { status: 400 }
    );
  }

  // 5. Validation: Message trimming, strip null bytes and control chars, length 5-1000
  if (typeof message !== "string") {
    return NextResponse.json({ error: "Message must be a string." }, { status: 400 });
  }

  // Strip null bytes and non-printable control characters, but preserve tabs and standard newlines
  const cleanMessage = message
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();

  if (cleanMessage.length < 5 || cleanMessage.length > 1000) {
    return NextResponse.json(
      { error: "Message must be between 5 and 1000 characters." },
      { status: 400 }
    );
  }

  // 6. Per-User Rate Limit (Max 3 / Hour) via Firebase Admin Firestore
  const adminDb = getAdminFirestore();
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
  const oneHourAgoTimestamp = Timestamp.fromMillis(oneHourAgoMs);

  let recentFeedbackCount = 0;
  try {
    const querySnapshot = await adminDb
      .collection("feedback")
      .where("userId", "==", session.user.id)
      .where("createdAt", ">=", oneHourAgoTimestamp)
      .get();
    recentFeedbackCount = querySnapshot.size;
  } catch {
    // Resilient fallback query in case composite index is not yet built in Firestore
    const userDocs = await adminDb
      .collection("feedback")
      .where("userId", "==", session.user.id)
      .get();
    recentFeedbackCount = userDocs.docs.filter((doc) => {
      const createdAt = doc.data().createdAt;
      const ms = createdAt?.toMillis
        ? createdAt.toMillis()
        : createdAt?.seconds
          ? createdAt.seconds * 1000
          : 0;
      return ms >= oneHourAgoMs;
    }).length;
  }

  if (recentFeedbackCount >= 3) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  // 7. Delivery & Logging: Write feedback backup entry to Firestore
  const clientMeta = (metadata && typeof metadata === "object" ? metadata : {}) as Record<
    string,
    unknown
  >;

  const feedbackDoc = {
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    category,
    message: cleanMessage,
    metadata: clientMeta,
    status: "new",
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await adminDb.collection("feedback").add(feedbackDoc);
  } catch (firestoreError) {
    console.error("[feedback] Error writing to Firestore backup log:", firestoreError);
    return NextResponse.json(
      { error: "Failed to store feedback. Please try again later." },
      { status: 500 }
    );
  }

  // 8. Email Notification via Resend REST API (Native fetch, zero dependencies)
  const categoryLabel = CATEGORY_LABELS[category as FeedbackCategory];
  const userAgentHeader = req.headers.get("user-agent") ?? "Unknown";

  const viewport = sanitizeSingleLine(clientMeta.viewport, "Unknown");
  const route = sanitizeSingleLine(clientMeta.route ?? clientMeta.pathname, "Unknown");
  const userAgent = sanitizeSingleLine(clientMeta.userAgent ?? userAgentHeader, "Unknown");
  const userName = sanitizeSingleLine(session.user.name, "Anonymous");
  const userEmail = sanitizeSingleLine(session.user.email, "No email");
  const userId = sanitizeSingleLine(session.user.id);

  // Subject line sanitized against newline header injection
  const messageSnippet = sanitizeSingleLine(cleanMessage.slice(0, 60));
  const emailSubject = `[KeepCheck Feedback] ${categoryLabel}: ${messageSnippet}`;

  const plainTextBody = [
    `=== KeepCheck User Feedback ===`,
    ``,
    `Category: ${categoryLabel}`,
    `Submitted At: ${new Date().toISOString()}`,
    ``,
    `--- User Info ---`,
    `Name: ${userName}`,
    `Email: ${userEmail}`,
    `User ID: ${userId}`,
    ``,
    `--- Client Metadata ---`,
    `Route: ${route}`,
    `Viewport: ${viewport}`,
    `User Agent: ${userAgent}`,
    ``,
    `--- Feedback Message ---`,
    cleanMessage,
  ].join("\n");

  const resendApiKey = process.env.RESEND_API_KEY;
  const feedbackToEmail = process.env.FEEDBACK_TO_EMAIL;

  if (resendApiKey && feedbackToEmail) {
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "KeepCheck Feedback <onboarding@resend.dev>",
          to: feedbackToEmail,
          reply_to: session.user.email ?? undefined,
          subject: emailSubject,
          text: plainTextBody,
        }),
      });

      if (!resendRes.ok) {
        const errorText = await resendRes.text();
        console.error("[feedback] Resend API error:", resendRes.status, errorText);
      }
    } catch (resendError) {
      console.error("[feedback] Error calling Resend REST API:", resendError);
    }
  } else {
    console.warn(
      "[feedback] RESEND_API_KEY or FEEDBACK_TO_EMAIL not set. Feedback stored in Firestore only."
    );
  }

  return NextResponse.json({ ok: true });
}
