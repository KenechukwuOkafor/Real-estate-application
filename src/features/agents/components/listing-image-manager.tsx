"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCopyForResponse } from "@/features/errors/error-copy";

type ManagedImage = {
  id: string;
  isCover: boolean;
  position: number;
  url: string | null;
};

type ListingImageManagerProps = {
  images: ManagedImage[];
  listingId: string;
};

/**
 * The photos already on a listing, with a way to take one back.
 *
 * Uploading existed and removing did not, which is a worse position than the
 * reverse: an agent who adds the wrong photo is stuck with it, in public, once
 * the listing goes live.
 *
 * Removing the cover promotes the next image server-side, in the same
 * statement. The response says which image was promoted, and this refreshes
 * rather than patching local state, because the promotion is a change the user
 * did not ask for and showing a stale cover would misrepresent what the listing
 * now looks like.
 */
export function ListingImageManager({ images, listingId }: ListingImageManagerProps) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRemove(imageId: string) {
    setRemovingId(imageId);
    setError(null);

    const response = await fetch(
      `/api/agent/listings/${listingId}/images/${imageId}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setRemovingId(null);
      return;
    }

    setRemovingId(null);
    router.refresh();
  }

  if (images.length === 0) {
    return (
      <p className="text-sm text-stone-600">
        No photos yet. A listing needs at least three before it can be submitted.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image) => (
          <li
            key={image.id}
            className="relative overflow-hidden rounded-2xl border border-stone-900/10 bg-stone-100"
          >
            <div className="aspect-[4/3]">
              {image.url ? (
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  src={image.url}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-stone-500">
                  Preview unavailable
                </div>
              )}
            </div>

            {/*
              The cover is marked because removing it has a consequence the
              agent should be able to anticipate: another photo takes its place.
            */}
            {image.isCover ? (
              <span className="absolute left-2 top-2 rounded-full bg-stone-900/85 px-2.5 py-1 text-xs font-medium text-white">
                Cover
              </span>
            ) : null}

            <button
              className="absolute right-2 top-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
              disabled={removingId !== null}
              onClick={() => onRemove(image.id)}
              type="button"
            >
              {removingId === image.id ? "Removing..." : "Remove"}
            </button>
          </li>
        ))}
      </ul>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
