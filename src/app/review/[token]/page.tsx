import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Review, { type ReviewData } from "@/components/Review";
import { partsFor, supportsComments, textFor } from "@/lib/postOptions";
import { getReview } from "@/lib/posts";
import { getProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review post · PostGoblins",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await getReview(token);
  if (!review) notFound();
  const { post } = review;

  // One preview per distinct version of the text (platforms that share wording are grouped).
  const versions = new Map<string, ReviewData["versions"][number]>();
  for (const t of post.targets) {
    const parts = partsFor(t.provider, textFor(post.content, post.options, t.provider));
    const comment = supportsComments(t.provider) ? (post.options.firstComment ?? "") : "";
    const key = JSON.stringify([parts, comment]);
    const v = versions.get(key) ?? { parts, comment, accounts: [] };
    v.accounts.push({ provider: t.provider, platform: getProvider(t.provider).name, name: t.accountName });
    versions.set(key, v);
  }

  const data: ReviewData = {
    token,
    ownerName: review.ownerName,
    open: review.open,
    status: review.request.status,
    reviewerName: review.request.reviewerName,
    note: review.request.note,
    decidedAt: review.request.decidedAt,
    scheduledAt: post.scheduledAt,
    media: post.media.map((m) => ({ url: m.url, mime: m.mime })),
    youtubeTitle: post.targets.some((t) => t.provider === "youtube") ? (post.options.youtube?.title ?? null) : null,
    thumbnail: post.thumbnail?.url ?? null,
    versions: [...versions.values()],
  };
  return <Review data={data} />;
}
