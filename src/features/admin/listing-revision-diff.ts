import { formatPriceNaira } from "@/features/listings/format";
import { formatRentalDuration } from "@/features/listings/rental-duration";

/**
 * What a revision would change, and nothing else.
 *
 * Reviewing a change is a different task from reviewing a listing. The question
 * is "is this edit acceptable", and the answer lives in the difference — a
 * moderator asked to re-read a listing they already approved, to find the one
 * line that moved, will eventually stop reading and start clicking approve.
 *
 * Pure and separate from the component so the comparison is testable without
 * rendering: which fields count as changed is a correctness question, not a
 * presentation one, and a field that silently fails to appear here is a change
 * that ships unreviewed.
 */

export type RevisionComparable = {
  amenities: string[];
  description: string;
  priceNaira: number;
  rentalDuration: "yearly" | "monthly" | "sublet";
  subletMonths: number | null;
  title: string;
};

export type FieldChange = {
  after: string;
  before: string;
  label: string;
};

function amenitiesText(amenities: string[]) {
  return amenities.length > 0 ? amenities.join(", ") : "none";
}

/**
 * Compares the fields a revision may carry.
 *
 * Deliberately enumerated rather than derived by iterating keys: the editable
 * set is a product decision, and a diff built by reflection would silently grow
 * a row the moment somebody added a column.
 */
export function listingRevisionDiff(
  current: RevisionComparable,
  proposed: RevisionComparable,
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (current.title !== proposed.title) {
    changes.push({ after: proposed.title, before: current.title, label: "Title" });
  }

  if (current.description !== proposed.description) {
    changes.push({
      after: proposed.description,
      before: current.description,
      label: "Description",
    });
  }

  if (current.priceNaira !== proposed.priceNaira) {
    changes.push({
      after: formatPriceNaira(proposed.priceNaira),
      before: formatPriceNaira(current.priceNaira),
      label: "Price",
    });
  }

  // Duration and its month count move together, so they read as one change.
  // Two rows saying "yearly became sublet" and "null became 6" is the pairing
  // presented as a coincidence.
  if (
    current.rentalDuration !== proposed.rentalDuration ||
    current.subletMonths !== proposed.subletMonths
  ) {
    changes.push({
      after: formatRentalDuration(proposed.rentalDuration, proposed.subletMonths),
      before: formatRentalDuration(current.rentalDuration, current.subletMonths),
      label: "Duration",
    });
  }

  if (amenitiesText(current.amenities) !== amenitiesText(proposed.amenities)) {
    changes.push({
      after: amenitiesText(proposed.amenities),
      before: amenitiesText(current.amenities),
      label: "Amenities",
    });
  }

  return changes;
}
