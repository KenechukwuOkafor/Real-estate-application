import { appEnv } from "@/lib/env";

export function buildCanonicalListingUrl(slug: string, publicId: string) {
  return `${appEnv.appUrl()}/listings/${slug}--${publicId}`;
}
