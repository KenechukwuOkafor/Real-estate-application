import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
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
        data: { id: result.listing.id, status: result.listing.status },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
