import { SEAL_ICON_VARIANTS, type SealIconVariant } from "@/components/seals/ProfessionalSealIcon";

export function parseSealIconVariant(v: string): SealIconVariant {
  return (SEAL_ICON_VARIANTS as readonly string[]).includes(v) ? (v as SealIconVariant) : "seal_default";
}
