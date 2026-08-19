import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { updateCurrentAgentDraftListing } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

    const { listingId } = await context.params;
    const result = await updateCurrentAgentDraftListing(listingId, {
      amenities: body.amenities,
      area: body.area,
      bathrooms: body.bathrooms,
      bedrooms: body.bedrooms,
      city: body.city,
      description: body.description,
      latitude: body.latitude,
      longitude: body.longitude,
      priceNaira: body.priceNaira,
      propertyType: body.propertyType,
      state: body.state,
      title: body.title,
    });

    return NextResponse.json({
      data: { id: result.listing.id, status: result.listing.status },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
