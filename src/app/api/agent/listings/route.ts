import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { createCurrentAgentDraftListing } from "@/server/services/agent-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      amenities?: string[];
      area?: string;
      bathrooms?: number;
      bedrooms?: number;
      city?: string;
      description?: string;
      latitude?: number | null;
      longitude?: number | null;
      priceNaira?: number;
      propertyType?:
        | "self_contain"
        | "1_bedroom"
        | "2_bedroom"
        | "3_bedroom"
        | "shop"
        | "lodge_room";
      state?: string;
      title?: string;
    };

    const result = await createCurrentAgentDraftListing({
      amenities: body.amenities ?? [],
      area: body.area ?? "",
      bathrooms: body.bathrooms ?? 0,
      bedrooms: body.bedrooms ?? 0,
      city: body.city,
      description: body.description ?? "",
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      priceNaira: body.priceNaira ?? 0,
      propertyType: body.propertyType ?? "self_contain",
      state: body.state,
      title: body.title ?? "",
    });

    return NextResponse.json(
      {
        data: {
          id: result.listing.id,
          status: result.listing.status,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create draft listing.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message.includes("required") || message.includes("before") || message.includes("Invalid")
            ? 422
            : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "UNAUTHORIZED"
                : status === 422
                  ? "VALIDATION_ERROR"
                  : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
